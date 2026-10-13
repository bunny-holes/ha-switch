import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { AccountRow, Pool, RateLimits } from "./types.ts";

export interface UsageCacheEntry {
  resetCredits: number | null;
  rateLimits: RateLimits | null;
  fetchedAt: number;
}

type UsageCache = Record<string, UsageCacheEntry>;

function key(host: string, pool: Pool, account: string): string {
  return `${host}/${pool.name}/${account}`;
}

export async function readUsageCache(path: string): Promise<UsageCache> {
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  try {
    const value: unknown = await file.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return value as UsageCache;
  } catch {
    return {};
  }
}

async function atomicWrite(path: string, value: UsageCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let mode = 0o600;
  try {
    mode = (await stat(path)).mode & 0o777;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const file = await open(temporary, "wx", mode);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.close();
    await rename(temporary, path);
  } catch (error) {
    try {
      await file.close();
    } catch {
      // Keep the original failure. Cleanup below is best effort.
    }
    try {
      await unlink(temporary);
    } catch (cleanup) {
      if (!(cleanup instanceof Error && "code" in cleanup && cleanup.code === "ENOENT"))
        throw new AggregateError([error, cleanup], "usage_cache_cleanup_failed");
    }
    throw error;
  }
}

export async function saveUsageCache(
  path: string,
  host: string,
  pool: Pool,
  rows: readonly AccountRow[],
  fetchedAt = Date.now(),
): Promise<void> {
  const cache = await readUsageCache(path);
  for (const row of rows) {
    if (row.resetError || (!row.rateLimits && row.resetCredits == null)) continue;
    cache[key(host, pool, row.account)] = {
      resetCredits: row.resetCredits ?? null,
      rateLimits: row.rateLimits ?? null,
      fetchedAt,
    };
  }
  await atomicWrite(path, cache);
}

export function applyUsageCache(
  cache: UsageCache,
  host: string,
  pool: Pool,
  rows: AccountRow[],
  now = Date.now(),
): void {
  for (const row of rows) {
    const saved = cache[key(host, pool, row.account)];
    if (!saved || !Number.isFinite(saved.fetchedAt)) continue;
    if (row.resetError || (!row.rateLimits && row.resetCredits == null)) {
      row.rateLimits = saved.rateLimits;
      row.resetCredits = saved.resetCredits;
      row.usageFetchedAt = saved.fetchedAt;
      row.usageStale = true;
    }
    if (!row.usageFetchedAt) row.usageFetchedAt = saved.fetchedAt;
    if (now - saved.fetchedAt > 60 * 60 * 1000) row.usageStale = true;
  }
}

export function usageCachePath(directory: string): string {
  return `${directory}/usage-cache.json`;
}
