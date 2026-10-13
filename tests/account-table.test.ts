import { describe, expect, test } from "bun:test";
import {
  type AccountView,
  accountJson,
  relativeAge,
  relativeReset,
  renderAccounts,
  usageStatus,
} from "../src/account-table.ts";
import type { AccountRow } from "../src/types.ts";

const NOW = Date.UTC(2026, 9, 12, 10, 30);
const limits = (five: number, weekly: number, resetIn = 3600) => ({
  primary: { windowDurationMins: 300, usedPercent: 100 - five, resetsAt: NOW / 1000 + resetIn },
  secondary: {
    windowDurationMins: 10080,
    usedPercent: 100 - weekly,
    resetsAt: NOW / 1000 + 2 * 86400,
  },
});
const view = (
  number: number,
  name: string,
  row: Partial<AccountRow>,
  extra: Partial<AccountView> = {},
): AccountView => ({
  tool: "codex",
  pool: "default",
  number,
  name,
  source: `/synthetic-home/.codex-${name}`,
  current: null,
  currentCheckedAt: null,
  row: { account: name, ...row },
  ...extra,
});

describe("account table", () => {
  test("statuses are derived in a fixed priority and never invent zero", () => {
    expect(usageStatus({ account: "a" }, NOW)).toBe("unknown");
    expect(
      usageStatus({ account: "a", credentialError: "keychain_locked", resetError: "x" }, NOW),
    ).toBe("unknown");
    expect(
      usageStatus(
        { account: "a", resetError: "codex_usage_query_failed", authenticated: false },
        NOW,
      ),
    ).toBe("query_failed");
    expect(usageStatus({ account: "a", authenticated: false }, NOW)).toBe("signed_out");
    expect(usageStatus({ account: "a", authenticated: true }, NOW)).toBe("unknown");
    expect(
      usageStatus({ account: "a", rateLimits: limits(74, 61), usageFetchedAt: NOW }, NOW),
    ).toBe("fresh");
    expect(usageStatus({ account: "a", rateLimits: limits(74, 61), usageStale: true }, NOW)).toBe(
      "stale",
    );
    expect(usageStatus({ account: "a", rateLimits: limits(0, 61, 720) }, NOW)).toBe("limited");
    expect(usageStatus({ account: "a", resetCredits: 0 }, NOW)).toBe("fresh");
  });

  test("relative times stay short and distinguish now from unknown", () => {
    expect(relativeReset(undefined, NOW)).toBe("—");
    expect(relativeReset({ resetsAt: NOW / 1000 - 1 }, NOW)).toBe("now");
    expect(relativeReset({ resetsAt: NOW / 1000 + 720 }, NOW)).toBe("in 12m");
    expect(relativeReset({ resetsAt: NOW / 1000 + 3600 * 5 }, NOW)).toBe("in 5h");
    expect(relativeReset({ resetsAt: NOW / 1000 + 86400 * 2 + 5 }, NOW)).toBe("in 2d");
    expect(relativeAge(null, NOW)).toBeNull();
    expect(relativeAge(NOW - 1000, NOW)).toBe("just now");
    expect(relativeAge(NOW - 4 * 60000, NOW)).toBe("4m ago");
    expect(relativeAge(NOW - 2 * 3600000, NOW)).toBe("2h ago");
    expect(relativeAge(NOW - 3 * 86400000, NOW)).toBe("3d ago");
  });

  test("wide layout renders the design columns with zero, unknown and failures apart", () => {
    const lines = renderAccounts(
      [
        view(
          1,
          "work",
          { rateLimits: limits(74, 61), resetCredits: 2, usageFetchedAt: NOW - 240000 },
          { current: true, currentCheckedAt: NOW - 240000 },
        ),
        view(
          2,
          "personal",
          { rateLimits: limits(0, 18, 720), resetCredits: 0, usageFetchedAt: NOW - 240000 },
          { current: false },
        ),
        view(3, "spare", { resetError: "codex_usage_query_failed" }),
      ],
      { now: NOW, tools: true },
    );
    expect(lines[0]).toBe(
      "TOOL   #  NAME      SHARED HOME       5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS",
    );
    expect(lines[1]).toBe(
      "codex  1  work      current · 4m ago  74%      in 1h     61%      in 2d     2        fresh · 4m ago",
    );
    expect(lines[2]).toBe(
      "codex  2  personal  —                 0%       in 12m    18%      in 2d     0        limited · 4m ago",
    );
    expect(lines[3]).toBe(
      "codex  3  spare     unknown           ?        —         ?        —         ?        query failed",
    );
  });

  test("sources fold first, then the weekly reset, then the compact layout with sublines", () => {
    const views = [
      view(
        1,
        "work",
        { rateLimits: limits(74, 61), resetCredits: 2, usageFetchedAt: NOW - 240000 },
        { current: true, currentCheckedAt: NOW - 240000 },
      ),
      view(
        2,
        "personal",
        {
          rateLimits: limits(0, 18, 720),
          resetCredits: 0,
          usageFetchedAt: NOW - 2 * 3600000,
          usageStale: true,
        },
        { current: false },
      ),
    ];
    const full = renderAccounts(views, { now: NOW, sources: true, home: "/synthetic-home" });
    expect(full).toContain("SOURCE");
    expect(full).toContain("1  ~/.codex-work");
    const deep = views.map((item) => ({
      ...item,
      source: `/synthetic-home/${"deeply/".repeat(14)}.codex-${item.name}`,
    }));
    const noSources = renderAccounts(deep, { now: NOW, sources: true, width: 95 });
    expect(noSources.join("\n")).not.toContain("SOURCE");
    expect(noSources[0]).toContain("7D RESET");
    expect(noSources[0]).toContain("STATUS");
    const noWeekly = renderAccounts(views, { now: NOW, sources: true, width: 84 });
    expect(noWeekly[0]).not.toContain("7D RESET");
    expect(noWeekly[0]).toContain("STATUS");
    for (const line of noWeekly) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(84);
    const compact = renderAccounts(views, { now: NOW, sources: true, width: 56 });
    expect(compact[0]).toBe("#  NAME      HOME  5H   RESET   7D   CR");
    expect(compact[1]).toBe("1  work      *     74%  in 1h   61%  2");
    expect(compact[2]).toBe("2  personal  —     0%   in 12m  18%  0");
    expect(compact[3]).toBe("* last checked shared home · 4m ago");
    expect(compact[4]).toBe("  2 personal: stale · 2h ago");
    for (const line of compact) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(56);
  });

  test("long names are truncated instead of breaking the width budget", () => {
    const lines = renderAccounts(
      [view(1, "an-extraordinarily-long-profile-label-that-never-ends", {})],
      { now: NOW, width: 40 },
    );
    for (const line of lines) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(40);
    expect(lines[1]).toContain("…");
  });

  test("color is applied after padding and only when requested", () => {
    const plain = renderAccounts([view(1, "work", {}, { current: true })], { now: NOW });
    const colored = renderAccounts([view(1, "work", {}, { current: true })], {
      now: NOW,
      color: true,
    });
    expect(plain.join("\n")).not.toContain("\u001b[");
    expect(colored[1]).toContain("\u001b[32mcurrent");
    const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    expect(colored[1].replaceAll(ansiEscape, "")).toBe(plain[1]);
  });

  test("JSON rows keep ISO times, nulls for unknown values and the safe error code", () => {
    const row = accountJson(
      view(
        1,
        "work",
        {
          rateLimits: limits(74, 61),
          resetCredits: 2,
          usageFetchedAt: NOW - 240000,
          plan: "plus",
          authenticated: true,
        },
        { current: true, currentCheckedAt: NOW - 60000 },
      ),
      NOW,
    );
    expect(row).toEqual({
      tool: "codex",
      pool: "default",
      number: 1,
      name: "work",
      source: "/synthetic-home/.codex-work",
      current: true,
      currentCheckedAt: new Date(NOW - 60000).toISOString(),
      authenticated: true,
      plan: "plus",
      status: "fresh",
      usage: {
        fiveHourRemaining: 74,
        fiveHourResetsAt: new Date(NOW + 3600000).toISOString(),
        weeklyRemaining: 61,
        weeklyResetsAt: new Date(NOW + 2 * 86400000).toISOString(),
      },
      resetCredits: 2,
      usageFetchedAt: new Date(NOW - 240000).toISOString(),
      usageAgeSeconds: 240,
      queryError: null,
    });
    const failed = accountJson(
      view(2, "spare", { resetError: "claude_usage_http_429", resetCredits: 0 }),
      NOW,
    );
    expect(failed).toMatchObject({
      status: "query_failed",
      queryError: "claude_usage_http_429",
      resetCredits: 0,
      current: null,
    });
    expect(failed.usage).toEqual({
      fiveHourRemaining: null,
      fiveHourResetsAt: null,
      weeklyRemaining: null,
      weeklyResetsAt: null,
    });
  });
});
