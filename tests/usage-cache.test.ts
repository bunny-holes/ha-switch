import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountRow } from "../src/types.ts";
import {
  applyUsageCache,
  isUsageStale,
  readUsageCache,
  sanitizeRateLimits,
  saveUsageCache,
  usageCachePath,
} from "../src/usage-cache.ts";

const NOW = 1_800_000_000_000;
const paths: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "ha-switch-cache-"));
  paths.push(path);
  return path;
}
afterEach(async () => {
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

const limits = (five: number, resetIn: number) => ({
  planType: "plus",
  primary: { windowDurationMins: 300, usedPercent: 100 - five, resetsAt: NOW / 1000 + resetIn },
  secondary: { windowDurationMins: 10080, usedPercent: 40 },
  rateLimitReachedType: null,
});

test("saving keeps only allowed fields and failures preserve the last good value", async () => {
  const path = usageCachePath(await temporary());
  const rows: AccountRow[] = [
    {
      account: "work",
      rateLimits: { ...limits(74, 3600), secret: "token" } as never,
      resetCredits: 2,
      plan: "plus",
    },
    { account: "personal", resetError: "codex_usage_query_failed" },
    { account: "spare", credentialError: "keychain_locked" },
    { account: "empty" },
  ];
  await saveUsageCache(path, "codex", "default", rows, NOW);
  const text = await Bun.file(path).text();
  expect(text).not.toContain("token");
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  const cache = await readUsageCache(path);
  expect(Object.keys(cache)).toEqual(["codex/default/work", "codex/default/personal"]);
  expect(cache["codex/default/work"]).toEqual({
    fetchedAt: NOW,
    plan: "plus",
    resetCredits: 2,
    rateLimits: {
      planType: "plus",
      primary: { windowDurationMins: 300, usedPercent: 26, resetsAt: NOW / 1000 + 3600 },
      secondary: { windowDurationMins: 10080, usedPercent: 40 },
    },
  });
  expect(cache["codex/default/personal"]).toEqual({
    lastError: { code: "codex_usage_query_failed", at: NOW },
  });
  await saveUsageCache(
    path,
    "codex",
    "default",
    [{ account: "work", resetError: "codex_reset_query_timeout" }],
    NOW + 60000,
  );
  const after = await readUsageCache(path);
  expect(after["codex/default/work"]).toMatchObject({
    fetchedAt: NOW,
    resetCredits: 2,
    lastError: { code: "codex_reset_query_timeout", at: NOW + 60000 },
  });
  await saveUsageCache(
    path,
    "codex",
    "default",
    [{ account: "work", rateLimits: limits(50, 100), resetCredits: 1 }],
    NOW + 120000,
  );
  expect((await readUsageCache(path))["codex/default/work"].lastError).toBeUndefined();
});

test("applying fills unknown rows, flags staleness after an hour or a passed reset, and keeps live rows", async () => {
  const cache = {
    "codex/default/work": {
      fetchedAt: NOW - 240000,
      resetCredits: 2,
      rateLimits: limits(74, 3600),
    },
    "codex/default/old": {
      fetchedAt: NOW - 2 * 3600000,
      resetCredits: 0,
      rateLimits: limits(10, 3600),
    },
    "codex/default/reset": { fetchedAt: NOW - 600000, resetCredits: 0, rateLimits: limits(0, -60) },
    "codex/default/failed": {
      fetchedAt: NOW - 600000,
      resetCredits: 1,
      rateLimits: limits(30, 3600),
      lastError: { code: "claude_usage_http_429", at: NOW - 1000 },
    },
    "codex/default/recovered": {
      fetchedAt: NOW - 1000,
      resetCredits: 1,
      rateLimits: limits(30, 3600),
      lastError: { code: "claude_usage_http_429", at: NOW - 600000 },
    },
  };
  const rows: AccountRow[] = [
    { account: "work" },
    { account: "old" },
    { account: "reset" },
    { account: "failed" },
    { account: "recovered" },
    { account: "live", rateLimits: limits(99, 3600), resetCredits: 5, usageFetchedAt: NOW },
    { account: "none" },
  ];
  applyUsageCache(cache, "codex", "default", rows, NOW);
  expect(rows[0]).toMatchObject({ resetCredits: 2, usageFetchedAt: NOW - 240000, plan: "plus" });
  expect(rows[0].usageStale).toBeUndefined();
  expect(rows[1].usageStale).toBe(true);
  expect(rows[2].usageStale).toBe(true);
  expect(rows[3]).toMatchObject({ resetError: "claude_usage_http_429", resetCredits: 1 });
  expect(rows[4].resetError).toBeUndefined();
  expect(rows[5]).toMatchObject({ resetCredits: 5, usageFetchedAt: NOW });
  expect(rows[6]).toEqual({ account: "none" });
  expect(isUsageStale({ account: "x" }, NOW)).toBe(false);
});

test("unreadable or foreign cache files fail closed and sanitizing drops unknown keys", async () => {
  const path = usageCachePath(await temporary());
  for (const text of ["{", "[]", '{"version":1}', '{"version":1,"entries":{"bad key":{}}}']) {
    await Bun.write(path, text);
    await expect(readUsageCache(path)).rejects.toThrow("usage_cache_invalid");
  }
  await Bun.write(
    path,
    JSON.stringify({
      version: 1,
      entries: {
        "codex/default/a": { fetchedAt: "x" },
        "codex/default/b": {
          fetchedAt: 5,
          rateLimits: { primary: { usedPercent: "1", extra: 1 } },
        },
      },
    }),
  );
  expect(await readUsageCache(path)).toEqual({
    "codex/default/b": { fetchedAt: 5, rateLimits: { primary: {} } },
  });
  expect(
    sanitizeRateLimits({ planType: "<script>", primary: null, nested: { deep: true } } as never),
  ).toEqual({ primary: null });
  expect(await readUsageCache(join(await temporary(), "missing.json"))).toEqual({});
});
