import type { Host } from "./config.ts";
import { TOOL_TITLE } from "./messages.ts";
import type { AccountRow, RateWindow } from "./types.ts";
import { remainingUsage, usageBlocked, usageWindow } from "./usage-state.ts";

export type UsageStatus = "fresh" | "stale" | "limited" | "query_failed" | "signed_out" | "unknown";

/** One account as the dashboard, list, and JSON see it. Never carries secrets. */
export interface AccountView {
  tool: Host;
  pool: string;
  number: number;
  name: string;
  source: string | null;
  current: boolean | null;
  currentCheckedAt: number | null;
  row: AccountRow;
}

export function usageStatus(row: AccountRow, now: number): UsageStatus {
  if (row.credentialError) return "unknown";
  if (row.resetError) return "query_failed";
  if (row.authenticated === false) return "signed_out";
  const known =
    remainingUsage(usageWindow(row.rateLimits, 300)) !== null ||
    remainingUsage(usageWindow(row.rateLimits, 10080)) !== null ||
    row.resetCredits != null;
  if (!known) return "unknown";
  if (row.usageStale) return "stale";
  if (usageBlocked(row, now)) return "limited";
  return "fresh";
}

export function relativeAge(from: number | null | undefined, now: number): string | null {
  if (!from) return null;
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function relativeReset(window: RateWindow | undefined, now: number): string {
  if (typeof window?.resetsAt !== "number" || !Number.isFinite(window.resetsAt)) return "—";
  const seconds = Math.round(window.resetsAt - now / 1000);
  if (seconds <= 0) return "now";
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) return `in ${Math.floor(hours / 24)}d`;
  if (hours > 0) return `in ${hours}h`;
  return `in ${Math.max(1, Math.floor(seconds / 60))}m`;
}

const STATUS_TEXT: Record<UsageStatus, string> = {
  fresh: "fresh",
  stale: "stale",
  limited: "limited",
  query_failed: "query failed",
  signed_out: "signed out",
  unknown: "unknown",
};

function statusCell(view: AccountView, now: number): string {
  const status = usageStatus(view.row, now);
  const age = status === "signed_out" ? null : relativeAge(view.row.usageFetchedAt, now);
  return age ? `${STATUS_TEXT[status]} · ${age}` : STATUS_TEXT[status];
}

const percent = (value: number | null) => (value === null ? "?" : `${value}%`);

function sharedCell(view: AccountView, now: number, compact: boolean): string {
  if (view.current === null) return compact ? "?" : "unknown";
  if (!view.current) return "—";
  const age = relativeAge(view.currentCheckedAt, now);
  return compact ? "*" : age ? `current · ${age}` : "current";
}

export interface RenderOptions {
  now: number;
  /** Terminal width; undefined renders the widest layout. */
  width?: number;
  color?: boolean;
  /** Show the TOOL column (dashboard) instead of one tool per table (list). */
  tools?: boolean;
  /** Append the SOURCE block (list only). */
  sources?: boolean;
  home?: string;
}

type Paint = (text: string, code: string) => string;

interface Column {
  header: string;
  cell: (view: AccountView) => string;
  color?: (view: AccountView, text: string) => string;
}

const ANSI = { green: "32", yellow: "33", red: "31", dim: "2" };

function columns(
  options: RenderOptions,
  compact: boolean,
  weeklyReset: boolean,
  paint: Paint,
): Column[] {
  const { now } = options;
  const five = (view: AccountView) => remainingUsage(usageWindow(view.row.rateLimits, 300));
  const seven = (view: AccountView) => remainingUsage(usageWindow(view.row.rateLimits, 10080));
  const left = (value: (view: AccountView) => number | null) => (view: AccountView, text: string) =>
    value(view) === 0 ? paint(text, ANSI.red) : value(view) === null ? paint(text, ANSI.dim) : text;
  const list: Column[] = [];
  if (options.tools) list.push({ header: "TOOL", cell: (view) => view.tool });
  list.push(
    { header: "#", cell: (view) => String(view.number) },
    { header: "NAME", cell: (view) => view.name },
    {
      header: compact ? "HOME" : "SHARED HOME",
      cell: (view) => sharedCell(view, now, compact),
      color: (view, text) =>
        view.current
          ? paint(text, ANSI.green)
          : view.current === null
            ? paint(text, ANSI.dim)
            : text,
    },
    { header: compact ? "5H" : "5H LEFT", cell: (view) => percent(five(view)), color: left(five) },
    {
      header: compact ? "RESET" : "5H RESET",
      cell: (view) => relativeReset(usageWindow(view.row.rateLimits, 300), now),
    },
    {
      header: compact ? "7D" : "7D LEFT",
      cell: (view) => percent(seven(view)),
      color: left(seven),
    },
  );
  if (!compact && weeklyReset)
    list.push({
      header: "7D RESET",
      cell: (view) => relativeReset(usageWindow(view.row.rateLimits, 10080), now),
    });
  list.push({
    header: compact ? "CR" : "CREDITS",
    cell: (view) => (view.row.resetCredits == null ? "?" : String(view.row.resetCredits)),
  });
  if (!compact)
    list.push({
      header: "STATUS",
      cell: (view) => statusCell(view, now),
      color: (view, text) => {
        const status = usageStatus(view.row, now);
        if (status === "query_failed" || status === "signed_out") return paint(text, ANSI.red);
        if (status === "stale" || status === "limited") return paint(text, ANSI.yellow);
        return status === "unknown" ? paint(text, ANSI.dim) : text;
      },
    });
  return list;
}

function truncate(text: string, width: number): string {
  if (Bun.stringWidth(text) <= width) return text;
  let kept = "";
  for (const character of text) {
    if (Bun.stringWidth(kept + character) > Math.max(1, width - 1)) break;
    kept += character;
  }
  return `${kept}…`;
}

