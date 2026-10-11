import { expect, test } from "bun:test";
import { version } from "../package.json";
import { type CliDependencies, main } from "../src/cli.ts";
import type { Pool, Pools } from "../src/types.ts";

function fixture() {
  const output: string[] = [];
  const errors: string[] = [];
  const events: string[] = [];
  const pool = { home: ".codex", accounts: ["account-a", "account-b"] };
  const deps: Partial<CliDependencies> = {
    platform: "darwin",
    home: "/unused-test-home",
    print: (text) => output.push(text),
    error: (text) => errors.push(text),
    readPools: async (path): Promise<Pools> =>
      path?.endsWith("agy-pools.json") ? {} : { default: pool },
    listCodex: async () => ({
      current: "account-a",
      accounts: pool.accounts.map((account) => ({ account, plan: "plus" })),
    }),
    listClaude: async (_pool, options) => {
      events.push(`claude-list:${options?.local}`);
      return { accounts: [{ account: "account-a", resetCredits: 0 }] };
    },
    syncCodex: async () => {
      events.push("codex-sync");
    },
    readUsage: async (account) => {
      events.push(`query:${account}`);
      return {
        resetCredits: 0,
        rateLimits: { primary: { windowDurationMins: 300, usedPercent: 25 } },
      };
    },
    useCodex: async (_pool, account) => {
      events.push(`codex-switch:${account}`);
    },
    useClaude: async (_pool, account) => {
      events.push(`claude-switch:${account}`);
    },
    syncClaude: async () => {
      events.push("claude-sync");
      return [];
    },
    restoreClaude: async () => {
      events.push("claude-restore");
      return { accountUuid: "account-a" };
    },
    launch: async (_host, _pool: Pool, args: string[]) => {
      events.push(`run:${args.join(",")}`);
      return 7;
    },
  };
  return { output, errors, events, deps };
}

test("help and version never read local state", async () => {
  const f = fixture();
  f.deps.readPools = async () => {
    throw new Error("must not read");
  };
  expect(await main([], f.deps)).toBe(0);
  expect(await main(["--help"], f.deps)).toBe(0);
  expect(await main(["--version"], f.deps)).toBe(0);
  expect(f.errors).toEqual([]);
  expect(f.events).toEqual([]);
  expect(f.output.join("\n")).toContain("restore <codex|claude|agy>");
});
test("help and version use package version", async () => {
  const f = fixture();
  await main(["--version"], f.deps);
  await main(["--help"], f.deps);
  expect(f.output[0]).toBe(version);
  expect(f.output[1]).toStartWith(`HA Switch ${version}\n`);
});
test("explicit config directory overrides environment", async () => {
  const f = fixture();
  const previous = process.env.HA_SWITCH_CONFIG_DIR;
  const paths: (string | undefined)[] = [];
  f.deps.readPools = async (path) => {
    paths.push(path);
    return { default: { home: ".codex", accounts: ["account-a"] } };
  };
  try {
    process.env.HA_SWITCH_CONFIG_DIR = "/test-env-config";
    expect(await main(["list", "codex", "--local"], f.deps)).toBe(0);
    expect(
      await main(["list", "codex", "--local", "--config-dir", "/test-explicit-config"], f.deps),
    ).toBe(0);
    expect(paths).toEqual([
      "/test-env-config/codex-pools.json",
      "/test-explicit-config/codex-pools.json",
    ]);
  } finally {
    if (previous === undefined) delete process.env.HA_SWITCH_CONFIG_DIR;
    else process.env.HA_SWITCH_CONFIG_DIR = previous;
  }
});
test("--list shows configured harnesses, profiles, current selection and live usage", async () => {
  const f = fixture();
  expect(await main(["--list"], f.deps)).toBe(0);
  expect(f.output.join("\n")).toContain("Codex / default");
  expect(f.output.join("\n")).toContain("Claude / default");
  expect(f.output[0]).toContain("profile");
  expect(f.output[0]).toContain("* current profile");
  expect(f.output[0]).toMatch(/\*\s+1\s+account-a/m);
  expect(f.output[0]).toContain("has -h x");
  expect(f.output[0]).toContain("-s <NUMBER>");
  expect(f.output.join("\n")).toContain("75%");
  expect(f.events).toContain("codex-sync");
});

