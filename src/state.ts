import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Host } from "./config.ts";

interface SelectionEntry {
  current?: string;
  previous?: string;
}

export interface SelectionState {
  version: 1;
  selections: Record<string, SelectionEntry>;
}

const empty = (): SelectionState => ({ version: 1, selections: {} });
const stateKey = (host: Host, pool: string) => `${host}/${pool}`;

export function selectionStatePath(directory: string): string {
  return `${directory}/state.json`;
}

export async function readSelectionState(path: string): Promise<SelectionState> {
  const file = Bun.file(path);
  if (!(await file.exists())) return empty();
  try {
    const value: unknown = await file.json();
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      (value as { version?: unknown }).version !== 1
    )
      return empty();
    const selections = (value as { selections?: unknown }).selections;
    return selections && typeof selections === "object" && !Array.isArray(selections)
      ? { version: 1, selections: selections as Record<string, SelectionEntry> }
      : empty();
  } catch {
    return empty();
  }
}

export function previousSelection(
  state: SelectionState,
  host: Host,
  pool: string,
): string | undefined {
  return state.selections[stateKey(host, pool)]?.previous;
}

export function currentSelection(
  state: SelectionState,
  host: Host,
  pool: string,
): string | undefined {
  return state.selections[stateKey(host, pool)]?.current;
}

export async function recordSelection(
  path: string,
  host: Host,
  pool: string,
  account: string,
): Promise<void> {
  const state = await readSelectionState(path);
  const key = stateKey(host, pool);
  const before = state.selections[key] ?? {};
  state.selections[key] = {
    previous: before.current && before.current !== account ? before.current : before.previous,
    current: account,
  };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "selection_state_cleanup_failed");
    }
    throw error;
  }
}
