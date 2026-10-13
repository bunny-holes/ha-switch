import { homedir } from "node:os";
import { resolve } from "node:path";
import { version } from "../package.json";
import {
  type AccountView,
  abbreviateHome,
  accountJson,
  relativeReset,
  renderAccounts,
  titleFor,
  wrapLine,
} from "./account-table.ts";
import { addProfile, nativeLogin } from "./add.ts";
import {
  captureAgyAccount,
  listAgyAccounts,
  restoreAgyBackup,
  useAgyAccount,
} from "./agy-accounts.ts";
import {
  importLegacyClaudeAccounts,
  listClaudeAccounts,
  restoreClaudeBackup,
  useClaudeAccount,
} from "./claude-accounts.ts";
import {
  defaultConfigDir,
  type Host,
  importConfiguration,
  initConfiguration,
  poolsPath,
  saveAgyConfiguration,
  validateHostPools,
} from "./config.ts";
import { errorCode, PoolError } from "./errors.ts";
import { keychainErrorMessage } from "./keychain.ts";
import { launch, shortcutArguments } from "./launch.ts";
import { logger } from "./log.ts";
import {
  describeError,
  type ErrorContext,
  exitCodeFor,
  legacyNext,
  TOOL_TITLE,
} from "./messages.ts";
import {
  codexPoolSources,
  listNativeCodexAccounts,
  nativeCodexPool,
  prepareNativeCodexPool,
  profileDirectory,
  readPools,
  restoreAccount,
  useAccount,
  verifySelectedCodexAccount,
} from "./pool.ts";
import { configuredProfile, sourceDirectory } from "./profile-launch.ts";
import { isInteractive, type Prompter, terminalPrompter } from "./prompt.ts";
import { matchingAccountLabels, resolveAccountLabel, selectCodexAccount } from "./selection.ts";
import {
  readSelectionState,
  type SelectionEntry,
  type SelectionState,
  selectionEntry,
  selectionStatePath,
  updateSelection,
} from "./state.ts";
import type { AccountListing, AccountRow, Pool, Pools } from "./types.ts";
import { codexAccountUsage } from "./usage.ts";
import {
  applyUsageCache,
  readUsageCache,
  saveUsageCache,
  type UsageCache,
  usageCachePath,
} from "./usage-cache.ts";
import { remainingUsage, usageWindow } from "./usage-state.ts";

export const HELP = `HA Switch ${version}
Switch saved Codex, Claude Code, and Antigravity profiles on macOS.

Usage:
  has
  has list [TOOL] [--usage] [--json]
  has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]
  has switch TOOL [SELECTOR]
  has add TOOL NAME
  has restore TOOL

Examples:
  has
  has list codex --usage
  has run codex                    # pick by usage policy, shared home
  has run claude work -- --resume  # named shared-home run
  has run claude work --isolated   # this terminal only
  has switch codex personal
  has switch claude -              # previous selection
  has add codex work
  has restore codex                # first pre-switch login

Commands:
  list       show profiles; --usage refreshes live usage
  run        select, optionally switch, and start a profile
  switch     change the shared native login without starting the tool
  add        run the official login flow and register a new profile
  restore    restore the first safe pre-switch login

Options:
  --pool NAME          use one configured pool
  --config-dir DIR     use another ha-switch config directory
  --usage              refresh account usage (list only)
  --json               print schemaVersion 1 JSON (list/dashboard only)
  --isolated           use source profile; do not change shared login
  --safe               omit pool args and approval-bypass flags
  --color MODE         auto, always, or never (default: auto)
  --no-input           never open a selector
  -h, --help           show this help
  -V, --version        show the version

Selector:
  -                    previous successful shared selection
  2                    row number
  work                 exact name
  wor                  one unique name fragment

Notes:
  has is a fast local/cache dashboard. It never waits for input.
  has run codex uses configured selection policy and live usage.
  run --isolated leaves the shared login alone.
  Prompts run only when stdin and stdout are TTYs.
  NO_COLOR=1 disables color. Secrets are never printed.
  Run has list --usage when you need fresh usage data.
  Maintenance: has init, has import --from DIR (see README).`;

const log = logger("cli");
const HOSTS: Host[] = ["codex", "claude", "agy"];
const COMMANDS = new Set([
  "dashboard",
  "list",
  "run",
  "switch",
  "add",
  "restore",
  "init",
  "import",
]);
const LEGACY_COMMANDS = new Set(["x", "c", "save", "sync"]);
const LEGACY_OPTIONS = new Set([
  "--list",
  "--local",
  "--harness",
  "--switch",
  "-s",
  "--create",
  "-c",
  "--account",
  "--dry-run",
]);
const VALUE_OPTIONS = new Set(["--pool", "--config-dir", "--color", "--from"]);
const FLAG_OPTIONS = new Set(["--usage", "--json", "--isolated", "--safe", "--no-input"]);