test("selecting a harness lists only that harness for shortcuts and full names", async () => {
  const harnesses = [
    ["c", "claude", "Claude"],
    ["claude", "claude", "Claude"],
    ["x", "codex", "Codex"],
    ["codex", "codex", "Codex"],
    ["a", "agy", "Antigravity"],
    ["antigravity", "agy", "Antigravity"],
    ["agy", "agy", "Antigravity"],
  ] as const;
  for (const [name, host, title] of harnesses) {
    const f = fixture();
    const loaded: string[] = [];
    f.deps.readPools = async (path) => {
      loaded.push(path?.split("/").pop() ?? "");
      return {
        default: {
          home: host === "agy" ? ".gemini" : ".test-target",
          accounts: ["account-a", "account-b"],
        },
      };
    };
    f.deps.listAgy = async () => ({ accounts: [{ account: "account-a" }] });
    expect(await main(["-h", name, "--local"], f.deps)).toBe(0);
    expect(loaded).toEqual([`${host}-pools.json`]);
    expect(f.output).toHaveLength(1);
    expect(f.output[0]).toContain(`${title} / default`);
    expect(f.errors).toEqual([]);
  }
});

test("short flags switch Claude to the profile number shown in the list", async () => {
  const f = fixture();
  f.deps.listClaude = async () => ({
    current: "account-a",
    accounts: [{ account: "account-b" }, { account: "account-a" }],
  });
  expect(await main(["--list", "-h", "c", "--local"], f.deps)).toBe(0);
  expect(f.output[0]).toMatch(/\b2\s+account-b/m);
  expect(await main(["-h", "c", "-s", "2"], f.deps)).toBe(0);
  expect(f.events).toEqual(["claude-switch:account-b"]);
  expect(f.errors).toEqual([]);
});

test("long flags switch every harness through its native adapter", async () => {
  for (const [name, host] of [
    ["codex", "codex"],
    ["claude", "claude"],
    ["antigravity", "agy"],
  ] as const) {
    const f = fixture();
    f.deps.readPools = async () => ({
      default: {
        home: host === "agy" ? ".gemini" : ".test-target",
        accounts: ["account-a", "account-b"],
      },
    });
    f.deps.useAgy = async (_pool, account) => {
      f.events.push(`agy-switch:${account}`);
    };
    expect(await main(["--harness", name, "--switch", "2"], f.deps)).toBe(0);
    expect(f.events).toEqual([`${host}-switch:account-b`]);
    expect(f.errors).toEqual([]);
  }
});

test("conflicting or incomplete flags fail before reading or changing accounts", async () => {
  const inputs = [
    ["-h"],
    ["-s"],
    ["-s", "2"],
    ["-h", "unknown", "-s", "2"],
    ["--list", "--list"],
    ["--list", "-h", "c", "-s", "2"],
    ["list", "-h", "c"],
    ["-h", "c", "--harness", "x"],
    ["-h", "c", "-s", "1", "--switch", "2"],
    ["-h", "c", "-s", "--list"],
  ];
  for (const args of inputs) {
    const f = fixture();
    let reads = 0;
    f.deps.readPools = async () => {
      reads++;
      return {};
    };
    expect(await main(args, f.deps)).toBe(1);
    expect(reads).toBe(0);
    expect(f.events).toEqual([]);
    expect(f.errors).toHaveLength(1);
  }
});

test("switch flags reject invalid profile numbers without changing accounts", async () => {
  for (const number of ["0", "3", "2.5", "label"]) {
    const f = fixture();
    expect(await main(["-h", "c", "-s", number], f.deps)).toBe(1);
    expect(f.events).toEqual([]);
    expect(f.errors).toEqual(["has: account_number_invalid"]);
  }
});