function layout(
  views: readonly AccountView[],
  defs: Column[],
  paint: Paint,
  width: number | undefined,
): { lines: string[]; width: number } {
  const cells = views.map((view) => defs.map((column) => column.cell(view)));
  const widths = defs.map((column, index) =>
    Math.max(Bun.stringWidth(column.header), ...cells.map((row) => Bun.stringWidth(row[index]))),
  );
  const name = defs.findIndex((column) => column.header === "NAME");
  const total = () => widths.reduce((sum, value) => sum + value, 0) + (widths.length - 1) * 2;
  if (width !== undefined && name >= 0 && total() > width) {
    const excess = total() - width;
    widths[name] = Math.max(6, widths[name] - excess);
    for (const row of cells) row[name] = truncate(row[name], widths[name]);
  }
  const pad = (text: string, index: number) =>
    text + " ".repeat(Math.max(0, widths[index] - Bun.stringWidth(text)));
  const header = defs
    .map((column, index) => pad(column.header, index))
    .join("  ")
    .trimEnd();
  const lines = [
    paint(header, "1"),
    ...cells.map((row, rowIndex) =>
      row
        .map((text, index) => {
          const padded = pad(text, index);
          const color = defs[index].color;
          return color ? color(views[rowIndex], padded) : padded;
        })
        .join("  ")
        .trimEnd(),
    ),
  ];
  return { lines, width: total() };
}

export function abbreviateHome(path: string, home: string | undefined): string {
  return home && (path === home || path.startsWith(`${home}/`))
    ? `~${path.slice(home.length)}`
    : path;
}

/** Renders one table of accounts, folding columns until it fits the width. */
export function renderAccounts(views: readonly AccountView[], options: RenderOptions): string[] {
  const paint: Paint = options.color
    ? (text, code) => `\u001b[${code}m${text}\u001b[0m`
    : (text) => text;
  const { width } = options;
  // Fold order from the design: SOURCE first, then 7D RESET, then the compact layout.
  const attempts: { compact: boolean; sources: boolean; weeklyReset: boolean }[] = [
    { compact: false, sources: Boolean(options.sources), weeklyReset: true },
    { compact: false, sources: false, weeklyReset: true },
    { compact: false, sources: false, weeklyReset: false },
    { compact: true, sources: false, weeklyReset: false },
  ];
  let chosen: { compact: boolean; lines: string[] } | undefined;
  for (const attempt of attempts) {
    const defs = columns(options, attempt.compact, attempt.weeklyReset, paint);
    const rendered = layout(views, defs, paint, attempt.compact ? width : undefined);
    const sourceLines = attempt.sources ? sourceBlock(views, options.home) : [];
    const widest = Math.max(rendered.width, ...sourceLines.map((line) => Bun.stringWidth(line)));
    chosen = { compact: attempt.compact, lines: [...rendered.lines, ...sourceLines] };
    if (width === undefined || widest <= width) break;
  }
  const lines = chosen?.lines ?? [];
  if (chosen?.compact) {
    const checked = views
      .filter((view) => view.current)
      .map((view) => relativeAge(view.currentCheckedAt, options.now))
      .find((age) => age);
    if (views.some((view) => view.current))
      lines.push(`* last checked shared home${checked ? ` · ${checked}` : ""}`);
    for (const view of views) {
      const status = usageStatus(view.row, options.now);
      if (status !== "fresh")
        lines.push(
          truncate(
            `  ${view.number} ${view.name}: ${statusCell(view, options.now)}`,
            width ?? Infinity,
          ),
        );
    }
  }
  return lines;
}

function sourceBlock(views: readonly AccountView[], home: string | undefined): string[] {
  const width = Math.max(...views.map((view) => String(view.number).length));
  return [
    "",
    "SOURCE",
    ...views.map(
      (view) =>
        `${String(view.number).padEnd(width)}  ${view.source ? abbreviateHome(view.source, home) : "(keychain only)"}`,
    ),
  ];
}

export function wrapLine(text: string, width: number | undefined): string[] {
  if (width === undefined || Bun.stringWidth(text) <= width) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && Bun.stringWidth(candidate) > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export function titleFor(host: Host, pool: string): string {
  return `${TOOL_TITLE[host]} / ${pool}`;
}

const iso = (seconds: number | undefined) =>
  typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : null;

export function accountJson(view: AccountView, now: number): Record<string, unknown> {
  const { row } = view;
  const primary = usageWindow(row.rateLimits, 300);
  const weekly = usageWindow(row.rateLimits, 10080);
  return {
    tool: view.tool,
    pool: view.pool,
    number: view.number,
    name: view.name,
    source: view.source,
    current: view.current,
    currentCheckedAt: view.currentCheckedAt ? new Date(view.currentCheckedAt).toISOString() : null,
    authenticated: typeof row.authenticated === "boolean" ? row.authenticated : null,
    plan: row.rateLimits?.planType ?? row.plan ?? null,
    status: usageStatus(row, now),
    usage: {
      fiveHourRemaining: remainingUsage(primary),
      fiveHourResetsAt: iso(primary?.resetsAt),
      weeklyRemaining: remainingUsage(weekly),
      weeklyResetsAt: iso(weekly?.resetsAt),
    },
    resetCredits: row.resetCredits ?? null,
    usageFetchedAt: row.usageFetchedAt ? new Date(row.usageFetchedAt).toISOString() : null,
    usageAgeSeconds: row.usageFetchedAt
      ? Math.max(0, Math.floor((now - row.usageFetchedAt) / 1000))
      : null,
    queryError: row.resetError ?? row.credentialError ?? null,
  };
}
