import { describe, expect, test } from "bun:test";
import { selectCodexAccount, validateCodexSelectionPolicy } from "../src/selection.ts";
import type { AccountRow } from "../src/types.ts";
import { remainingUsage, usageBlocked, usageWindow } from "../src/usage-state.ts";

const accounts = ["sample-a", "sample-b", "sample-c"];
function row(number: number, five: number, weekly: number): AccountRow {
  return {
    account: accounts[number - 1],
    authenticated: true,
    rateLimits: {
      primary: { windowDurationMins: 300, usedPercent: 100 - five },
      secondary: { windowDurationMins: 10080, usedPercent: 100 - weekly },
    },
  };
}

describe("Codex account selection", () => {
  test("prefers the largest five-hour balance and then weekly balance", () => {
    expect(selectCodexAccount(accounts, [row(1, 100, 100), row(2, 15, 90), row(3, 20, 30)])).toBe(
      "sample-c",
    );
    expect(selectCodexAccount(accounts, [row(2, 20, 30), row(3, 20, 40)])).toBe("sample-c");
    expect(selectCodexAccount(accounts, [row(2, 20, 40), row(3, 20, 40)])).toBe("sample-b");
  });
  test("includes exactly ten percent but rejects both short accounts", () => {
    expect(selectCodexAccount(accounts, [row(1, 100, 21), row(2, 10, 30), row(3, 9.9, 30)])).toBe(
      "sample-b",
    );
    expect(selectCodexAccount(accounts, [row(1, 1, 21), row(2, 9.9, 30), row(3, 9, 30)])).toBe(
      "sample-a",
    );
  });
  test("fallback must have more than twenty percent weekly", () => {
    for (const weekly of [20, 19, 0])
      expect(() => selectCodexAccount(accounts, [row(1, 100, weekly)])).toThrow(
        "no_available_account",
      );
    expect(selectCodexAccount(accounts, [row(1, 100, 20.1)])).toBe("sample-a");
  });
  test("unknown and query failures never count as known remaining usage", () => {
    const unknown: AccountRow = { account: "sample-b", authenticated: true };
    const failed = { ...row(3, 90, 90), resetError: "synthetic_query_failure" };
    expect(() => selectCodexAccount(accounts, [unknown, failed])).toThrow("no_available_account");
    expect(() =>
      selectCodexAccount(accounts, [{ account: "sample-a", authenticated: true }]),
    ).toThrow("no_available_account");
    const noWeekly = row(2, 10, 50);
    noWeekly.rateLimits!.secondary = null;
    expect(selectCodexAccount(accounts, [noWeekly])).toBe("sample-b");
  });
  test("rejects signed-out, active limits and exhausted weekly usage", () => {
    const signedOut = { ...row(2, 80, 80), authenticated: false };
    const limited = row(3, 90, 90);
    limited.rateLimits!.rateLimitReachedType = "synthetic_limit";
    expect(() => selectCodexAccount(accounts, [signedOut, limited])).toThrow(
      "no_available_account",
    );
    expect(() => selectCodexAccount(accounts, [row(2, 90, 0)])).toThrow("no_available_account");
  });
  test("policy changes thresholds, candidate priority and fallback", () => {
    expect(
      selectCodexAccount(accounts, [row(1, 5, 40), row(2, 5, 40)], {
        priority: [1],
        minimumFiveHourRemaining: 5,
        fallback: 2,
        minimumFallbackWeeklyRemaining: 30,
      }),
    ).toBe("sample-a");
    expect(
      selectCodexAccount(accounts, [row(2, 1, 31)], {
        priority: [3],
        fallback: 2,
        minimumFallbackWeeklyRemaining: 30,
      }),
    ).toBe("sample-b");
    expect(
      selectCodexAccount(accounts, [row(2, 20, 40), row(3, 20, 40)], { priority: [3, 2] }),
    ).toBe("sample-c");
  });
  test("rejects invalid policy rather than choosing silently", () => {
    for (const policy of [
      null,
      [],
      { priority: [] },
      { priority: [2, 2] },
      { priority: [0] },
      { fallback: 1.5 },
      { minimumFiveHourRemaining: NaN },
      { minimumFiveHourRemaining: 101 },
      { minimumFallbackWeeklyRemaining: -1 },
      { extra: true },
    ])
      expect(() => validateCodexSelectionPolicy(policy)).toThrow("selection_policy_invalid");
  });
  test("matches display windows and percentages regardless of primary order", () => {
    const limits = {
      primary: { windowDurationMins: 10080, usedPercent: 120 },
      secondary: { windowDurationMins: 300, usedPercent: -10 },
    };
    expect(remainingUsage(usageWindow(limits, 300))).toBe(100);
    expect(remainingUsage(usageWindow(limits, 10080))).toBe(0);
    expect(remainingUsage(undefined)).toBeNull();
    expect(remainingUsage({ usedPercent: NaN })).toBeNull();
    expect(
      usageBlocked(
        { account: "sample-a", rateLimits: { primary: { usedPercent: 100, resetsAt: 1 } } },
        2000,
      ),
    ).toBe(false);
    expect(
      usageBlocked(
        { account: "sample-a", rateLimits: { primary: { usedPercent: 100, resetsAt: 3 } } },
        2000,
      ),
    ).toBe(true);
  });
});