export function hostFor(text: string): Host | undefined {
  switch (text) {
    case "codex":
    case "x":
      return "codex";
    case "claude":
    case "c":
      return "claude";
    case "agy":
    case "a":
    case "antigravity":
      return "agy";
    default:
      return undefined;
  }
}

export interface CliDependencies {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
  /** stdout: tables, JSON, completion lines. */
  print: (text: string) => void;
  /** stderr: errors. */
  error: (text: string) => void;
  /** stderr: progress and warnings. */
  note: (text: string) => void;
  interactive: boolean;
  columns?: number;
  stdoutIsTTY: boolean;
  prompt: Prompter;
  now: () => number;
  readPools: typeof readPools;
  listNativeCodex: typeof listNativeCodexAccounts;
  codexSources: typeof codexPoolSources;
  prepareCodex: typeof prepareNativeCodexPool;
  useCodex: typeof useAccount;
  verifyCodex: typeof verifySelectedCodexAccount;
  restoreCodex: typeof restoreAccount;
  readUsage: typeof codexAccountUsage;
  listClaude: typeof listClaudeAccounts;
  useClaude: typeof useClaudeAccount;
  restoreClaude: typeof restoreClaudeBackup;
  listAgy: typeof listAgyAccounts;
  useAgy: typeof useAgyAccount;
  restoreAgy: typeof restoreAgyBackup;
  captureAgy: typeof captureAgyAccount;
  saveAgy: typeof saveAgyConfiguration;
  importLegacy: typeof importLegacyClaudeAccounts;
  init: typeof initConfiguration;
  import: typeof importConfiguration;
  launch: typeof launch;
  login: typeof nativeLogin;
  readState: typeof readSelectionState;
  updateState: typeof updateSelection;
  readCache: typeof readUsageCache;
  saveCache: typeof saveUsageCache;
}

interface Parsed {
  command: string;
  tool?: string;
  selector?: string;
  extra: string[];
  pool?: string;
  configDir?: string;
  color?: string;
  from?: string;
  usage: boolean;
  json: boolean;
  isolated: boolean;
  safe: boolean;
  noInput: boolean;
  separator: boolean;
  runArgs: string[];
}

function parse(argv: readonly string[]): Parsed {
  const separator = argv.indexOf("--");
  const input = separator < 0 ? [...argv] : argv.slice(0, separator);
  const parsed: Parsed = {
    command: "dashboard",
    extra: [],
    usage: false,
    json: false,
    isolated: false,
    safe: false,
    noInput: false,
    separator: separator >= 0,
    runArgs: separator < 0 ? [] : argv.slice(separator + 1),
  };
  const positions: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < input.length; index++) {
    const word = input[index];
    if (LEGACY_OPTIONS.has(word))
      throw new PoolError("legacy_option", word, { cause: { next: legacyNext(word) } });
    if (word === "--from" && positions[0] !== "import")
      throw new PoolError("legacy_option", word, { cause: { next: legacyNext(word) } });
    if (VALUE_OPTIONS.has(word) || FLAG_OPTIONS.has(word)) {
      if (seen.has(word)) throw new PoolError("duplicate_option", word);
      seen.add(word);
    }
    if (VALUE_OPTIONS.has(word)) {
      const value = input[++index];
      if (value === undefined || value.startsWith("-"))
        throw new PoolError("option_value_missing", word);
      if (word === "--pool") parsed.pool = value;
      else if (word === "--config-dir") parsed.configDir = value;
      else if (word === "--from") parsed.from = value;
      else parsed.color = value;
    } else if (word === "--usage") parsed.usage = true;
    else if (word === "--json") parsed.json = true;
    else if (word === "--isolated") parsed.isolated = true;
    else if (word === "--safe") parsed.safe = true;
    else if (word === "--no-input") parsed.noInput = true;
    else if (word.startsWith("-") && word !== "-") throw new PoolError("unknown_option", word);
    else positions.push(word);
  }
  if (positions.length) {
    const command = positions[0];
    if (LEGACY_COMMANDS.has(command))
      throw new PoolError("legacy_command", command, { cause: { next: legacyNext(command) } });
    if (!COMMANDS.has(command) || command === "dashboard")
      throw new PoolError("unknown_command", command);
    parsed.command = command;
    parsed.tool = positions[1];
    parsed.selector = positions[2];
    parsed.extra = positions.slice(3);
  }
  if (parsed.color !== undefined && !["auto", "always", "never"].includes(parsed.color))
    throw new PoolError("color_mode_invalid");
  return parsed;
}

