import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Host } from "./config.ts";
import { PoolError } from "./errors.ts";
import { logger } from "./log.ts";

export interface SelectionEntry {
  current?: string | null;
  previous?: string;
  checkedAt?: number;
}

export interface SelectionState {
  version: 1;
  selections: Record<string, SelectionEntry>;
}

const log = logger("state");
const empty = (): SelectionState => ({ version: 1, selections: {} });
const stateKey = (host: Host, pool: string) => `${host}/${pool}`;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const label = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value);
const time = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function selectionStatePath(directory: string): string {
  return join(directory, "state.json");
}

function parseState(value: unknown): SelectionState {
  const root = record(value);
  if (root?.version !== 1) throw new PoolError("state_invalid");
  const selections = record(root.selections);
  if (!selections) throw new PoolError("state_invalid");
  const parsed: SelectionState = empty();
  for (const [key, raw] of Object.entries(selections)) {
    const entry = record(raw);
    if (!entry || !/^(codex|claude|agy)\/[A-Za-z0-9._-]{1,128}$/.test(key))
      throw new PoolError("state_invalid");
    const clean: SelectionEntry = {};
    if (entry.current !== undefined) {
      if (entry.current !== null && !label(entry.current)) throw new PoolError("state_invalid");
      clean.current = entry.current;
    }
    if (entry.previous !== undefined) {
      if (!label(entry.previous)) throw new PoolError("state_invalid");
      clean.previous = entry.previous;
    }
    if (entry.checkedAt !== undefined) {
      if (!time(entry.checkedAt)) throw new PoolError("state_invalid");
      clean.checkedAt = entry.checkedAt;
    }
    parsed.selections[key] = clean;
  }
  return parsed;
}

export async function readSelectionState(path: string): Promise<SelectionState> {
  const file = Bun.file(path);
  if (!(await file.exists())) return empty();
  let value: unknown;
  try {
    value = await file.json();
  } catch (cause) {
    log("read_invalid", { code: "state_invalid" }, "warn");
    throw new PoolError("state_invalid", undefined, { cause });
  }
  return parseState(value);
}

export function selectionEntry(state: SelectionState, host: Host, pool: string): SelectionEntry {
  return state.selections[stateKey(host, pool)] ?? {};
}

async function writeState(path: string, state: SelectionState): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let mode = 0o600;
  try {
    mode = (await stat(path)).mode & 0o777;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const file = await open(temporary, "wx", mode);
  let closed = false;
  try {
    await file.writeFile(`${JSON.stringify(state, null, 2)}\n`);
    await file.close();
    closed = true;
    await rename(temporary, path);
  } catch (error) {
    const causes: unknown[] = [error];
    if (!closed) {
      try {
        await file.close();
      } catch (cleanup) {
        causes.push(cleanup);
      }
    }
    try {
      await unlink(temporary);
    } catch (cleanup) {
      if (!(cleanup instanceof Error && "code" in cleanup && cleanup.code === "ENOENT"))
        causes.push(cleanup);
    }
    throw new PoolError("state_write_failed", undefined, {
      cause: causes.length > 1 ? new AggregateError(causes) : error,
    });
  }
}

export type SelectionUpdate =
  | { kind: "selected"; account: string; at: number; before?: string }
  | { kind: "checked"; account: string | null; at: number }
  | { kind: "restored"; at: number };

export async function updateSelection(
  path: string,
  host: Host,
  pool: string,
  update: SelectionUpdate,
): Promise<SelectionEntry> {
  let state: SelectionState;
  try {
    state = await readSelectionState(path);
  } catch (error) {
    if (!(error instanceof PoolError && error.code === "state_invalid")) throw error;
    log("reset_invalid", {}, "warn");
    state = empty();
  }
  const key = stateKey(host, pool);
  const before = state.selections[key] ?? {};
  // The previous selection is the last known current that differs from the new one.
  const previousOf = (next: string | null | undefined) => {
    if (before.current && before.current !== next) return before.current;
    return before.previous && before.previous !== next ? before.previous : undefined;
  };
  const entry: SelectionEntry =
    update.kind === "selected"
      ? {
          current: update.account,
          previous:
            previousOf(update.account) ??
            (update.before && update.before !== update.account ? update.before : undefined),
          checkedAt: update.at,
        }
      : update.kind === "checked"
        ? {
            current: update.account,
            previous: before.current ? previousOf(update.account) : before.previous,
            checkedAt: update.at,
          }
        : { previous: previousOf(null) };
  for (const field of ["current", "previous", "checkedAt"] as const)
    if (entry[field] === undefined) delete entry[field];
  state.selections[key] = entry;
  await writeState(path, state);
  log("write_success", { kind: update.kind }, "debug");
  return entry;
}
