import { PoolError } from "./errors.ts";
import type { AccountListing, AccountRow, Pool, RateWindow } from "./types.ts";
import { remainingUsage, usageBlocked, usageWindow, usageWindows } from "./usage-state.ts";

export function accountAt(pool: Pool, text: string): string {
  const number = /^\d+$/.test(text) ? Number(text) : 0;
  if (!Number.isSafeInteger(number) || number < 1 || number > pool.accounts.length)
    throw new PoolError("account_number_invalid");
  return pool.accounts[number - 1];
}

function usageCells(row: AccountRow, now: number): string[] {
  if (row.credentialError) return ["확인 불가", "-", "-", "-", "-"];
  const windows = usageWindows(row.rateLimits);
  const windowFor = (minutes: number) => usageWindow(row.rateLimits, minutes);
  const left = (window?: RateWindow) => {
    const remaining = remainingUsage(window);
    return remaining === null ? "-" : `${remaining}%`;
  };
  const resets = (window?: RateWindow) => {
    if (typeof window?.resetsAt !== "number" || !Number.isFinite(window.resetsAt)) return "-";
    const date = new Date(window.resetsAt * 1000);
    return Number.isNaN(date.getTime())
      ? "-"
      : date.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
  };
  const blocked = usageBlocked(row, now);
  const known = windows.some(
    (w) => typeof w.usedPercent === "number" && Number.isFinite(w.usedPercent),
  );
  return [
    row.resetError
      ? "query failed"
      : row.authenticated === false
      ? "signed-out"
      : blocked
        ? "limited"
        : known
          ? "available"
          : row.authenticated === true
            ? "signed-in"
            : "unknown",
    left(windowFor(300)),
    resets(windowFor(300)),
    left(windowFor(10080)),
    resets(windowFor(10080)),
  ];
}

export function accountTable(
  pool: Pool,
  listing: AccountListing,
  options: { title?: string; command?: string; now?: number } = {},
): string {
  const rows = [
    [
      "",
      "#",
      "profile",
      "plan",
      "status",
      "5-hour left",
      "5-hour resets",
      "weekly left",
      "weekly resets",
      "reset credits",
    ],
    ...listing.accounts.map((row) => [
      row.account === listing.current ? "*" : "",
      String(pool.accounts.indexOf(row.account) + 1),
      row.account,
      row.rateLimits?.planType ?? row.plan ?? "-",
      ...usageCells(row, options.now ?? Date.now()),
      row.resetError
        ? "query failed"
        : row.resetCredits == null
          ? "unknown"
          : String(row.resetCredits),
    ]),
  ];
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => Bun.stringWidth(row[index]))),
  );
  const table = rows.map((row) =>
    row
      .map((cell, index) => cell + " ".repeat(widths[index] - Bun.stringWidth(cell)))
      .join("  ")
      .trimEnd(),
  );
  return [
    options.title ?? pool.name,
    "",
    ...table,
    "",
    listing.accounts.some((row) => row.credentialError)
      ? "Current profile cannot be checked. Previous usage was not saved; remaining usage is unknown."
      : listing.current
        ? "* current profile"
        : "Current profile is outside this list.",
    `Switch: ${options.command ?? "has -h <HARNESS> -s"} <NUMBER>`,
  ].join("\n");
}

export interface DashboardBlock {
  tool: string;
  pool: Pool;
  listing: AccountListing;
}

function shortReset(window: RateWindow | undefined, now: number): string {
  if (typeof window?.resetsAt !== "number" || !Number.isFinite(window.resetsAt)) return "-";
  const seconds = Math.round(window.resetsAt - now / 1000);
  if (seconds <= 0) return "now";
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) return `in ${Math.floor(hours / 24)}d`;
  if (hours > 0) return `in ${hours}h`;
  return `in ${Math.max(1, Math.floor(seconds / 60))}m`;
}

export function dashboardTable(blocks: readonly DashboardBlock[], now = Date.now()): string {
  const rows = [
    ["TOOL", "#", "NAME", "SHARED HOME", "5H LEFT", "5H RESET", "7D LEFT", "7D RESET", "CREDITS", "STATUS"],
    ...blocks.flatMap(({ tool, pool, listing }) =>
      listing.accounts.map((row) => {
        const primary = usageWindow(row.rateLimits, 300);
        const weekly = usageWindow(row.rateLimits, 10080);
        const age = row.usageFetchedAt
          ? ` · ${Math.max(0, Math.floor((now - row.usageFetchedAt) / 60000))}m ago`
          : "";
        const five = remainingUsage(primary);
        const seven = remainingUsage(weekly);
        return [
          tool,
          String(pool.accounts.indexOf(row.account) + 1),
          row.account,
          row.account === listing.current ? "current" : "—",
          five === null ? "?" : `${five}%`,
          shortReset(primary, now),
          seven === null ? "?" : `${seven}%`,
          shortReset(weekly, now),
          row.resetCredits == null ? "?" : String(row.resetCredits),
          `${row.resetError ? "query failed" : row.usageStale ? "stale" : row.usageFetchedAt ? "fresh" : "unknown"}${age}`,
        ];
      }),
    ),
  ];
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => Bun.stringWidth(row[index] ?? ""))),
  );
  const output = rows.map((row) =>
    row
      .map((cell, index) => `${cell}${" ".repeat(widths[index] - Bun.stringWidth(cell))}`)
      .join("  ")
      .trimEnd(),
  );
  return output.join("\n");
}

export function accountJson(
  tool: string,
  pool: Pool,
  listing: AccountListing,
  now = Date.now(),
): Record<string, unknown>[] {
  return listing.accounts.map((row) => {
    const primary = usageWindow(row.rateLimits, 300);
    const weekly = usageWindow(row.rateLimits, 10080);
    const iso = (seconds: number | undefined) =>
      typeof seconds === "number" && Number.isFinite(seconds)
        ? new Date(seconds * 1000).toISOString()
        : null;
    return {
      tool,
      pool: pool.name,
      number: pool.accounts.indexOf(row.account) + 1,
      name: row.account,
      current: row.account === listing.current,
      status: row.resetError
        ? "query_failed"
        : row.usageStale
          ? "stale"
          : row.usageFetchedAt
            ? "fresh"
            : row.authenticated === false
              ? "signed_out"
              : "unknown",
      usage: {
        fiveHourRemaining: remainingUsage(primary),
        fiveHourResetsAt: iso(primary?.resetsAt),
        weeklyRemaining: remainingUsage(weekly),
        weeklyResetsAt: iso(weekly?.resetsAt),
      },
      resetCredits: row.resetCredits ?? null,
      usageAgeSeconds: row.usageFetchedAt
        ? Math.max(0, Math.floor((now - row.usageFetchedAt) / 1000))
        : null,
    };
  });
}