interface Session {
  deps: CliDependencies;
  parsed: Parsed;
  directory: string;
  configFlag: string;
  interactive: boolean;
  color: boolean;
  ctx: ErrorContext;
}

const quote = (value: string) =>
  /^[A-Za-z0-9._/-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;

async function loadPools(session: Session, host: Host): Promise<Pool[]> {
  const { deps, directory } = session;
  const pools = validateHostPools(
    host,
    await deps.readPools(poolsPath(directory, host), deps.home),
  );
  return Object.entries(pools).map(([name, spec]) => ({ ...spec, name }));
}

function selectPools(pools: Pool[], name: string | undefined): Pool[] {
  if (name === undefined) return pools;
  return pools.filter((pool) => pool.name === name);
}

async function onePool(session: Session, host: Host): Promise<Pool> {
  const pools = await loadPools(session, host);
  const name = session.parsed.pool;
  if (!pools.length) throw new PoolError("pool_config_missing");
  const selected = selectPools(pools, name);
  if (name !== undefined && !selected.length) throw new PoolError("pool_unknown");
  if (selected.length !== 1) throw new PoolError("pool_selection_required");
  return selected[0];
}

function requireHost(session: Session, command: string): Host {
  const { tool, selector } = session.parsed;
  session.ctx.command = command;
  if (tool === undefined || /^\d+$/.test(tool) || tool === "-") {
    session.ctx.account = tool;
    throw new PoolError("host_required");
  }
  const host = hostFor(tool);
  if (!host) throw new PoolError("host_invalid");
  session.ctx.host = host;
  session.ctx.tool = host;
  session.ctx.account = selector;
  return host;
}

function requireDarwin(session: Session): void {
  if (session.deps.platform !== "darwin") throw new PoolError("platform_unsupported");
}

async function promptChoice(
  session: Session,
  host: Host,
  choices: readonly string[],
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await session.deps.prompt(`Select ${TOOL_TITLE[host]} account`, choices);
    if (answer === undefined) throw new PoolError("cancelled");
    try {
      return resolveAccountLabel(choices, answer);
    } catch (error) {
      if (!(error instanceof PoolError)) throw error;
      session.deps.note(`has: ${error.code} — try a number or a unique name`);
    }
  }
  throw new PoolError("selector_required");
}

async function chooseAccount(
  session: Session,
  host: Host,
  pool: Pool,
  selector: string | undefined,
): Promise<string> {
  session.ctx.candidates = pool.accounts.slice(0, 1);
  if (selector === undefined) {
    if (!session.interactive) throw new PoolError("selector_required");
    return promptChoice(session, host, pool.accounts);
  }
  if (selector === "-") {
    const state = await readStateSafely(session);
    return resolveAccountLabel(pool.accounts, "-", selectionEntry(state, host, pool.name).previous);
  }
  if (/^\d+$/.test(selector)) return resolveAccountLabel(pool.accounts, selector);
  const matches = matchingAccountLabels(pool.accounts, selector);
  if (!matches.length) throw new PoolError("account_selector_not_found");
  if (matches.length === 1) return matches[0];
  session.ctx.candidates = matches;
  if (!session.interactive) throw new PoolError("account_selector_ambiguous");
  return promptChoice(session, host, matches);
}

async function readStateSafely(session: Session): Promise<SelectionState> {
  try {
    return await session.deps.readState(selectionStatePath(session.directory));
  } catch (error) {
    if (!(error instanceof PoolError && error.code === "state_invalid")) throw error;
    session.deps.note("has: state_invalid — previous selections are ignored");
    return { version: 1, selections: {} };
  }
}

async function readCacheSafely(session: Session): Promise<UsageCache> {
  try {
    return await session.deps.readCache(usageCachePath(session.directory));
  } catch (error) {
    if (!(error instanceof PoolError && error.code === "usage_cache_invalid")) throw error;
    session.deps.note("has: usage_cache_invalid — cached usage is ignored");
    return {};
  }
}

