import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { version } from "../package.json";
import { listClaudeAccounts } from "../src/claude-accounts.ts";
import { type CliDependencies, HELP, main } from "../src/cli.ts";
import { PoolError } from "../src/errors.ts";
import { nativeCodexPool } from "../src/pool.ts";
import type { SelectionEntry, SelectionState } from "../src/state.ts";
import type { AccountUsage, Pools } from "../src/types.ts";
import type { UsageCache } from "../src/usage-cache.ts";

const NOW = Date.UTC(2026, 9, 12, 10, 30);
const HOME = "/synthetic-home";
const usage = (five: number, weekly: number, resetIn = 3600): AccountUsage => ({
  resetCredits: 2,
  rateLimits: {
    primary: { windowDurationMins: 300, usedPercent: 100 - five, resetsAt: NOW / 1000 + resetIn },
    secondary: {
      windowDurationMins: 10080,
      usedPercent: 100 - weekly,
      resetsAt: NOW / 1000 + 86400 * 2,
    },
  },
});

function fixture() {
  const output: string[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const events: string[] = [];
  const state: SelectionState = { version: 1, selections: {} };
  const cache: UsageCache = {};
  const codexPool = {
    home: ".codex",
    accounts: ["work", "personal"],
    from: { work: ".codex-work", personal: ".codex-personal" },
    args: ["-c", "model_reasoning_effort=medium"],
  };
  const claudePool = {
    home: ".claude",
    accounts: ["work", "personal"],
    from: { work: ".claude-work", personal: ".claude-personal" },
  };
  const agyPool = { home: ".gemini", accounts: ["work", "personal"] };
  const pools: Record<string, Pools> = {
    codex: { default: codexPool },
    claude: { default: claudePool },
    agy: { default: agyPool },
  };
  const deps: Partial<CliDependencies> = {
    platform: "darwin",
    home: HOME,
    env: {},
    print: (text) => output.push(text),
    error: (text) => errors.push(text),
    note: (text) => notes.push(text),
    interactive: false,
    stdoutIsTTY: false,
    columns: undefined,
    prompt: async () => {
      throw new Error("prompt must not open");
    },
    now: () => NOW,
    readPools: async (path) => {
      events.push(`read:${path?.split("/").pop()}`);
      const host = path?.split("/").pop()?.replace("-pools.json", "") ?? "";
      return pools[host] ?? {};
    },
    listNativeCodex: async () => {
      events.push("codex-list");
      return { current: "work", accounts: codexPool.accounts.map((account) => ({ account })) };
    },
    codexSources: async (configured) => configured,
    prepareCodex: async (configured, _label, directory, home) => {
      events.push("codex-prepare");
      return { pool: nativeCodexPool(configured, directory, home), expectedTarget: {} };
    },
    useCodex: async (pool, account, _home, options) => {
      events.push(`codex-switch:${pool.home}:${account}:${options?.configuredOnly === true}`);
    },
    verifyCodex: async (_pool, account) => {
      events.push(`codex-verify:${account}`);
    },
    restoreCodex: async (pool, _home, options) => {
      events.push(`codex-restore:${pool.home}:${options?.configuredOnly === true}`);
      return true;
    },
    readUsage: async (source) => {
      events.push(`usage:${source}`);
      return source.endsWith("personal") ? usage(74, 61) : usage(20, 80);
    },
    listClaude: async (_pool, options) => {
      events.push(`claude-list:${options?.local}`);
      return {
        current: "personal",
        accounts: [
          { account: "work", authenticated: true, ...usage(42, 63, 7200) },
          { account: "personal", authenticated: true, resetError: "claude_usage_http_429" },
        ],
      };
    },
    useClaude: async (pool, account, options) => {
      events.push(`claude-switch:${pool.home}:${account}:${options?.nativeBackup === true}`);
    },
    restoreClaude: async (pool, options) => {
      events.push(`claude-restore:${pool.home}:${options?.nativeBackup === true}`);
      return { accountUuid: "synthetic" };
    },
    listAgy: async () => {
      events.push("agy-list");
      return {
        current: "work",
        accounts: agyPool.accounts.map((account) => ({ account, authenticated: true })),
      };
    },
    useAgy: async (_pool, account) => {
      events.push(`agy-switch:${account}`);
    },
    restoreAgy: async () => {
      events.push("agy-restore");
    },
    captureAgy: async (label) => {
      events.push(`agy-capture:${label}`);
    },
    saveAgy: async (_directory, _previous, _next, capture) => {
      events.push("agy-config");
      await capture();
    },
    launch: async (host, pool, args) => {
      events.push(`launch:${host}:${pool.home}:${(pool.args ?? []).join(",")}:${args.join(",")}`);
      return 7;
    },
    login: async () => {
      events.push("login");
      return { code: 0 };
    },
    readState: async () => structuredClone(state),
    updateState: async (_path, host, pool, update) => {
      events.push(`state:${update.kind}`);
      const key = `${host}/${pool}`;
      const before = state.selections[key] ?? {};
      const previousOf = (next: string | null | undefined) => {
        if (before.current && before.current !== next) return before.current;
        return before.previous && before.previous !== next ? before.previous : undefined;
      };
      const entry: SelectionEntry =
        update.kind === "selected"
          ? {
              current: update.account,
              previous:
                previousOf(update.account) ??
                (update.before && update.before !== update.account ? update.before : undefined),
              checkedAt: update.at,
            }
          : update.kind === "checked"
            ? {
                current: update.account,
                previous: previousOf(update.account),
                checkedAt: update.at,
              }
            : { previous: previousOf(null) };
      state.selections[key] = entry;
      return entry;
    },
    readCache: async () => structuredClone(cache),
    saveCache: async (_path, host, pool, rows, now) => {
      events.push("cache-save");
      for (const row of rows) {
        const key = `${host}/${pool}/${row.account}`;
        if (row.resetError)
          cache[key] = { ...cache[key], lastError: { code: row.resetError, at: now } };
        else if (row.rateLimits || row.resetCredits != null)
          cache[key] = {
            fetchedAt: now,
            resetCredits: row.resetCredits ?? null,
            rateLimits: row.rateLimits ?? null,
          };
      }
    },
  };
  return { output, errors, notes, events, state, cache, pools, deps };
}

const reads = (events: string[]) => events.filter((event) => event.startsWith("read:"));
const writes = (events: string[]) =>
  events.filter((event) => !event.startsWith("read:") && !event.startsWith("state:"));

test("help and version never read configuration, even with old flags around them", async () => {
  for (const args of [
    ["-h"],
    ["--help"],
    ["-h", "c", "-s", "2"],
    ["run", "codex", "-h"],
    ["--version"],
    ["-V"],
  ]) {
    const f = fixture();
    f.deps.readPools = async () => {
      throw new Error("must not read");
    };
    expect(await main(args, f.deps)).toBe(0);
    expect(f.errors).toEqual([]);
    expect(f.events).toEqual([]);
  }
  const f = fixture();
  await main(["--help"], f.deps);
  expect(f.output[0]).toBe(HELP);
  expect(HELP).toStartWith(`HA Switch ${version}\n`);
  for (const line of [
    "has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]",
    "has add TOOL NAME",
    "-h, --help",
  ])
    expect(HELP).toContain(line);
  expect(HELP).not.toContain("--dry-run");
  await main(["-V"], f.deps);
  expect(f.output[1]).toBe(version);
});

test("bare has is a local dashboard: configuration, state and cache only", async () => {
  const f = fixture();
  const forbidden = async (): Promise<never> => {
    throw new Error("credential access");
  };
  f.deps.listNativeCodex = forbidden;
  f.deps.listClaude = forbidden;
  f.deps.listAgy = forbidden;
  f.deps.readUsage = forbidden;
  expect(await main([], f.deps)).toBe(0);
  const text = f.output[0];
  expect(text).toStartWith(`HA Switch ${version} · local dashboard`);
  expect(text).toContain("TOOL    #  NAME      SHARED HOME");
  expect(text).toMatch(/codex\s+1\s+work\s+unknown\s+\?\s+—\s+\?\s+—\s+\?\s+unknown/);
  expect(text).toContain(
    "Shared home is the last checked native login; isolated sessions are separate.",
  );
  expect(text).toContain("Run:     has run <tool> <name>");
  expect(writes(f.events)).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("dashboard shows recorded shared selection, cached usage, staleness and query failures", async () => {
  const f = fixture();
  f.state.selections["codex/default"] = {
    current: "work",
    previous: "personal",
    checkedAt: NOW - 4 * 60000,
  };
  f.cache["codex/default/work"] = {
    fetchedAt: NOW - 4 * 60000,
    resetCredits: 2,
    rateLimits: usage(74, 61).rateLimits,
  };
  f.cache["codex/default/personal"] = {
    fetchedAt: NOW - 4 * 60000,
    resetCredits: 0,
    rateLimits: usage(0, 18, 720).rateLimits,
  };
  f.cache["claude/default/work"] = {
    fetchedAt: NOW - 2 * 3600000,
    resetCredits: null,
    rateLimits: usage(42, 63).rateLimits,
  };
  f.cache["claude/default/personal"] = {
    fetchedAt: NOW - 18 * 60000,
    resetCredits: null,
    rateLimits: usage(18, 51).rateLimits,
    lastError: { code: "claude_usage_http_429", at: NOW - 60000 },
  };
  expect(await main([], f.deps)).toBe(0);
  const text = f.output[0];
  expect(text).toMatch(
    /codex\s+1\s+work\s+current · 4m ago\s+74%\s+in 1h\s+61%\s+in 2d\s+2\s+fresh · 4m ago/,
  );
  expect(text).toMatch(
    /codex\s+2\s+personal\s+—\s+0%\s+in 12m\s+18%\s+in 2d\s+0\s+limited · 4m ago/,
  );
  expect(text).toMatch(
    /claude\s+1\s+work\s+unknown\s+42%\s+in 1h\s+63%\s+in 2d\s+\?\s+stale · 2h ago/,
  );
  expect(text).toMatch(/claude\s+2\s+personal\s+unknown\s+18%.*query failed · 18m ago/);
  expect(text).toMatch(/agy\s+1\s+work\s+unknown\s+\?/);
  expect(writes(f.events)).toEqual([]);
});

test("dashboard JSON is one schemaVersion 1 document without credentials", async () => {
  const f = fixture();
  f.state.selections["claude/default"] = { current: null, checkedAt: NOW - 60000 };
  expect(await main(["--json"], f.deps)).toBe(0);
  expect(f.output).toHaveLength(1);
  const document = JSON.parse(f.output[0]);
  expect(document.schemaVersion).toBe(1);
  expect(document.command).toBe("dashboard");
  expect(document.generatedAt).toBe(new Date(NOW).toISOString());
  expect(document.warnings).toEqual([]);
  const codex = document.accounts.find(
    (row: { tool: string; name: string }) => row.tool === "codex" && row.name === "work",
  );
  expect(codex).toMatchObject({
    pool: "default",
    number: 1,
    source: `${HOME}/.codex-work`,
    current: null,
    currentCheckedAt: null,
    status: "unknown",
    usage: {
      fiveHourRemaining: null,
      fiveHourResetsAt: null,
      weeklyRemaining: null,
      weeklyResetsAt: null,
    },
    resetCredits: null,
    usageAgeSeconds: null,
    queryError: null,
  });
  const claude = document.accounts.find((row: { tool: string }) => row.tool === "claude");
  expect(claude.current).toBe(false);
  expect(claude.currentCheckedAt).toBe(new Date(NOW - 60000).toISOString());
  expect(document.accounts.find((row: { tool: string }) => row.tool === "agy").source).toBeNull();
  expect(f.output[0]).not.toMatch(/token|accessToken|account_id/i);
});

test("empty configuration shows the next step instead of an error", async () => {
  const f = fixture();
  f.deps.readPools = async () => ({});
  expect(await main([], f.deps)).toBe(0);
  expect(f.output[0]).toBe(
    `HA Switch ${version} · local dashboard\nNo saved profiles.\nAdd: has add codex work\nHelp: has --help`,
  );
  expect(await main(["list", "--json"], f.deps)).toBe(0);
  expect(JSON.parse(f.output[1]).accounts).toEqual([]);
  expect(await main(["list", "codex"], f.deps)).toBe(1);
  expect(f.errors[0]).toBe("has: pool_config_missing — no saved profiles for this tool");
});

test("list shows one tool per table with sources and accepts short tool names", async () => {
  for (const name of ["codex", "x"]) {
    const f = fixture();
    expect(await main(["list", name], f.deps)).toBe(0);
    expect(reads(f.events)).toEqual(["read:codex-pools.json"]);
    expect(f.output[0]).toStartWith("Codex / default\n\n#  NAME      SHARED HOME");
    expect(f.output[0]).toContain("SOURCE\n1  ~/.codex-work\n2  ~/.codex-personal");
    expect(writes(f.events)).toEqual([]);
  }
  const f = fixture();
  expect(await main(["list", "agy"], f.deps)).toBe(0);
  expect(f.output[0]).toContain("(keychain only)");
  expect(await main(["list", "--pool", "missing"], f.deps)).toBe(2);
  expect(f.errors[0]).toBe("has: pool_unknown — no pool has that name");
  expect(await main(["list", "codex", "--pool", "missing", "--json"], f.deps)).toBe(2);
  expect(JSON.parse(f.output[1])).toEqual({
    schemaVersion: 1,
    command: "list",
    error: { code: "pool_unknown", message: "no pool has that name", next: "has list codex" },
  });
});

test("list --usage queries live usage, records the checked login and keeps failed rows", async () => {
  const f = fixture();
  f.deps.readUsage = async (source) => {
    f.events.push(`usage:${source}`);
    if (source.endsWith("work")) throw new Error("private response");
    return usage(74, 61);
  };
  expect(await main(["list", "codex", "--usage"], f.deps)).toBe(0);
  expect(f.events).toContain("codex-list");
  expect(f.events).toContain("usage:.codex-work");
  expect(f.events).toContain("cache-save");
  expect(f.events).toContain("state:checked");
  expect(f.state.selections["codex/default"]).toMatchObject({ current: "work", checkedAt: NOW });
  expect(f.output[0]).toMatch(
    /1\s+work\s+current · just now\s+\?\s+—\s+\?\s+—\s+\?\s+query failed/,
  );
  expect(f.output[0]).toMatch(
    /2\s+personal\s+—\s+74%\s+in 1h\s+61%\s+in 2d\s+2\s+fresh · just now/,
  );
  expect(f.output[0]).not.toContain("private response");
  expect(f.notes).toEqual([
    "has: work usage query failed (codex_usage_query_failed)",
    "Next: has run codex work --pool default",
  ]);
  expect(f.errors).toEqual([]);
  expect(f.cache["codex/default/personal"]).toMatchObject({ fetchedAt: NOW, resetCredits: 2 });
  expect(f.cache["codex/default/work"]).toMatchObject({
    lastError: { code: "codex_usage_query_failed", at: NOW },
  });
});

test("Claude list --usage reads the adapter once and points failed rows at an isolated run", async () => {
  const f = fixture();
  f.cache["claude/default/personal"] = {
    fetchedAt: NOW - 18 * 60000,
    resetCredits: 1,
    rateLimits: usage(18, 51).rateLimits,
  };
  expect(await main(["list", "claude", "--usage"], f.deps)).toBe(0);
  expect(f.events.filter((event) => event.startsWith("claude-"))).toEqual(["claude-list:false"]);
  expect(f.output[0]).toMatch(/1\s+work\s+—\s+42%\s+in 2h\s+63%\s+in 2d\s+2\s+fresh · just now/);
  expect(f.output[0]).toMatch(
    /2\s+personal\s+current · just now\s+18%\s+in 1h\s+51%\s+in 2d\s+1\s+query failed · 18m ago/,
  );
  expect(f.notes).toEqual([
    "has: personal usage query failed (claude_usage_http_429); last value · 18m ago",
    "Next: has run claude personal --isolated --pool default",
  ]);
  expect(await main(["list", "claude", "--usage", "--json"], f.deps)).toBe(0);
  const document = JSON.parse(f.output[1]);
  expect(document.warnings).toEqual([
    { tool: "claude", pool: "default", account: "personal", code: "claude_usage_http_429" },
  ]);
  expect(document.accounts[1]).toMatchObject({
    status: "query_failed",
    queryError: "claude_usage_http_429",
    current: true,
  });
  expect(document.accounts[1].usage.fiveHourRemaining).toBe(18);
});

test("Claude inaccessible keychain keeps the table, one recovery line, and records nothing", async () => {
  const f = fixture();
  f.deps.listClaude = async (pool) =>
    listClaudeAccounts(pool, {
      home: "/synthetic-keychain-home",
      keychain: {
        read: async () => {
          throw new PoolError("keychain_no_gui_session");
        },
        write: async () => {
          throw new Error("unexpected write");
        },
      },
    });
  expect(await main(["list", "claude", "--usage"], f.deps)).toBe(0);
  expect(f.output[0]).toMatch(/1\s+work\s+unknown\s+\?/);
  expect(f.output[0]).toMatch(/2\s+personal\s+unknown\s+\?/);
  expect(f.notes).toHaveLength(1);
  expect(f.notes[0]).toStartWith("has: keychain_no_gui_session — ");
  expect(f.events).not.toContain("state:checked");
  expect(f.errors).toEqual([]);
});

test("old commands and flags stop with a replacement before any configuration read", async () => {
  const cases: [string[], string][] = [
    [["x"], "has run codex"],
    [["c", "--", "--resume"], "has run claude"],
    [["save", "agy", "work"], "has add agy NAME"],
    [["sync"], "has switch TOOL NAME (switching synchronizes saved logins)"],
    [["--list"], "has list"],
    [["list", "--local"], "has list"],
    [["-s", "2"], "has switch TOOL NUMBER"],
    [["--harness", "c"], "has list TOOL"],
    [["-c", "a", "work"], "has add TOOL NAME"],
    [["run", "codex", "--account", "1"], "has run TOOL NUMBER"],
    [
      ["run", "codex", "--dry-run"],
      "has run TOOL NAME --isolated (no dry-run; test with a source profile)",
    ],
  ];
  for (const [args, next] of cases) {
    const f = fixture();
    expect(await main(args, f.deps)).toBe(2);
    expect(f.events).toEqual([]);
    expect(f.errors).toHaveLength(2);
    expect(f.errors[0]).toMatch(/^has: legacy_(command|option) — /);
    expect(f.errors[1]).toBe(`Next: ${next}`);
  }
  for (const [args, next] of [
    [["switch", "2"], "has switch codex 2"],
    [["restore"], "has restore codex"],
    [["run"], "has run codex"],
  ] as const) {
    const f = fixture();
    expect(await main([...args], f.deps)).toBe(2);
    expect(f.errors).toEqual(["has: host_required — name the tool", `Next: ${next}`]);
    expect(f.events).toEqual([]);
  }
});

test("malformed input fails with exit 2 before reading or changing anything", async () => {
  const cases: [string[], string][] = [
    [["--bogus"], "unknown_option"],
    [["frobnicate"], "unknown_command"],
    [["list", "--pool"], "option_value_missing"],
    [["list", "--usage", "--usage"], "duplicate_option"],
    [["--color", "bright"], "color_mode_invalid"],
    [["list", "codex", "work"], "unknown_argument"],
    [["list", "mystery"], "host_invalid"],
    [["list", "--isolated"], "option_not_applicable"],
    [["--usage"], "option_not_applicable"],
    [["run", "codex", "--json"], "option_not_applicable"],
    [["switch", "codex", "work", "--safe"], "option_not_applicable"],
    [["switch", "codex", "work", "--", "x"], "option_not_applicable"],
    [["restore", "codex", "work"], "unknown_argument"],
    [["run", "agy", "--isolated"], "isolated_not_supported"],
    [["add", "codex"], "account_label_required"],
  ];
  for (const [args, code] of cases) {
    const f = fixture();
    expect(await main(args, f.deps)).toBe(2);
    expect(f.errors[0]).toStartWith(`has: ${code} — `);
    expect(writes(f.events)).toEqual([]);
  }
});

test("run codex without a selector chooses by live usage and launches the shared home", async () => {
  const f = fixture();
  expect(await main(["run", "codex", "--", "resume", "synthetic-session"], f.deps)).toBe(7);
  expect(f.events).toEqual([
    "read:codex-pools.json",
    "codex-list",
    "usage:.codex-work",
    "usage:.codex-personal",
    "cache-save",
    "codex-list",
    "codex-prepare",
    "codex-switch:.codex:personal:true",
    "codex-verify:personal",
    "state:selected",
    "launch:codex:.codex::--dangerously-bypass-approvals-and-sandbox,--dangerously-bypass-hook-trust,-c,model_reasoning_effort=medium,resume,synthetic-session",
  ]);
  expect(f.notes).toEqual([
    "Selecting Codex account by usage policy...",
    "Codex: using personal (74% left, resets in 1h).",
    "Starting Codex in shared home...",
  ]);
  expect(f.state.selections["codex/default"]).toMatchObject({
    current: "personal",
    previous: "work",
  });
  expect(f.errors).toEqual([]);
});

test("run codex refuses when no account qualifies or every usage query failed", async () => {
  const f = fixture();
  f.deps.readUsage = async () => usage(5, 10);
  expect(await main(["run", "codex"], f.deps)).toBe(1);
  expect(f.errors[0]).toContain("no_available_account");
  expect(f.errors[0]).toContain("사용 가능한 계정 없음");
  expect(f.errors[1]).toBe("Next: has run codex NAME");
  f.deps.readUsage = async () => {
    throw new Error("app-server down");
  };
  expect(await main(["run", "codex"], f.deps)).toBe(1);
  expect(f.errors[2]).toStartWith("has: selection_usage_unavailable — ");
  expect(
    f.events.filter((event) => event.startsWith("codex-switch") || event.startsWith("launch")),
  ).toEqual([]);
});

test("explicit selectors skip usage queries: number, exact name, unique fragment, previous", async () => {
  for (const [selector, expected] of [
    ["2", "personal"],
    ["work", "work"],
    ["pers", "personal"],
    ["WORK", "work"],
  ] as const) {
    const f = fixture();
    expect(await main(["run", "codex", selector, "--safe"], f.deps)).toBe(7);
    expect(f.events.filter((event) => event.startsWith("usage:"))).toEqual([]);
    expect(f.events).toContain(`codex-switch:.codex:${expected}:true`);
    expect(f.events.at(-1)).toBe("launch:codex:.codex::");
  }
  const plain = fixture();
  expect(await main(["run", "codex", "1", "--", "resume"], plain.deps)).toBe(7);
  expect(plain.events.at(-1)).toBe(
    "launch:codex:.codex::--dangerously-bypass-approvals-and-sandbox,--dangerously-bypass-hook-trust,-c,model_reasoning_effort=medium,resume",
  );
  const f = fixture();
  f.state.selections["codex/default"] = { current: "work", previous: "personal", checkedAt: NOW };
  expect(await main(["run", "codex", "-"], f.deps)).toBe(7);
  expect(f.events).toContain("codex-switch:.codex:personal:true");
});

test("run claude without a selector launches the shared home with no credential access", async () => {
  const f = fixture();
  expect(await main(["run", "claude", "--", "--version"], f.deps)).toBe(7);
  expect(f.events).toEqual([
    "read:claude-pools.json",
    "launch:claude:.claude::--dangerously-skip-permissions,--version",
  ]);
  expect(f.notes).toEqual(["Claude: using the current shared home..."]);
  const g = fixture();
  expect(await main(["run", "claude", "--safe"], g.deps)).toBe(7);
  expect(g.events.at(-1)).toBe("launch:claude:.claude::");
});

test("named shared Claude run switches the native home, then launches", async () => {
  const f = fixture();
  expect(await main(["run", "claude", "work", "--", "--resume"], f.deps)).toBe(7);
  expect(f.events).toEqual([
    "read:claude-pools.json",
    "claude-switch:.claude:work:false",
    "state:selected",
    "launch:claude:.claude::--dangerously-skip-permissions,--resume",
  ]);
  const g = fixture();
  g.pools.claude = {
    team: { home: ".claude-team", accounts: ["work"], from: { work: ".claude-work" } },
  };
  expect(await main(["run", "claude", "work"], g.deps)).toBe(7);
  expect(g.events).toContain("claude-switch:.claude:work:true");
});

test("Claude keychain failure in a shared run names the isolated next step and launches nothing", async () => {
  const f = fixture();
  f.deps.useClaude = async () => {
    throw new PoolError("keychain_no_gui_session");
  };
  expect(await main(["run", "claude", "work"], f.deps)).toBe(1);
  expect(f.errors).toHaveLength(2);
  expect(f.errors[0]).toStartWith("has: keychain_no_gui_session — ");
  expect(f.errors[1]).toBe("Next: has run claude work --isolated");
  expect(
    f.events.filter((event) => event.startsWith("launch") || event.startsWith("state")),
  ).toEqual([]);
});

test("isolated runs use the source folder, keep the args policy, and never touch the shared login", async () => {
  const f = fixture();
  expect(await main(["run", "claude", "work", "--isolated", "--", "--version"], f.deps)).toBe(7);
  expect(f.events).toEqual([
    "read:claude-pools.json",
    `launch:claude:${HOME}/.claude-work::--dangerously-skip-permissions,--version`,
  ]);
  expect(f.notes).toEqual(["Claude: starting isolated profile work..."]);
  const g = fixture();
  expect(await main(["run", "codex", "2", "--isolated", "--safe", "--", "resume"], g.deps)).toBe(7);
  expect(g.events).toEqual([
    "read:codex-pools.json",
    `launch:codex:${HOME}/.codex-personal::resume`,
  ]);
  const k = fixture();
  expect(await main(["run", "codex", "2", "--isolated"], k.deps)).toBe(7);
  expect(k.events.at(-1)).toBe(
    `launch:codex:${HOME}/.codex-personal::--dangerously-bypass-approvals-and-sandbox,--dangerously-bypass-hook-trust,-c,model_reasoning_effort=medium`,
  );
  const h = fixture();
  h.pools.claude = { default: { home: ".claude", accounts: ["snapshot"] } };
  expect(await main(["run", "claude", "snapshot", "--isolated"], h.deps)).toBe(1);
  expect(h.errors[0]).toStartWith("has: account_source_missing — ");
});

test("Antigravity runs switch only when named and always use the shared keyring", async () => {
  const f = fixture();
  expect(await main(["run", "agy", "--", "--help"], f.deps)).toBe(7);
  expect(f.events).toEqual(["read:agy-pools.json", "launch:agy:.gemini::--help"]);
  const g = fixture();
  expect(await main(["run", "agy", "2"], g.deps)).toBe(7);
  expect(g.events).toEqual([
    "read:agy-pools.json",
    "agy-switch:personal",
    "state:selected",
    "launch:agy:.gemini::",
  ]);
});

test("switch changes the shared login, records history, and explains how to go back", async () => {
  const f = fixture();
  expect(await main(["switch", "codex", "personal"], f.deps)).toBe(0);
  expect(f.events).toEqual([
    "read:codex-pools.json",
    "codex-list",
    "codex-prepare",
    "codex-switch:.codex:personal:true",
    "state:selected",
  ]);
  expect(f.output[0]).toBe(
    "Codex: switched the shared home to personal.\nOpen Codex sessions keep their current login.\nPrevious selection: work. To go back: has switch codex -",
  );
  expect(await main(["switch", "codex", "-"], f.deps)).toBe(0);
  expect(f.events).toContain("codex-switch:.codex:work:true");
  expect(f.state.selections["codex/default"]).toMatchObject({
    current: "work",
    previous: "personal",
  });
  const g = fixture();
  expect(await main(["switch", "claude", "1"], g.deps)).toBe(0);
  expect(await main(["switch", "agy", "2"], g.deps)).toBe(0);
  expect(g.events.filter((event) => event.includes("switch"))).toEqual([
    "claude-switch:.claude:work:false",
    "agy-switch:personal",
  ]);
  expect(g.output[0]).toBe(
    "Claude: switched the shared home to work.\nOpen Claude sessions keep their current login.",
  );
});

test("selector problems stop before any write and name the candidates", async () => {
  const cases: [string[], string, string[]][] = [
    [["switch", "codex"], "selector_required", ["Next: has switch codex work"]],
    [
      ["switch", "codex", "o"],
      "account_selector_ambiguous",
      ["Candidates: work, personal", "Next: has switch codex work"],
    ],
    [["switch", "codex", "zzz"], "account_selector_not_found", ["Next: has list codex"]],
    [["switch", "codex", "3"], "account_number_invalid", ["Next: has list codex"]],
    [["switch", "codex", "0"], "account_number_invalid", ["Next: has list codex"]],
    [["switch", "codex", "-"], "account_previous_missing", ["Next: has list codex"]],
    [["run", "claude", "--isolated"], "selector_required", ["Next: has run claude work"]],
    [["switch", "codex", "--no-input"], "selector_required", ["Next: has switch codex work"]],
  ];
  for (const [args, code, tail] of cases) {
    const f = fixture();
    f.deps.interactive = args.includes("--no-input");
    expect(await main(args, f.deps)).toBe(2);
    expect(f.errors[0]).toStartWith(`has: ${code} — `);
    expect(f.errors.slice(1)).toEqual(tail);
    expect(writes(f.events)).toEqual([]);
  }
});

test("TTY selector asks once for the full pool or the ambiguous candidates, and cancel exits 130", async () => {
  const f = fixture();
  const prompts: string[][] = [];
  f.deps.interactive = true;
  f.deps.prompt = async (title, choices) => {
    prompts.push([title, ...choices]);
    return "2";
  };
  expect(await main(["switch", "codex"], f.deps)).toBe(0);
  expect(prompts).toEqual([["Select Codex account", "work", "personal"]]);
  expect(f.events).toContain("codex-switch:.codex:personal:true");
  prompts.length = 0;
  f.deps.prompt = async (_title, choices) => {
    prompts.push(choices as string[]);
    return "pers";
  };
  expect(await main(["switch", "codex", "o"], f.deps)).toBe(0);
  expect(prompts).toEqual([["work", "personal"]]);
  const g = fixture();
  g.deps.interactive = true;
  g.deps.prompt = async () => undefined;
  expect(await main(["switch", "codex"], g.deps)).toBe(130);
  expect(g.errors).toEqual(["has: cancelled — cancelled; nothing was changed"]);
  expect(writes(g.events)).toEqual([]);
  const h = fixture();
  h.deps.interactive = true;
  const answers = ["9", "work"];
  h.deps.prompt = async () => answers.shift();
  expect(await main(["switch", "codex"], h.deps)).toBe(0);
  expect(h.notes[0]).toBe("has: account_number_invalid — try a number or a unique name");
  expect(h.events).toContain("codex-switch:.codex:work:true");
  const j = fixture();
  j.deps.interactive = true;
  expect(await main(["switch", "codex", "--json"], j.deps)).toBe(2);
});

test("restore uses each native adapter against the shared home and forgets the current selection", async () => {
  const f = fixture();
  f.state.selections["codex/default"] = { current: "personal", previous: "work", checkedAt: NOW };
  expect(await main(["restore", "codex"], f.deps)).toBe(0);
  expect(f.events).toEqual([
    "read:codex-pools.json",
    "codex-restore:.codex:true",
    "state:restored",
  ]);
  expect(f.output[0]).toBe("Codex: restored the first pre-switch login.\nNext: has");
  expect(f.state.selections["codex/default"]).toEqual({ previous: "personal" });
  expect(await main(["restore", "c"], f.deps)).toBe(0);
  expect(await main(["restore", "agy"], f.deps)).toBe(0);
  expect(f.events).toContain("claude-restore:.claude:false");
  expect(f.events).toContain("agy-restore");
  f.deps.restoreCodex = async () => false;
  expect(await main(["restore", "codex"], f.deps)).toBe(1);
  expect(f.errors[0]).toBe("has: backup_missing — no pre-switch login is saved yet");
});

test("add agy saves the current login after preparing configuration", async () => {
  const f = fixture();
  f.pools.agy = {};
  expect(await main(["add", "agy", "personal"], f.deps)).toBe(0);
  expect(f.events).toEqual(["read:agy-pools.json", "agy-config", "agy-capture:personal"]);
  expect(f.output[0]).toBe(
    "Antigravity: saved the current agy login as personal.\nRun: has run agy personal",
  );
  const g = fixture();
  expect(await main(["add", "a", "work"], g.deps)).toBe(1);
  expect(g.errors[0]).toStartWith("has: account_label_taken — ");
  expect(writes(g.events)).toEqual([]);
});

test("add codex runs the official login in a new source and registers it only after verification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ha-switch-add-cli-"));
  try {
    const f = fixture();
    f.deps.readPools = async () => ({});
    f.deps.login = async (command, args, env) => {
      f.events.push(`login:${command}:${args.join(" ")}`);
      const source = env.CODEX_HOME as string;
      await Bun.write(
        join(source, "auth.json"),
        JSON.stringify({ tokens: { account_id: "synthetic-new" } }),
      );
      return { code: 0 };
    };
    expect(await main(["add", "codex", "work", "--config-dir", directory], f.deps)).toBe(0);
    expect(f.events).toEqual(["login:codex:login"]);
    expect(f.notes).toEqual(["Opening official Codex login for work..."]);
    expect(f.output[0]).toBe(
      `Codex: signed in and saved as work.\nRun: has run codex work --config-dir ${directory}`,
    );
    expect(await Bun.file(join(directory, "codex-pools.json")).json()).toEqual({
      default: {
        home: ".codex",
        accounts: ["work"],
        from: { work: join(directory, "profiles", "codex", "work") },
      },
    });
    const g = fixture();
    g.deps.readPools = async () => ({});
    g.deps.login = async () => ({ code: 1 });
    expect(await main(["add", "codex", "other", "--config-dir", directory], g.deps)).toBe(1);
    expect(g.errors).toEqual([
      "has: add_login_failed — sign-in did not finish; profile was not registered",
      "Next: has add codex other",
    ]);
    expect(await Bun.file(join(directory, "codex-pools.json")).json()).toMatchObject({
      default: { accounts: ["work"] },
    });
    const h = fixture();
    h.deps.readPools = async () => ({});
    h.deps.login = async () => ({ code: 130 });
    expect(await main(["add", "codex", "third", "--config-dir", directory], h.deps)).toBe(130);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mutations and live usage need macOS while help, dashboard and list stay available", async () => {
  const f = fixture();
  f.deps.platform = "linux";
  for (const args of [
    ["run", "codex"],
    ["switch", "codex", "1"],
    ["restore", "codex"],
    ["add", "agy", "x"],
    ["list", "--usage"],
  ]) {
    expect(await main(args, f.deps)).toBe(1);
    expect(f.errors.at(-1)).toBe("has: platform_unsupported — this command needs macOS");
  }
  expect(await main([], f.deps)).toBe(0);
  expect(await main(["list", "codex"], f.deps)).toBe(0);
  expect(await main(["--help"], f.deps)).toBe(0);
  expect(writes(f.events)).toEqual([]);
});

test("several pools require --pool for run, switch and restore", async () => {
  const f = fixture();
  f.pools.codex = {
    first: { home: ".codex", accounts: ["work"], from: { work: ".codex-work" } },
    second: { home: ".codex", accounts: ["personal"], from: { personal: ".codex-personal" } },
  };
  expect(await main(["switch", "codex", "1"], f.deps)).toBe(2);
  expect(f.errors).toEqual([
    "has: pool_selection_required — choose one configured pool",
    "Next: has switch codex 1 --pool NAME",
  ]);
  expect(await main(["switch", "codex", "1", "--pool", "second"], f.deps)).toBe(0);
  expect(f.events).toContain("codex-switch:.codex:personal:true");
  expect(await main(["list", "codex"], f.deps)).toBe(0);
  expect(f.output.at(-1)).toContain("Codex / first");
  expect(f.output.at(-1)).toContain("Codex / second");
});

test("unknown exceptions never reveal their message", async () => {
  const f = fixture();
  f.deps.readPools = async () => {
    throw new Error("private credential value");
  };
  expect(await main(["list"], f.deps)).toBe(1);
  expect(f.errors).toEqual([
    "has: unexpected_error — an unexpected error happened; run with LOG_LEVEL=debug for details",
  ]);
  expect(f.errors.join("\n")).not.toContain("private");
});

test("color follows --color, NO_COLOR and the TTY, and JSON is never colored", async () => {
  const cases: [string[], Partial<CliDependencies>, boolean][] = [
    [[], { stdoutIsTTY: true }, true],
    [[], { stdoutIsTTY: false }, false],
    [[], { stdoutIsTTY: true, env: { NO_COLOR: "1" } }, false],
    [[], { stdoutIsTTY: true, env: { NO_COLOR: "" } }, true],
    [["--color", "always"], { stdoutIsTTY: false, env: { NO_COLOR: "1" } }, true],
    [["--color", "never"], { stdoutIsTTY: true }, false],
    [["--json"], { stdoutIsTTY: true }, false],
  ];
  for (const [args, overrides, expected] of cases) {
    const f = fixture();
    Object.assign(f.deps, overrides);
    expect(await main(args, f.deps)).toBe(0);
    expect(f.output[0].includes("\u001b[")).toBe(expected);
  }
});

test("narrow terminals fold the table while wide ones keep every column", async () => {
  const wide = fixture();
  wide.deps.columns = 112;
  wide.state.selections["codex/default"] = { current: "work", checkedAt: NOW - 240000 };
  wide.cache["codex/default/work"] = {
    fetchedAt: NOW - 240000,
    resetCredits: 2,
    rateLimits: usage(74, 61).rateLimits,
  };
  expect(await main([], wide.deps)).toBe(0);
  expect(wide.output[0]).toContain("7D RESET");
  for (const line of wide.output[0].split("\n"))
    expect(Bun.stringWidth(line)).toBeLessThanOrEqual(112);
  const narrow = fixture();
  narrow.deps.columns = 56;
  narrow.state.selections["codex/default"] = { current: "work", checkedAt: NOW - 240000 };
  narrow.cache["codex/default/work"] = {
    fetchedAt: NOW - 240000,
    resetCredits: 2,
    rateLimits: usage(74, 61).rateLimits,
  };
  expect(await main(["list", "codex"], narrow.deps)).toBe(0);
  const text = narrow.output[0];
  expect(text).toContain("#  NAME      HOME  5H   RESET  7D   CR");
  expect(text).toMatch(/1\s+work\s+\*\s+74%\s+in 1h\s+61%\s+2/);
  expect(text).toContain("* last checked shared home · 4m ago");
  expect(text).toContain("  2 personal: unknown");
  expect(text).not.toContain("7D RESET");
  expect(text).not.toContain("SOURCE");
  for (const line of text.split("\n")) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(56);
});
