import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type CliDependencies, main } from "../src/cli.ts";
import type { CodexSelectionPolicy } from "../src/selection.ts";
import type { AccountUsage } from "../src/types.ts";

const labels = [".codex", ".codex-pkl1", ".codex-pkl2"];
const auth = (number: number) =>
  JSON.stringify({ tokens: { account_id: `synthetic-${number}` }, last_refresh: "2026-01-01" });
const usage = (five: number, weekly: number): AccountUsage => ({
  resetCredits: 0,
  rateLimits: {
    primary: { usedPercent: 100 - five, windowDurationMins: 300 },
    secondary: { usedPercent: 100 - weekly, windowDurationMins: 10080 },
  },
});

async function fixture(selection?: CodexSelectionPolicy) {
  const home = await mkdtemp(join(tmpdir(), "ha-switch-cli-native-"));
  const directory = join(home, ".config", "ha-switch");
  await mkdir(directory, { recursive: true });
  await Bun.write(
    join(directory, "codex-pools.json"),
    JSON.stringify({ pkls: { home: ".codex-pkls", accounts: labels, selection } }),
  );
  for (const [index, label] of [...labels, ".codex-pkls"].entries()) {
    await mkdir(join(home, label));
    await Bun.write(join(home, label, "auth.json"), auth(index + 1));
    await Bun.write(join(home, label, "config.toml"), `# synthetic settings ${index}\n`);
  }
  const output: string[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const launches: { home: string; login: string }[] = [];
  const queries: string[] = [];
  let remaining = [usage(80, 80), usage(30, 80), usage(60, 80)];
  const deps: Partial<CliDependencies> = {
    platform: "darwin",
    home,
    print: (text) => output.push(text),
    error: (text) => errors.push(text),
    note: (text) => notes.push(text),
    interactive: false,
    stdoutIsTTY: false,
    readUsage: async (source) => {
      queries.push(source);
      const index =
        source === join(directory, "codex-accounts", "native")
          ? 0
          : labels.indexOf(source.replace(`${home}/`, ""));
      if (index < 0) throw new Error("unexpected_synthetic_source");
      return remaining[index];
    },
    launch: async (host, pool, _args, launchHome) => {
      expect(host).toBe("codex");
      expect(launchHome).toBe(home);
      launches.push({
        home: pool.home,
        login: await Bun.file(resolve(home, pool.home, "auth.json")).text(),
      });
      return 0;
    },
  };
  return {
    home,
    directory,
    output,
    errors,
    notes,
    launches,
    queries,
    setUsage: (next: AccountUsage[]) => {
      remaining = next;
    },
    run: (args: string[]) => main([...args, "--config-dir", directory], deps),
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}

test("switch codex 2 uses native adapters and preserves profile sources and settings", async () => {
  const f = await fixture();
  try {
    expect(await f.run(["switch", "codex", "2"])).toBe(0);
    expect(await Bun.file(join(f.home, ".codex", "auth.json")).text()).toBe(auth(2));
    expect(await Bun.file(join(f.directory, "codex-accounts", "native", "auth.json")).text()).toBe(
      auth(1),
    );
    expect(await Bun.file(join(f.home, ".codex", "auth.json.ha-switch-backup")).text()).toBe(
      auth(1),
    );
    for (const [index, label] of [...labels, ".codex-pkls"].entries()) {
      expect(await Bun.file(join(f.home, label, "config.toml")).text()).toBe(
        `# synthetic settings ${index}\n`,
      );
      if (index > 0)
        expect(await Bun.file(join(f.home, label, "auth.json")).text()).toBe(auth(index + 1));
    }
    expect(f.launches).toHaveLength(0);
    expect(f.queries).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});

test("run codex 3 replaces the native login before launch and skips usage", async () => {
  const f = await fixture();
  try {
    f.setUsage([usage(0, 0), usage(0, 0), usage(0, 0)]);
    expect(await f.run(["run", "codex", "3"])).toBe(0);
    expect(f.launches).toEqual([{ home: ".codex", login: auth(3) }]);
    expect(f.queries).toHaveLength(0);
  } finally {
    await f.cleanup();
  }
});

test("run codex chooses the larger five-hour balance and sequentially falls back to account 1", async () => {
  const f = await fixture();
  try {
    expect(await f.run(["run", "codex"])).toBe(0);
    expect(f.launches[0]).toEqual({ home: ".codex", login: auth(3) });
    f.setUsage([usage(80, 21), usage(9, 80), usage(9, 80)]);
    expect(await f.run(["run", "codex"])).toBe(0);
    expect(f.launches[1]).toEqual({ home: ".codex", login: auth(1) });
    expect(f.queries).toHaveLength(6);
  } finally {
    await f.cleanup();
  }
});

test("run codex refuses at the fallback weekly floor without launch or credential writes", async () => {
  const f = await fixture();
  try {
    f.setUsage([usage(80, 20), usage(9, 80), usage(9, 80)]);
    expect(await f.run(["run", "codex"])).not.toBe(0);
    expect(f.errors.join("\n")).toContain("사용 가능한 계정 없음");
    expect(f.launches).toHaveLength(0);
    for (const [index, label] of [...labels, ".codex-pkls"].entries())
      expect(await Bun.file(join(f.home, label, "auth.json")).text()).toBe(auth(index + 1));
    expect(
      await Bun.file(join(f.directory, "codex-accounts", "native", "auth.json")).exists(),
    ).toBe(false);
    expect(await Bun.file(join(f.home, ".codex", "auth.json.ha-switch-backup")).exists()).toBe(
      false,
    );
  } finally {
    await f.cleanup();
  }
});

test("run codex honors configured preferred accounts, threshold, fallback and weekly floor", async () => {
  const f = await fixture({
    priority: [2],
    minimumFiveHourRemaining: 40,
    fallback: 3,
    minimumFallbackWeeklyRemaining: 50,
  });
  try {
    f.setUsage([usage(80, 80), usage(39, 80), usage(60, 51)]);
    expect(await f.run(["run", "codex"])).toBe(0);
    expect(f.launches[0]).toEqual({ home: ".codex", login: auth(3) });
    f.setUsage([usage(80, 80), usage(40, 80), usage(60, 50)]);
    expect(await f.run(["run", "codex"])).toBe(0);
    expect(f.launches[1]).toEqual({ home: ".codex", login: auth(2) });
    f.setUsage([usage(80, 80), usage(39, 80), usage(60, 50)]);
    expect(await f.run(["run", "codex"])).not.toBe(0);
    expect(f.launches).toHaveLength(2);
  } finally {
    await f.cleanup();
  }
});

test("native commands work after the legacy target is removed", async () => {
  const f = await fixture();
  try {
    await rm(join(f.home, ".codex-pkls"), { recursive: true });
    expect(await f.run(["run", "codex", "2", "--pool", "pkls"])).toBe(0);
    expect(f.launches[0]).toEqual({ home: ".codex", login: auth(2) });
    expect(await f.run(["list", "codex"])).toBe(0);
    expect(f.output.join("\n")).toContain(".codex-pkl1");
    expect(await Bun.file(join(f.home, ".codex-pkls", "auth.json")).exists()).toBe(false);
  } finally {
    await f.cleanup();
  }
});

test("a pool configured with the native target preserves source account 1", async () => {
  const f = await fixture();
  try {
    await Bun.write(
      join(f.directory, "codex-pools.json"),
      JSON.stringify({ pkls: { home: ".codex", accounts: labels } }),
    );
    await rm(join(f.home, ".codex-pkls"), { recursive: true });
    expect(await f.run(["run", "codex", "3", "--pool", "pkls"])).toBe(0);
    expect(f.launches[0]).toEqual({ home: ".codex", login: auth(3) });
    expect(await Bun.file(join(f.directory, "codex-accounts", "native", "auth.json")).text()).toBe(
      auth(1),
    );
    expect(await f.run(["switch", "codex", "1"])).toBe(0);
    expect(await Bun.file(join(f.home, ".codex", "auth.json")).text()).toBe(auth(1));
  } finally {
    await f.cleanup();
  }
});

test("direct run bypasses the retired target without recreating it", async () => {
  const f = await fixture();
  try {
    await rm(join(f.home, ".codex-pkls"), { recursive: true });
    expect(await f.run(["run", "codex", "2", "--pool", "pkls", "--isolated"])).toBe(0);
    expect(f.errors).toEqual([]);
    expect(f.launches).toEqual([{ home: resolve(f.home, labels[1]), login: auth(2) }]);
    expect(f.queries).toEqual([]);
    expect(await Bun.file(join(f.home, ".codex-pkls", "auth.json")).exists()).toBe(false);
    expect(await Bun.file(join(f.home, ".codex", "auth.json")).text()).toBe(auth(1));
  } finally {
    await f.cleanup();
  }
});