async function recordState(
  session: Session,
  host: Host,
  pool: string,
  update: Parameters<typeof updateSelection>[3],
): Promise<SelectionEntry | undefined> {
  try {
    return await session.deps.updateState(
      selectionStatePath(session.directory),
      host,
      pool,
      update,
    );
  } catch (error) {
    log("state_write_failed", { code: errorCode(error, "state_write_failed") }, "warn");
    session.deps.note("has: state_write_failed — selection history was not saved");
    return undefined;
  }
}

async function saveCacheSafely(
  session: Session,
  host: Host,
  pool: string,
  rows: readonly AccountRow[],
) {
  try {
    await session.deps.saveCache(
      usageCachePath(session.directory),
      host,
      pool,
      rows,
      session.deps.now(),
    );
  } catch (error) {
    log("cache_write_failed", { code: errorCode(error, "usage_cache_write_failed") }, "warn");
    session.deps.note("has: usage_cache_write_failed — usage was not cached");
  }
}

async function addUsage(session: Session, sources: Pool, listing: AccountListing): Promise<void> {
  const { deps } = session;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, listing.accounts.length) }, async () => {
      while (cursor < listing.accounts.length) {
        const row = listing.accounts[cursor++];
        try {
          Object.assign(
            row,
            await deps.readUsage(profileDirectory(sources, row.account, deps.home), {
              home: deps.home,
            }),
          );
        } catch (error) {
          row.resetError = errorCode(error, "codex_usage_query_failed");
        }
      }
    }),
  );
}

function stampLive(rows: AccountRow[], now: number): void {
  for (const row of rows)
    if (
      !row.resetError &&
      !row.credentialError &&
      (row.rateLimits != null || row.resetCredits != null)
    )
      row.usageFetchedAt = now;
}

function buildViews(
  session: Session,
  host: Host,
  pool: Pool,
  listing: AccountListing | undefined,
  state: SelectionState,
  cache: UsageCache,
): AccountView[] {
  const now = session.deps.now();
  const rows: AccountRow[] = pool.accounts.map(
    (account) => listing?.accounts.find((row) => row.account === account) ?? { account },
  );
  const checked = listing !== undefined && !rows.some((row) => row.credentialError);
  applyUsageCache(cache, host, pool.name, rows, now);
  const entry = selectionEntry(state, host, pool.name);
  return rows.map((row, index) => {
    let current: boolean | null = null;
    let currentCheckedAt: number | null = null;
    if (checked) {
      current = listing.current === row.account;
      currentCheckedAt = now;
    } else if (entry.current !== undefined) {
      current = entry.current === row.account;
      currentCheckedAt = entry.checkedAt ?? null;
    }
    return {
      tool: host,
      pool: pool.name,
      number: index + 1,
      name: row.account,
      source: sourceDirectory(host, pool, row.account, session.deps.home) ?? null,
      current,
      currentCheckedAt,
      row,
    };
  });
}

interface Block {
  host: Host;
  pool: Pool;
  views: AccountView[];
  warnings: string[];
}

async function liveListing(session: Session, host: Host, pool: Pool): Promise<AccountListing> {
  const { deps, directory } = session;
  if (host === "codex") {
    const listing = await deps.listNativeCodex(pool, directory, deps.home);
    const sources = await deps.codexSources(pool, directory, deps.home);
    await addUsage(session, { ...sources, home: ".codex" }, listing);
    return listing;
  }
  if (host === "claude") return deps.listClaude(pool, { home: deps.home, local: false });
  return deps.listAgy(pool);
}

async function collectBlocks(session: Session, hosts: Host[], live: boolean): Promise<Block[]> {
  const { parsed, deps } = session;
  const state = await readStateSafely(session);
  const cache = await readCacheSafely(session);
  const blocks: Block[] = [];
  let poolSeen = false;
  for (const host of hosts) {
    const pools = selectPools(await loadPools(session, host), parsed.pool);
    if (pools.length) poolSeen = true;
    for (const pool of pools) {
      let listing: AccountListing | undefined;
      const warnings: string[] = [];
      if (live) {
        listing = await liveListing(session, host, pool);
        stampLive(listing.accounts, deps.now());
        warnings.push(...new Set(listing.warnings ?? []));
      }
      const views = buildViews(session, host, pool, listing, state, cache);
      if (live && listing) {
        await saveCacheSafely(session, host, pool.name, listing.accounts);
        if (!listing.accounts.some((row) => row.credentialError))
          await recordState(session, host, pool.name, {
            kind: "checked",
            account: listing.current ?? null,
            at: deps.now(),
          });
      }
      blocks.push({ host, pool, views, warnings });
    }
  }
  if (!poolSeen && parsed.pool !== undefined && hosts.length) throw new PoolError("pool_unknown");
  return blocks;
}

