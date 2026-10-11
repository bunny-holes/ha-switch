import type { AccountRow, RateLimits, RateWindow } from "./types.ts";

export function usageWindows(limits: RateLimits | null | undefined): RateWindow[] {
  return [limits?.primary, limits?.secondary].filter(
    (window): window is RateWindow => window != null,
  );
}

export function usageWindow(
  limits: RateLimits | null | undefined,
  minutes: number,
): RateWindow | undefined {
  return usageWindows(limits).find((window) => window.windowDurationMins === minutes);
}

export function remainingUsage(window: RateWindow | undefined): number | null {
  return typeof window?.usedPercent === "number" && Number.isFinite(window.usedPercent)
    ? Math.max(0, Math.min(100, 100 - window.usedPercent))
    : null;
}

export function usageBlocked(row: AccountRow, now: number): boolean {
  return (
    row.rateLimits?.rateLimitReachedType != null ||
    usageWindows(row.rateLimits).some(
      (window) =>
        typeof window.usedPercent === "number" &&
        window.usedPercent >= 100 &&
        (typeof window.resetsAt !== "number" ||
          !Number.isFinite(window.resetsAt) ||
          window.resetsAt * 1000 > now),
    )
  );
}