test("local lists skip all writes and usage queries", async () => {
  const f = fixture();
  expect(await main(["list", "--local"], f.deps)).toBe(0);
  expect(f.events).toEqual(["claude-list:true"]);
});
test("switch uses shown number and refuses ambiguous pools before writes", async () => {
  const f = fixture();
  expect(await main(["switch", "codex", "2"], f.deps)).toBe(0);
  expect(f.events).toEqual(["codex-switch:account-b"]);
  f.events.length = 0;
  f.deps.readPools = async () => ({
    first: { home: ".codex", accounts: ["account-a"] },
    second: { home: ".codex", accounts: ["account-b"] },
  });
  expect(await main(["switch", "codex", "1"], f.deps)).toBe(1);
  expect(await main(["-h", "x", "-s", "1"], f.deps)).toBe(1);
  expect(f.events).toEqual([]);
  expect(f.errors).toContain("has: pool_selection_required");
});
test("run preserves forwarded arguments and child exit code", async () => {
  const f = fixture();
  expect(await main(["run", "codex", "--account", "1", "--", "--help", "resume"], f.deps)).toBe(7);
  expect(f.events).toContain("run:--help,resume");
  expect(f.events).toContain("codex-switch:account-a");
});
test("invalid run account refuses sync and launch", async () => {
  const f = fixture();
  expect(await main(["run", "codex", "--account", "0"], f.deps)).toBe(1);
  expect(f.events).toEqual([]);
});
test("failed usage remains a visible row alongside usable accounts", async () => {
  const f = fixture();
  f.deps.readUsage = async (account) => {
    if (account === "account-a") throw new Error("private response");
    return {
      resetCredits: 0,
      rateLimits: { primary: { windowDurationMins: 300, usedPercent: 0 } },
    };
  };
  expect(await main(["list", "codex"], f.deps)).toBe(0);
  expect(f.output[0]).toContain("account-a");
  expect(f.output[0]).toContain("query failed");
  expect(f.output[0]).toContain("account-b");
  expect(f.output[0]).toContain("100%");
  expect(f.output[0]).not.toContain("private response");
});
test("one configured host is enough for default list", async () => {
  const f = fixture();
  f.deps.readPools = async (path): Promise<Pools> =>
    path?.endsWith("codex-pools.json")
      ? { default: { home: ".codex", accounts: ["account-a"] } }
      : {};
  expect(await main(["list", "--pool", "default", "--local"], f.deps)).toBe(0);
  expect(f.output).toHaveLength(1);
  expect(f.events).toEqual([]);
});
test("Claude switch, sync and restore use only their named adapters", async () => {
  const f = fixture();
  expect(await main(["switch", "claude", "1"], f.deps)).toBe(0);
  expect(await main(["sync", "claude"], f.deps)).toBe(0);
  expect(await main(["restore", "claude"], f.deps)).toBe(0);
  expect(f.events).toEqual(["claude-switch:account-a", "claude-sync", "claude-restore"]);
});
test("normal Claude list calls only its read-only listing adapter and keeps usage columns", async () => {
  const f = fixture();
  f.deps.listClaude = async (_pool, options) => {
    expect(options?.local).toBe(false);
    f.events.push("claude-list");
    return {
      current: "account-a",
      accounts: [
        {
          account: "account-a",
          plan: "plus",
          resetCredits: 0,
          rateLimits: {
            primary: { windowDurationMins: 300, usedPercent: 25, resetsAt: 2000000000 },
            secondary: { windowDurationMins: 10080, usedPercent: 10, resetsAt: 2000001000 },
          },
        },
      ],
    };
  };
  f.deps.syncClaude = async () => {
    throw new Error("unexpected synchronization");
  };
  f.deps.useClaude = async () => {
    throw new Error("unexpected switch");
  };
  expect(await main(["list", "claude"], f.deps)).toBe(0);
  expect(f.events).toEqual(["claude-list"]);
  for (const field of [
    "plan",
    "5-hour left",
    "5-hour resets",
    "weekly left",
    "weekly resets",
    "reset credits",
    "75%",
    "90%",
    "plus",
  ])
    expect(f.output[0]).toContain(field);
  expect(f.output[0]).toMatch(/account-a.*\s0$/m);
});
test("Claude switch and selected run avoid redundant synchronization", async () => {
  const f = fixture();
  f.deps.syncClaude = async () => {
    throw new Error("unexpected synchronization");
  };
  expect(await main(["switch", "claude", "2"], f.deps)).toBe(0);
  expect(f.events).toEqual(["claude-switch:account-b"]);
  f.events.length = 0;
  expect(await main(["run", "claude", "--account", "1"], f.deps)).toBe(7);
  expect(f.events).toEqual(["claude-switch:account-a", "run:"]);
});
test("Claude run without account synchronizes once before launch", async () => {
  const f = fixture();
  expect(await main(["run", "claude"], f.deps)).toBe(7);
  expect(f.events).toEqual(["claude-sync", "run:"]);
});
test("unknown exceptions do not reveal messages", async () => {
  const f = fixture();
  f.deps.readPools = async () => {
    throw new Error("private credential value");
  };
  expect(await main(["--list"], f.deps)).toBe(1);
  expect(f.errors).toEqual(["has: unexpected_error"]);
});
test("explicit import passes configured Claude pools to legacy adapter", async () => {
  const f = fixture();
  f.deps.import = async () => ({
    claude: { default: { home: ".claude", accounts: ["account-a"] } },
  });
  f.deps.importLegacy = async (pools) => {
    expect(pools.default.accounts).toEqual(["account-a"]);
    f.events.push("import-legacy");
    return 1;
  };
  expect(
    await main(["import", "--from", "/test-source", "--config-dir", "/test-destination"], f.deps),
  ).toBe(0);
  expect(f.events).toEqual(["import-legacy"]);
});
test("Claude validates every pool before listing, switching or legacy import", async () => {
  for (const accounts of [["bad/name"], ["account-a", "account-a"]]) {
    const f = fixture();
    const malformed = { default: { home: ".claude", accounts } };
    f.deps.readPools = async () => malformed;
    f.deps.import = async () => ({ claude: malformed });
    f.deps.importLegacy = async () => {
      f.events.push("legacy-import");
      return 0;
    };
    expect(await main(["list", "claude"], f.deps)).toBe(1);
    expect(await main(["switch", "claude", "1"], f.deps)).toBe(1);
    expect(await main(["import", "--from", "/test-source"], f.deps)).toBe(1);
    expect(f.events).toEqual([]);
  }
});
test("later invalid host configuration prevents all earlier-host mutations", async () => {
  const f = fixture();
  f.deps.readPools = async (path): Promise<Pools> =>
    path?.endsWith("agy-pools.json")
      ? {}
      : path?.endsWith("claude-pools.json")
        ? { default: { home: ".claude", accounts: ["bad/name"] } }
        : { default: { home: ".codex-target", accounts: ["account-a"] } };
  expect(await main(["--list"], f.deps)).toBe(1);
  expect(await main(["sync"], f.deps)).toBe(1);
  expect(f.events).toEqual([]);
});
test("Antigravity save prepares labeled configuration before capturing login", async () => {
  for (const args of [
    ["save", "agy", "account-a"],
    ["-c", "a", "account-a"],
    ["--create", "antigravity", "account-a"],
    ["--create", "agy", "account-a"],
  ]) {
    const f = fixture();
    let next: Pools | undefined;
    f.deps.captureAgy = async (label) => {
      f.events.push(`agy-save:${label}`);
    };
    f.deps.saveAgy = async (_directory, previous, configurations, capture) => {
      expect(previous).toEqual({});
      next = configurations;
      f.events.push("agy-preflight");
      await capture();
    };
    expect(await main(args, f.deps)).toBe(0);
    expect(next).toEqual({ default: { home: ".gemini", accounts: ["account-a"] } });
    expect(f.events).toEqual(["agy-preflight", "agy-save:account-a"]);
    expect(f.errors).toEqual([]);
  }
});
test("create flags append to the selected pool and preserve other configuration", async () => {
  const f = fixture();
  const previous: Pools = {
    first: { home: ".gemini", accounts: ["account-a"], args: ["--debug"] },
    second: { home: ".gemini", accounts: ["account-b"] },
  };
  let next: Pools | undefined;
  f.deps.readPools = async (path) => {
    expect(path).toBe("/test-explicit-config/agy-pools.json");
    return previous;
  };
  f.deps.captureAgy = async (label) => {
    f.events.push(`agy-save:${label}`);
  };
  f.deps.saveAgy = async (directory, before, configurations, capture) => {
    expect(directory).toBe("/test-explicit-config");
    expect(before).toEqual(previous);
    next = configurations;
    await capture();
  };
  expect(
    await main(
      ["-c", "a", "account-c", "--pool", "first", "--config-dir", "/test-explicit-config"],
      f.deps,
    ),
  ).toBe(0);
  expect(next).toEqual({
    ...previous,
    first: { ...previous.first, accounts: ["account-a", "account-c"] },
  });
  expect(previous.first.accounts).toEqual(["account-a"]);
  expect(f.events).toEqual(["agy-save:account-c"]);
});
test("invalid create flags fail before reading or changing accounts", async () => {
  for (const args of [
    ["-c"],
    ["-c", "a"],
    ["-c", "a", "account-a", "--create", "a"],
    ["-c", "a", "account-a", "--list"],
    ["-c", "a", "account-a", "-s", "1"],
    ["-c", "a", "account-a", "-h", "a"],
    ["-c", "a", "account-a", "--local"],
    ["-c", "a", "account-a", "account-b"],
    ["-c", "a", "account-a", "--", "--help"],
    ["-c", "x", "account-a"],
    ["--create", "claude", "account-a"],
    ["-c", "unknown", "account-a"],
  ]) {
    const f = fixture();
    let reads = 0;
    f.deps.readPools = async () => {
      reads++;
      return {};
    };
    f.deps.captureAgy = async () => {
      f.events.push("capture");
    };
    f.deps.saveAgy = async () => {
      f.events.push("config-write");
    };
    expect(await main(args, f.deps)).toBe(1);
    expect(reads).toBe(0);
    expect(f.events).toEqual([]);
    expect(f.errors).toHaveLength(1);
  }
});
test("Antigravity labels are validated before snapshot or config writes", async () => {
  const f = fixture();
  f.deps.captureAgy = async () => {
    f.events.push("capture");
  };
  f.deps.saveAgy = async () => {
    f.events.push("config-write");
  };
  expect(await main(["save", "agy", "bad/name"], f.deps)).toBe(1);
  expect(await main(["-c", "a", "bad/name"], f.deps)).toBe(1);
  expect(f.events).toEqual([]);
});
test("Antigravity list, switch, sync and restore use native adapter", async () => {
  const f = fixture();
  f.deps.readPools = async (): Promise<Pools> => ({
    default: { home: ".gemini", accounts: ["account-a", "account-b"] },
  });
  f.deps.listAgy = async () => {
    f.events.push("agy-list");
    return { current: "account-a", accounts: [{ account: "account-a" }, { account: "account-b" }] };
  };
  f.deps.useAgy = async (_pool, account) => {
    f.events.push(`agy-switch:${account}`);
  };
  f.deps.syncAgy = async () => {
    f.events.push("agy-sync");
  };
  f.deps.restoreAgy = async () => {
    f.events.push("agy-restore");
  };
  expect(await main(["list", "agy", "--local"], f.deps)).toBe(0);
  expect(await main(["switch", "agy", "2"], f.deps)).toBe(0);
  expect(await main(["sync", "agy"], f.deps)).toBe(0);
  expect(await main(["restore", "agy"], f.deps)).toBe(0);
  expect(f.events).toEqual(["agy-list", "agy-switch:account-b", "agy-sync", "agy-restore"]);
  expect(f.output[0]).toContain("Antigravity / default");
  expect(f.output[0]).toContain("unknown");
});
test("switch without a number lists accounts for shell wrapper use", async () => {
  const f = fixture();
  expect(await main(["switch", "codex", "--local"], f.deps)).toBe(0);
  expect(f.output[0]).toContain("Codex / default");
  expect(f.events).toEqual([]);
});
test("mutation is macOS only while help and local list remain available", async () => {
  const f = fixture();
  f.deps.platform = "linux";
  expect(await main(["switch", "codex", "1"], f.deps)).toBe(1);
  expect(await main(["save", "agy", "account-a"], f.deps)).toBe(1);
  expect(await main(["-c", "a", "account-a"], f.deps)).toBe(1);
  expect(await main(["--help"], f.deps)).toBe(0);
  expect(await main(["list", "codex", "--local"], f.deps)).toBe(0);
  expect(f.events).toEqual([]);
  expect(f.errors).toEqual([
    "has: platform_unsupported",
    "has: platform_unsupported",
    "has: platform_unsupported",
  ]);
});
test("run supports Claude and Antigravity account selection with forwarded args", async () => {
  const f = fixture();
  f.deps.readPools = async (): Promise<Pools> => ({
    default: { home: ".gemini", accounts: ["account-a", "account-b"] },
  });
  f.deps.useAgy = async (_pool, account) => {
    f.events.push(`agy-switch:${account}`);
  };
  f.deps.launch = async (host, _pool, args) => {
    f.events.push(`launch:${host}:${args.join(",")}`);
    return 0;
  };
  expect(await main(["run", "claude", "--account", "2", "--", "--resume"], f.deps)).toBe(0);
  expect(await main(["run", "agy", "--account", "1", "--", "--help"], f.deps)).toBe(0);
  expect(f.events).toEqual([
    "claude-switch:account-b",
    "launch:claude:--resume",
    "agy-switch:account-a",
    "launch:agy:--help",
  ]);
});
test("Codex restore has a named missing-backup error", async () => {
  const f = fixture();
  f.deps.restoreCodex = async () => false;
  expect(await main(["restore", "codex"], f.deps)).toBe(1);
  expect(f.errors).toEqual(["has: backup_missing"]);
});