function jsonDocument(session: Session, command: string, blocks: Block[]): string {
  const now = session.deps.now();
  return JSON.stringify(
    {
      schemaVersion: 1,
      command,
      generatedAt: new Date(now).toISOString(),
      accounts: blocks.flatMap((block) => block.views.map((view) => accountJson(view, now))),
      warnings: blocks.flatMap((block) => [
        ...block.warnings.map((code) => ({ tool: block.host, pool: block.pool.name, code })),
        ...block.views
          .filter((view) => view.row.resetError)
          .map((view) => ({
            tool: block.host,
            pool: block.pool.name,
            account: view.name,
            code: view.row.resetError,
          })),
      ]),
    },
    null,
    2,
  );
}

function reportWarnings(session: Session, blocks: Block[]): void {
  const { deps, configFlag } = session;
  const nexts: string[] = [];
  for (const block of blocks) {
    const poolFlag = ` --pool ${quote(block.pool.name)}`;
    for (const code of block.warnings) deps.note(`has: ${code} — ${keychainErrorMessage(code)}`);
    for (const view of block.views) {
      if (!view.row.resetError || view.row.credentialError) continue;
      const age = view.row.usageFetchedAt
        ? `; last value · ${relativeAgeText(view.row.usageFetchedAt, deps.now())}`
        : "";
      deps.note(`has: ${view.name} usage query failed (${view.row.resetError})${age}`);
      nexts.push(
        block.host === "claude"
          ? `has run claude ${view.name} --isolated${poolFlag}${configFlag}`
          : `has run ${block.host} ${view.name}${poolFlag}${configFlag}`,
      );
    }
  }
  if (nexts[0]) deps.note(`Next: ${nexts[0]}`);
}

function relativeAgeText(from: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - from) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function printBlocks(session: Session, blocks: Block[], dashboard: boolean): void {
  const { deps, color } = session;
  const width = deps.columns;
  const now = deps.now();
  const lines: string[] = [];
  if (dashboard) {
    lines.push(`HA Switch ${version} · local dashboard`, "");
    const views = blocks.flatMap((block) => block.views);
    lines.push(...renderAccounts(views, { now, width, color, tools: true, home: deps.home }), "");
    lines.push(
      ...wrapLine(
        "Shared home is the last checked native login; isolated sessions are separate.",
        width,
      ),
      "Run:     has run <tool> <name>",
      "Live:    has list --usage",
      "Switch:  has switch <tool> <name>",
    );
  } else {
    blocks.forEach((block, index) => {
      if (index) lines.push("");
      lines.push(titleFor(block.host, block.pool.name), "");
      lines.push(
        ...renderAccounts(block.views, { now, width, color, sources: true, home: deps.home }),
      );
    });
  }
  deps.print(lines.join("\n"));
}

async function dashboardOrList(session: Session): Promise<number> {
  const { parsed, deps } = session;
  const dashboard = parsed.command === "dashboard";
  const command = dashboard ? "dashboard" : "list";
  if (parsed.selector !== undefined || parsed.extra.length) throw new PoolError("unknown_argument");
  if (parsed.isolated || parsed.safe || parsed.separator || parsed.from !== undefined)
    throw new PoolError("option_not_applicable");
  if (dashboard && (parsed.usage || parsed.tool !== undefined))
    throw new PoolError("option_not_applicable");
  let hosts = HOSTS;
  if (parsed.tool !== undefined) {
    const host = hostFor(parsed.tool);
    if (!host) throw new PoolError("host_invalid");
    hosts = [host];
    session.ctx.host = host;
    session.ctx.tool = host;
  }
  if (parsed.usage) requireDarwin(session);
  const blocks = await collectBlocks(session, hosts, parsed.usage);
  if (parsed.json) {
    deps.print(jsonDocument(session, command, blocks));
    return 0;
  }
  if (!blocks.length) {
    if (parsed.tool !== undefined) throw new PoolError("pool_config_missing");
    deps.print(
      [
        `HA Switch ${version} · local dashboard`,
        "No saved profiles.",
        "Add: has add codex work",
        "Help: has --help",
      ].join("\n"),
    );
    return 0;
  }
  printBlocks(session, blocks, dashboard);
  if (parsed.usage) reportWarnings(session, blocks);
  return 0;
}

const sharedClaude = (pool: Pool, home: string) => ({
  pool: { ...pool, home: ".claude" },
  nativeBackup: resolve(home, pool.home) !== resolve(home, ".claude"),
});

