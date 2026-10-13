import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Host } from "./config.ts";
import { PoolError } from "./errors.ts";
import { logger } from "./log.ts";
import type { AccountRow, RateLimits, RateWindow } from "./types.ts";
import { usageWindows } from "./usage-state.ts";

export const USAGE_STALE_AFTER_MS = 60 * 60 * 1000;

export interface UsageCacheEntry {
  fetchedAt?: number;
  plan?: string | null;
  resetCredits?: number | null;
  rateLimits?: RateLimits | null;
  lastError?: { code: string; at: number };
}

export type UsageCache = Record<string, UsageCacheEntry>;

const log = logger("usage-cache");
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const safeCode = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value);
const safePlan = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,32}$/.test(value);

export function usageCachePath(directory: string): string {
  return join(directory, "usage-cache.json");
}

export function cacheKey(host: Host, pool: string, account: string): string {
  return `${host}/${pool}/${account}`;
}

function cleanWindow(value: unknown): RateWindow | null | undefined {
  if (value === null) return null;
  const window = record(value);
  if (!window) return undefined;
  const clean: RateWindow = {};
  if (finite(window.usedPercent)) clean.usedPercent = window.usedPercent;
  if (finite(window.windowDurationMins)) clean.windowDurationMins = window.windowDurationMins;
  if (finite(window.resetsAt)) clean.resetsAt = window.resetsAt;
  return clean;
}

export function sanitizeRateLimits(value: RateLimits | null | undefined): RateLimits | null {
  const limits = record(value);
  if (!limits) return null;
  const clean: RateLimits = {};
  if (safePlan(limits.planType)) clean.planType = limits.planType;
  else if (limits.planType === null) clean.planType = null;
  const primary = cleanWindow(limits.primary);
  const secondary = cleanWindow(limits.secondary);
  if (primary !== undefined) clean.primary = primary;
  if (secondary !== undefined) clean.secondary = secondary;
  if (safeCode(limits.rateLimitReachedType))
    clean.rateLimitReachedType = limits.rateLimitReachedType;
  return clean;
}

function cleanEntry(value: unknown): UsageCacheEntry | undefined {
  const entry = record(value);
  if (!entry) return undefined;
  const clean: UsageCacheEntry = {};
  if (finite(entry.fetchedAt) && entry.fetchedAt > 0) clean.fetchedAt = entry.fetchedAt;
  if (safePlan(entry.plan)) clean.plan = entry.plan;
  if (entry.resetCredits === null) clean.resetCredits = null;
  else if (Number.isSafeInteger(entry.resetCredits) && (entry.resetCredits as number) >= 0)
    clean.resetCredits = entry.resetCredits as number;
  if (entry.rateLimits !== undefined)
    clean.rateLimits = sanitizeRateLimits(entry.rateLimits as RateLimits | null);
  const failure = record(entry.lastError);
  if (failure && safeCode(failure.code) && finite(failure.at) && failure.at > 0)
    clean.lastError = { code: failure.code, at: failure.at };
  if (clean.fetchedAt === undefined && !clean.lastError) return undefined;
  return clean;
}

export async function readUsageCache(path: string): Promise<UsageCache> {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  let value: unknown;
  try {
    value = await file.json();
  } catch (cause) {
    log("read_invalid", { code: "usage_cache_invalid" }, "warn");
    throw new PoolError("usage_cache_invalid", undefined, { cause });
  }
  const root = record(value);
  if (root?.version !== 1 || !record(root.entries)) throw new PoolError("usage_cache_invalid");
  const cache: UsageCache = {};
  for (const [key, raw] of Object.entries(root.entries as Record<string, unknown>)) {
    if (!/^(codex|claude|agy)\/[A-Za-z0-9._-]{1,128}\/[A-Za-z0-9._-]{1,128}$/.test(key))
      throw new PoolError("usage_cache_invalid");
    const entry = cleanEntry(raw);
    if (entry) cache[key] = entry;
  }
  return cache;
}

async function writeCache(path: string, cache: UsageCache): Promise<void> {
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
    await file.writeFile(`${JSON.stringify({ version: 1, entries: cache }, null, 2)}\n`);
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
    throw new PoolError("usage_cache_write_failed", undefined, {
      cause: causes.length > 1 ? new AggregateError(causes) : error,
    });
  }
}

/** Records the outcome of live usage queries; failures keep the last good values. */
export async function saveUsageCache(
  path: string,
  host: Host,
  pool: string,
  rows: readonly AccountRow[],
  now: number,
): Promise<void> {
  let cache: UsageCache;
  try {
    cache = await readUsageCache(path);
  } catch (error) {
    if (!(error instanceof PoolError && error.code === "usage_cache_invalid")) throw error;
    log("reset_invalid", {}, "warn");
    cache = {};
  }
  for (const row of rows) {
    if (row.credentialError) continue;
    const key = cacheKey(host, pool, row.account);
    const before = cache[key] ?? {};
    if (row.resetError) {
      cache[key] = { ...before, lastError: { code: row.resetError, at: now } };
      continue;
    }
    if (row.rateLimits == null && row.resetCredits == null) continue;
    cache[key] = {
      fetchedAt: now,
      plan: row.rateLimits?.planType ?? row.plan ?? null,
      resetCredits: row.resetCredits ?? null,
      rateLimits: sanitizeRateLimits(row.rateLimits),
    };
  }
  await writeCache(path, cache);
  log("write_success", { count: rows.length }, "debug");
}

export function isUsageStale(row: AccountRow, now: number): boolean {
  const fetchedAt = row.usageFetchedAt;
  if (!fetchedAt) return false;
  if (now - fetchedAt > USAGE_STALE_AFTER_MS) return true;
  return usageWindows(row.rateLimits).some(
    (window) =>
      typeof window.resetsAt === "number" &&
      Number.isFinite(window.resetsAt) &&
      window.resetsAt * 1000 <= now &&
      window.resetsAt * 1000 >= fetchedAt,
  );
}

/** Fills rows that carry no live usage from the cache. Live rows keep their values. */
export function applyUsageCache(
  cache: UsageCache,
  host: Host,
  pool: string,
  rows: AccountRow[],
  now: number,
): void {
  for (const row of rows) {
    const saved = cache[cacheKey(host, pool, row.account)];
    if (!saved) continue;
    const live = !row.resetError && (row.rateLimits != null || row.resetCredits != null);
    if (!live && saved.fetchedAt) {
      row.rateLimits = saved.rateLimits ?? null;
      row.resetCredits = saved.resetCredits ?? null;
      row.plan ??= saved.plan ?? saved.rateLimits?.planType ?? null;
      row.usageFetchedAt = saved.fetchedAt;
    }
    if (!row.resetError && saved.lastError && saved.lastError.at > (saved.fetchedAt ?? 0))
      row.resetError = saved.lastError.code;
    if (!live && isUsageStale(row, now)) row.usageStale = true;
  }
}
