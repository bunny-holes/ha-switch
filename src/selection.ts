import { PoolError } from "./errors.ts";
import type { AccountRow } from "./types.ts";
import { remainingUsage, usageBlocked, usageWindow } from "./usage-state.ts";

export interface CodexSelectionPolicy {
  priority?: number[];
  minimumFiveHourRemaining?: number;
  fallback?: number;
  minimumFallbackWeeklyRemaining?: number;
}

export function validateCodexSelectionPolicy(
  value: unknown,
): asserts value is CodexSelectionPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PoolError("selection_policy_invalid");
  const policy = value as Record<string, unknown>;
  if (
    Object.keys(policy).some(
      (key) =>
        ![
          "priority",
          "minimumFiveHourRemaining",
          "fallback",
          "minimumFallbackWeeklyRemaining",
        ].includes(key),
    )
  )
    throw new PoolError("selection_policy_invalid");
  if (
    policy.priority !== undefined &&
    (!Array.isArray(policy.priority) ||
      policy.priority.length === 0 ||
      policy.priority.some((number) => !Number.isSafeInteger(number) || number < 1) ||
      new Set(policy.priority).size !== policy.priority.length)
  )
    throw new PoolError("selection_policy_invalid");
  if (
    policy.fallback !== undefined &&
    (!Number.isSafeInteger(policy.fallback) || (policy.fallback as number) < 1)
  )
    throw new PoolError("selection_policy_invalid");
  for (const key of ["minimumFiveHourRemaining", "minimumFallbackWeeklyRemaining"]) {
    const percent = policy[key];
    if (
      percent !== undefined &&
      (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100)
    )
      throw new PoolError("selection_policy_invalid");
  }
}

export function selectCodexAccount(
  accounts: readonly string[],
  rows: readonly AccountRow[],
  policy: CodexSelectionPolicy = {},
  now = Date.now(),
): string {
  validateCodexSelectionPolicy(policy);
  const priority = policy.priority ?? [2, 3];
  const minimum = policy.minimumFiveHourRemaining ?? 10;
  const fallback = policy.fallback ?? 1;
  const floor = policy.minimumFallbackWeeklyRemaining ?? 20;
  const rowAt = (number: number) => rows.find((row) => row.account === accounts[number - 1]);
  const usable = (row: AccountRow | undefined): row is AccountRow =>
    !!row && row.authenticated !== false && !row.resetError && !usageBlocked(row, now);
  const candidates = priority.flatMap((number) => {
    const row = rowAt(number);
    if (!usable(row)) return [];
    const five = remainingUsage(usageWindow(row.rateLimits, 300));
    const weekly = remainingUsage(usageWindow(row.rateLimits, 10080));
    return five !== null && five >= minimum && (weekly === null || weekly > 0)
      ? [{ account: row.account, five, weekly }]
      : [];
  });
  candidates.sort((a, b) => b.five - a.five || (b.weekly ?? -1) - (a.weekly ?? -1));
  if (candidates[0]) return candidates[0].account;
  const row = rowAt(fallback);
  const weekly = remainingUsage(usageWindow(row?.rateLimits, 10080));
  if (usable(row) && weekly !== null && weekly > floor) return row.account;
  throw new PoolError("no_available_account");
}