interface Switched {
  pool: Pool;
  /** Shared login seen right before the switch, when it could be read without credentials access. */
  before?: string;
}

async function switchShared(
  session: Session,
  host: Host,
  pool: Pool,
  label: string,
): Promise<Switched> {
  const { deps, directory } = session;
  session.ctx.account = label;
  if (host === "codex") {
    const before = (await deps.listNativeCodex(pool, directory, deps.home)).current;
    const prepared = await deps.prepareCodex(pool, label, directory, deps.home);
    await deps.useCodex(prepared.pool, label, deps.home, {
      configuredOnly: true,
      expectedTarget: prepared.expectedTarget,
    });
    return { pool: prepared.pool, before };
  }
  if (host === "claude") {
    const shared = sharedClaude(pool, deps.home);
    await deps.useClaude(shared.pool, label, {
      home: deps.home,
      nativeBackup: shared.nativeBackup,
    });
    return { pool: shared.pool };
  }
  await deps.useAgy(pool, label);
  return { pool };
}

async function run(session: Session): Promise<number> {
  const { parsed, deps } = session;
  const host = requireHost(session, "run");
  if (parsed.extra.length) throw new PoolError("unknown_argument");
  if (parsed.usage || parsed.json || parsed.from !== undefined)
    throw new PoolError("option_not_applicable");
  requireDarwin(session);
  const pool = await onePool(session, host);
  const title = TOOL_TITLE[host];
  // --safe drops pool args and approval-bypass flags; forwarded args stay.
  const launchArgs = (poolArgs: readonly string[]) =>
    host === "agy"
      ? [...(parsed.safe ? [] : poolArgs), ...parsed.runArgs]
      : shortcutArguments(host, parsed.safe ? [] : poolArgs, parsed.runArgs, parsed.safe);
  if (parsed.isolated) {
    if (host === "agy") throw new PoolError("isolated_not_supported");
    const label = await chooseAccount(session, host, pool, parsed.selector);
    session.ctx.account = label;
    const source = configuredProfile(host, pool, label, deps.home);
    deps.note(`${title}: starting isolated profile ${label}...`);
    return deps.launch(
      host,
      { ...pool, home: source, args: [] },
      launchArgs(pool.args ?? []),
      deps.home,
    );
  }
  let label: string | undefined;
  if (parsed.selector !== undefined)
    label = await chooseAccount(session, host, pool, parsed.selector);
  else if (host === "codex") {
    deps.note("Selecting Codex account by usage policy...");
    const listing = await deps.listNativeCodex(pool, session.directory, deps.home);
    const sources = await deps.codexSources(pool, session.directory, deps.home);
    await addUsage(session, { ...sources, home: ".codex" }, listing);
    stampLive(listing.accounts, deps.now());
    await saveCacheSafely(session, host, pool.name, listing.accounts);
    if (listing.accounts.length && listing.accounts.every((row) => row.resetError))
      throw new PoolError("selection_usage_unavailable");
    label = selectCodexAccount(pool.accounts, listing.accounts, pool.selection, deps.now());
    const row = listing.accounts.find((candidate) => candidate.account === label);
    const five = remainingUsage(usageWindow(row?.rateLimits, 300));
    const reset = relativeReset(usageWindow(row?.rateLimits, 300), deps.now());
    deps.note(`Codex: using ${label}${five === null ? "" : ` (${five}% left, resets ${reset})`}.`);
  }
  let target: Pool;
  if (label === undefined) {
    if (host === "claude") {
      deps.note("Claude: using the current shared home...");
      target = sharedClaude(pool, deps.home).pool;
    } else {
      deps.note("Antigravity: using the current login...");
      target = pool;
    }
  } else {
    const switched = await switchShared(session, host, pool, label);
    target = switched.pool;
    if (host === "codex") await deps.verifyCodex(target, label, deps.home);
    await recordState(session, host, pool.name, {
      kind: "selected",
      account: label,
      at: deps.now(),
      before: switched.before,
    });
    deps.note(`Starting ${title} in shared home...`);
  }
  return deps.launch(host, { ...target, args: [] }, launchArgs(pool.args ?? []), deps.home);
}

