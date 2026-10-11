import { PoolError } from "./errors.ts";
import type { AccountListing, AccountRow, Pool, RateWindow } from "./types.ts";

export function accountAt(pool: Pool, text: string): string {
  const number = /^\d+$/.test(text) ? Number(text) : 0;
  if (!Number.isSafeInteger(number) || number < 1 || number > pool.accounts.length)
    throw new PoolError("account_number_invalid");
  return pool.accounts[number - 1];
}

function usageCells(row: AccountRow, now: number): string[] {
  if (row.resetError) return ["query failed", "-", "-", "-", "-"];
  const windows = [row.rateLimits?.primary, row.rateLimits?.secondary].filter(
    (window): window is RateWindow => window != null,
  );
  const windowFor = (minutes: number) => windows.find((w) => w.windowDurationMins === minutes);
  const left = (window?: RateWindow) =>
    typeof window?.usedPercent === "number" && Number.isFinite(window.usedPercent)
      ? `${Math.max(0, Math.min(100, 100 - window.usedPercent))}%`
      : "-";
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
  const blocked =
    row.rateLimits?.rateLimitReachedType != null ||
    windows.some(
      (w) =>
        typeof w.usedPercent === "number" &&
        w.usedPercent >= 100 &&
        (typeof w.resetsAt !== "number" || !Number.isFinite(w.resetsAt) || w.resetsAt * 1000 > now),
    );
  const known = windows.some(
    (w) => typeof w.usedPercent === "number" && Number.isFinite(w.usedPercent),
  );
  return [
    row.authenticated === false
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
      "account",
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
    listing.current ? "* current account" : "Current account is outside this list.",
    `Switch: ${options.command ?? "bunx @bunny-holes/ha-switch switch"} <NUMBER>`,
  ].join("\n");
}
