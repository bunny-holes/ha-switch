import { expect, test } from "bun:test";
import { type CliDependencies, main } from "../src/cli.ts";
import type { Host } from "../src/config.ts";
import { PoolError } from "../src/errors.ts";
import type { Pool, Pools } from "../src/types.ts";

function fixture() {
  const calls: string[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const launched: { host: Host; pool: Pool; args: string[] }[] = [];
  const inaccessible = async () => {
    calls.push("credential-access");
    throw new PoolError("keychain_no_gui_session");
  };
  const deps: Partial<CliDependencies> = {
    platform: "darwin",
    home: "/synthetic-home",
    env: {},
    interactive: false,
    stdoutIsTTY: false,
    print: (text) => output.push(text),
    error: (text) => errors.push(text),
    note: (text) => notes.push(text),
    readPools: async (path): Promise<Pools> =>
      path?.endsWith("agy-pools.json")
        ? {}
        : {
            team: {
              home: ".shared-target",
              accounts: ["personal", "work"],
              from: { personal: ".profile-one", work: "/synthetic-other/profile-two" },
              args: ["--configured"],
            },
          },
    listNativeCodex: inaccessible,
    listClaude: inaccessible,
    listAgy: inaccessible,
    readUsage: inaccessible,
    codexSources: inaccessible,
    prepareCodex: inaccessible,
    useCodex: inaccessible,
    useClaude: inaccessible,
    verifyCodex: inaccessible,
    readState: async () => ({ version: 1, selections: {} }),
    updateState: async () => {
      calls.push("state-write");
      return {};
    },
    readCache: async () => ({}),
    saveCache: async () => {
      calls.push("cache-write");
    },
    launch: async (host, pool, args) => {
      launched.push({ host, pool, args });
      return 17;
    },
  };
  return { deps, calls, output, errors, notes, launched };
}

const bypass = {
  codex: ["--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust"],
  claude: ["--dangerously-skip-permissions"],
};

test("isolated runs select labels, numbers and fragments while every credential adapter fails", async () => {
  for (const host of ["codex", "claude"] as const) {
    for (const selector of ["personal", "1", "work", "2", "wor", "PERSONAL"]) {
      const f = fixture();
      expect(await main(["run", host, selector, "--isolated", "--", "--version"], f.deps)).toBe(17);
      expect(f.calls).toEqual([]);
      expect(f.errors).toEqual([]);
      const personal = ["1", "personal", "PERSONAL"].includes(selector);
      expect(f.launched[0].pool.home).toBe(
        personal ? "/synthetic-home/.profile-one" : "/synthetic-other/profile-two",
      );
      expect(f.launched[0].pool.args).toEqual([]);
      expect(f.launched[0].args).toEqual([...bypass[host], "--configured", "--version"]);
      expect(f.notes).toEqual([
        `${host === "codex" ? "Codex" : "Claude"}: starting isolated profile ${personal ? "personal" : "work"}...`,
      ]);
    }
  }
});

test("--safe removes approval bypass flags and pool arguments from isolated runs", async () => {
  const f = fixture();
  expect(await main(["run", "codex", "work", "--isolated", "--safe", "--", "resume"], f.deps)).toBe(
    17,
  );
  expect(f.launched[0].args).toEqual(["resume"]);
});

test("configuration-only lists never touch credentials and show source paths", async () => {
  for (const args of [["list"], ["list", "claude"], []]) {
    const f = fixture();
    expect(await main(args, f.deps)).toBe(0);
    expect(f.calls).toEqual([]);
    expect(f.errors).toEqual([]);
    if (args[0] === "list") expect(f.output.join("\n")).toContain("/synthetic-other/profile-two");
    expect(f.output.join("\n")).not.toContain("current ·");
  }
});

test("isolated run rejects missing, unknown and out-of-range selection before credential access", async () => {
  for (const tail of [[], ["unknown"], ["0"], ["3"], ["-"]]) {
    const f = fixture();
    expect(await main(["run", "claude", ...tail, "--isolated"], f.deps)).toBe(2);
    expect(f.calls).toEqual([]);
    expect(f.launched).toEqual([]);
  }
});

test("snapshot-only Claude accounts require a configured source for isolated launch", async () => {
  const f = fixture();
  f.deps.readPools = async () => ({ team: { home: ".claude", accounts: ["personal"] } });
  expect(await main(["run", "claude", "personal", "--isolated"], f.deps)).toBe(1);
  expect(f.errors[0]).toBe(
    "has: account_source_missing — this profile has no source folder for isolated runs",
  );
  expect(f.calls).toEqual([]);
  expect(await main(["list", "claude"], f.deps)).toBe(0);
  expect(f.output[0]).toContain("(keychain only)");
});

test("shared Claude run with a name reports the keychain failure and offers the isolated run", async () => {
  const f = fixture();
  expect(await main(["run", "claude", "work"], f.deps)).toBe(1);
  expect(f.calls).toEqual(["credential-access"]);
  expect(f.errors[0]).toStartWith("has: keychain_no_gui_session — ");
  expect(f.errors[1]).toBe("Next: has run claude work --isolated");
  expect(f.launched).toEqual([]);
  f.calls.length = 0;
  expect(await main(["run", "claude", "work", "--isolated"], f.deps)).toBe(17);
  expect(f.calls).toEqual([]);
  expect(f.launched[0].pool.home).toBe("/synthetic-other/profile-two");
});

test("native children receive independent profile environments without changing login files", async () => {
  const { chmod, mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const home = await mkdtemp(join(tmpdir(), "ha-switch-direct-test-"));
  try {
    const directory = join(home, ".config", "ha-switch");
    const bin = join(home, "bin");
    for (const host of ["codex", "claude"]) {
      await Bun.write(
        join(directory, `${host}-pools.json`),
        JSON.stringify({
          team: {
            home: `.${host}`,
            accounts: ["one", "two"],
            from: { one: `.${host}-one`, two: `.${host}-two` },
          },
        }),
      );
      await Bun.write(join(home, `.${host}`, "auth.json"), "synthetic-global-unchanged");
      const binary = join(bin, host);
      await Bun.write(
        binary,
        `#!/bin/sh\nprintf '%s\\n' "$${host === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"}" "$@"\n`,
      );
      await chmod(binary, 0o755);
    }
    await Promise.all(
      (["codex", "claude"] as const).flatMap((host) =>
        ["one", "two"].map(async (label) => {
          const child = Bun.spawn(
            [
              process.execPath,
              resolve(import.meta.dir, "../src/bin.ts"),
              "run",
              host,
              label,
              "--isolated",
              "--",
              "--version",
            ],
            {
              cwd: home,
              env: {
                ...process.env,
                HOME: home,
                HA_SWITCH_CONFIG_DIR: directory,
                PATH: `${bin}:${process.env.PATH}`,
                CODEX_HOME: "/synthetic-inherited",
                CLAUDE_CONFIG_DIR: "/synthetic-inherited",
              },
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
            },
          );
          const [out, err, code] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
          ]);
          expect(code).toBe(0);
          expect(err).toBe(
            `${host === "codex" ? "Codex" : "Claude"}: starting isolated profile ${label}...\n`,
          );
          expect(out).toBe(
            `${join(home, `.${host}-${label}`)}\n${bypass[host].join("\n")}\n--version\n`,
          );
        }),
      ),
    );
    for (const host of ["codex", "claude"]) {
      expect(await Bun.file(join(home, `.${host}`, "auth.json")).text()).toBe(
        "synthetic-global-unchanged",
      );
      expect(await Bun.file(join(home, `.${host}`, "auth.json.ha-switch-backup")).exists()).toBe(
        false,
      );
    }
    expect(await Bun.file(join(directory, "state.json")).exists()).toBe(false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