async function switchCommand(session: Session): Promise<number> {
  const { parsed, deps } = session;
  const host = requireHost(session, "switch");
  if (parsed.extra.length) throw new PoolError("unknown_argument");
  if (
    parsed.usage ||
    parsed.json ||
    parsed.isolated ||
    parsed.safe ||
    parsed.separator ||
    parsed.from !== undefined
  )
    throw new PoolError("option_not_applicable");
  requireDarwin(session);
  const pool = await onePool(session, host);
  const label = await chooseAccount(session, host, pool, parsed.selector);
  const switched = await switchShared(session, host, pool, label);
  const entry = await recordState(session, host, pool.name, {
    kind: "selected",
    account: label,
    at: deps.now(),
    before: switched.before,
  });
  const title = TOOL_TITLE[host];
  const lines = [
    `${title}: switched the shared home to ${label}.`,
    `Open ${title} sessions keep their current login.`,
  ];
  if (entry?.previous)
    lines.push(
      `Previous selection: ${entry.previous}. To go back: has switch ${host} -${session.configFlag}`,
    );
  deps.print(lines.join("\n"));
  return 0;
}

async function restoreCommand(session: Session): Promise<number> {
  const { parsed, deps, directory } = session;
  const host = requireHost(session, "restore");
  if (parsed.selector !== undefined || parsed.extra.length) throw new PoolError("unknown_argument");
  if (
    parsed.usage ||
    parsed.json ||
    parsed.isolated ||
    parsed.safe ||
    parsed.separator ||
    parsed.from !== undefined
  )
    throw new PoolError("option_not_applicable");
  requireDarwin(session);
  const pool = await onePool(session, host);
  if (host === "codex") {
    if (
      !(await deps.restoreCodex(nativeCodexPool(pool, directory, deps.home), deps.home, {
        configuredOnly: true,
      }))
    )
      throw new PoolError("backup_missing");
  } else if (host === "claude") {
    const shared = sharedClaude(pool, deps.home);
    await deps.restoreClaude(shared.pool, { home: deps.home, nativeBackup: shared.nativeBackup });
  } else await deps.restoreAgy(pool);
  await recordState(session, host, pool.name, { kind: "restored", at: deps.now() });
  deps.print(`${TOOL_TITLE[host]}: restored the first pre-switch login.\nNext: has`);
  return 0;
}

async function addCommand(session: Session): Promise<number> {
  const { parsed, deps, directory } = session;
  const host = requireHost(session, "add");
  const label = parsed.selector;
  if (parsed.extra.length) throw new PoolError("unknown_argument");
  if (
    parsed.usage ||
    parsed.json ||
    parsed.isolated ||
    parsed.safe ||
    parsed.separator ||
    parsed.from !== undefined
  )
    throw new PoolError("option_not_applicable");
  if (!label) throw new PoolError("account_label_required");
  requireDarwin(session);
  const title = TOOL_TITLE[host];
  if (host === "agy") {
    const previous = validateHostPools(
      "agy",
      await deps.readPools(poolsPath(directory, "agy"), deps.home),
    );
    const names = Object.keys(previous);
    const poolName = parsed.pool ?? (names.length <= 1 ? (names[0] ?? "default") : undefined);
    if (!poolName) throw new PoolError("pool_selection_required");
    if (parsed.pool && names.length && !Object.hasOwn(previous, parsed.pool))
      throw new PoolError("pool_unknown");
    const spec = previous[poolName] ?? { home: ".gemini", accounts: [] };
    if (spec.accounts.includes(label)) throw new PoolError("account_label_taken");
    const next: Pools = validateHostPools("agy", {
      ...previous,
      [poolName]: { ...spec, accounts: [...spec.accounts, label] },
    });
    deps.note(`Saving the current Antigravity login as ${label}...`);
    await deps.saveAgy(directory, previous, next, () => deps.captureAgy(label));
    deps.print(
      `${title}: saved the current agy login as ${label}.\nRun: has run agy ${label}${session.configFlag}`,
    );
    return 0;
  }
  const added = await addProfile(host, label, {
    directory,
    home: deps.home,
    pool: parsed.pool,
    run: deps.login,
    env: deps.env,
    announce: () => deps.note(`Opening official ${title} login for ${label}...`),
  });
  deps.print(
    `${title}: signed in and saved as ${label}.\nRun: has run ${host} ${label}${added.pool === "default" ? "" : ` --pool ${quote(added.pool)}`}${session.configFlag}`,
  );
  return 0;
}

async function maintenance(session: Session): Promise<number> {
  const { parsed, deps, directory } = session;
  if (parsed.tool !== undefined || parsed.extra.length || parsed.pool !== undefined)
    throw new PoolError("unknown_argument");
  if (parsed.usage || parsed.json || parsed.isolated || parsed.safe || parsed.separator)
    throw new PoolError("option_not_applicable");
  requireDarwin(session);
  if (parsed.command === "init") {
    await deps.init(directory, deps.home);
    deps.print("Configuration ready.\nNext: has");
  } else {
    if (!parsed.from) throw new PoolError("import_source_required");
    const imported = await deps.import(resolve(parsed.from), directory);
    for (const [host, pools] of Object.entries(imported)) validateHostPools(host as Host, pools);
    if (imported.claude) await deps.importLegacy(imported.claude, { home: deps.home });
    deps.print("Configuration imported.\nNext: has");
  }
  return 0;
}

export function defaultDependencies(): CliDependencies {
  return {
    platform: process.platform,
    home: homedir(),
    env: process.env,
    print: console.log,
    error: console.error,
    note: console.error,
    interactive: isInteractive(),
    columns: process.stdout.isTTY ? process.stdout.columns : undefined,
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    prompt: terminalPrompter,
    now: Date.now,
    readPools,
    listNativeCodex: listNativeCodexAccounts,
    codexSources: codexPoolSources,
    prepareCodex: prepareNativeCodexPool,
    useCodex: useAccount,
    verifyCodex: verifySelectedCodexAccount,
    restoreCodex: restoreAccount,
    readUsage: codexAccountUsage,
    listClaude: listClaudeAccounts,
    useClaude: useClaudeAccount,
    restoreClaude: restoreClaudeBackup,
    listAgy: listAgyAccounts,
    useAgy: useAgyAccount,
    restoreAgy: restoreAgyBackup,
    captureAgy: captureAgyAccount,
    saveAgy: saveAgyConfiguration,
    importLegacy: importLegacyClaudeAccounts,
    init: initConfiguration,
    import: importConfiguration,
    launch,
    login: nativeLogin,
    readState: readSelectionState,
    updateState: updateSelection,
    readCache: readUsageCache,
    saveCache: saveUsageCache,
  };
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  overrides: Partial<CliDependencies> = {},
): Promise<number> {
  const deps: CliDependencies = { ...defaultDependencies(), ...overrides };
  const separator = argv.indexOf("--");
  const head = separator < 0 ? argv : argv.slice(0, separator);
  if (head.includes("-h") || head.includes("--help")) {
    deps.print(HELP);
    return 0;
  }
  if (head.includes("-V") || head.includes("--version")) {
    deps.print(version);
    return 0;
  }
  let parsed: Parsed | undefined;
  const ctx: ErrorContext = {};
  const fail = (error: unknown): number => {
    const code = errorCode(error);
    if (code === "unexpected_error")
      log("unexpected", { name: error instanceof Error ? error.name : typeof error }, "debug");
    const cause =
      error instanceof PoolError ? (error.cause as { next?: string } | undefined) : undefined;
    const described = describeError(code, { ...ctx, command: cause?.next ?? ctx.command });
    if (parsed?.json && (parsed.command === "list" || parsed.command === "dashboard")) {
      deps.print(
        JSON.stringify(
          {
            schemaVersion: 1,
            command: parsed.command,
            error: { code, message: described.message, next: described.next ?? null },
          },
          null,
          2,
        ),
      );
    } else {
      deps.error(`has: ${code} — ${described.message}`);
      if (code === "account_selector_ambiguous" && ctx.candidates?.length)
        deps.error(`Candidates: ${ctx.candidates.join(", ")}`);
      if (described.next) deps.error(`Next: ${described.next}`);
    }
    return exitCodeFor(code);
  };
  try {
    parsed = parse(argv);
  } catch (error) {
    return fail(error);
  }
  const directory = resolve(parsed.configDir ?? defaultConfigDir());
  const configFlag = parsed.configDir === undefined ? "" : ` --config-dir ${quote(directory)}`;
  ctx.configFlag = configFlag;
  ctx.pool = parsed.pool;
  const noColor = typeof deps.env.NO_COLOR === "string" && deps.env.NO_COLOR !== "";
  const color =
    !parsed.json &&
    (parsed.color === "always" || (parsed.color !== "never" && deps.stdoutIsTTY && !noColor));
  const session: Session = {
    deps,
    parsed,
    directory,
    configFlag,
    interactive: deps.interactive && !parsed.noInput && !parsed.json,
    color,
    ctx,
  };
  try {
    switch (parsed.command) {
      case "dashboard":
      case "list":
        return await dashboardOrList(session);
      case "run":
        return await run(session);
      case "switch":
        return await switchCommand(session);
      case "restore":
        return await restoreCommand(session);
      case "add":
        return await addCommand(session);
      default:
        return await maintenance(session);
    }
  } catch (error) {
    return fail(error);
  }
}

export { abbreviateHome };
