import { expect, test } from "bun:test";
import { type CliDependencies, main } from "../src/cli.ts";
import type { Host } from "../src/config.ts";
import { PoolError } from "../src/errors.ts";
import type { Pool, Pools } from "../src/types.ts";

function fixture() {
  const calls: string[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const launched: { host: Host; pool: Pool; args: string[] }[] = [];
  const inaccessible = async () => {
    calls.push("credential-access");
    throw new PoolError("keychain_no_gui_session");
  };
  const deps: Partial<CliDependencies> = {
    platform: "darwin",
    home: "/synthetic-home",
    print: (text) => output.push(text),
    error: (text) => errors.push(text),
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
    listCodex: inaccessible,
    listNativeCodex: inaccessible,
    listClaude: inaccessible,
    listAgy: inaccessible,
    readUsage: inaccessible,
    codexSources: inaccessible,
    prepareCodex: inaccessible,
    useCodex: inaccessible,
    useClaude: inaccessible,
    syncCodex: inaccessible,
    syncClaude: inaccessible,
    verifyCodex: inaccessible,
    launch: async (host, pool, args) => {
      launched.push({ host, pool, args });
      return 17;
    },
  };
  return { deps, calls, output, errors, launched };
}

test("direct runs select labels and one-based numbers despite every credential adapter failing", async () => {
  for (const host of ["codex", "claude"]) {
    for (const selector of ["personal", "1", "work", "2"]) {
      const f = fixture();
      expect(await main(["run", host, selector, "--", "--version"], f.deps)).toBe(17);
      expect(f.calls).toEqual([]);
      expect(f.errors).toEqual([]);
      expect(f.launched[0].pool.home).toBe(
        ["1", "personal"].includes(selector)
          ? "/synthetic-home/.profile-one"
          : "/synthetic-other/profile-two",
      );
      expect(f.launched[0].pool.args).toEqual(["--configured"]);
      expect(f.launched[0].args).toEqual(["--version"]);
    }
  }
});

test("default list aliases only read configured names and paths", async () => {
  for (const args of [["list"], ["--list"], ["-h", "c"], ["switch"], ["list", "--local"]]) {
    const f = fixture();
    expect(await main(args, f.deps)).toBe(0);
    expect(f.calls).toEqual([]);
    expect(f.errors).toEqual([]);
    expect(f.output.join("\n")).toContain("/synthetic-other/profile-two");
    expect(f.output.join("\n")).not.toContain("current");
  }
});

test("run rejects missing, unknown, conflicting and out-of-range selection before credential access", async () => {
  for (const tail of [[], ["unknown"], ["0"], ["3"], ["personal", "--account", "1"]]) {
    const f = fixture();
    expect(await main(["run", "claude", ...tail], f.deps)).toBe(1);
    expect(f.calls).toEqual([]);
    expect(f.launched).toEqual([]);
  }
});

test("snapshot-only Claude accounts require a configured source for direct launch", async () => {
  const f = fixture();
  f.deps.readPools = async () => ({ team: { home: ".claude", accounts: ["personal"] } });
  expect(await main(["run", "claude", "personal"], f.deps)).toBe(1);
  expect(f.errors).toEqual(["has: account_source_missing"]);
  expect(f.calls).toEqual([]);
  expect(await main(["list", "claude"], f.deps)).toBe(0);
  expect(f.output[0]).toContain("(no source profile)");
});

test("usage is opt-in and rejects conflicting or unrelated options", async () => {
  const f = fixture();
  expect(await main(["list", "claude", "--usage"], f.deps)).toBe(1);
  expect(f.calls).toEqual(["credential-access"]);
  for (const args of [
    ["list", "--usage", "--local"],
    ["list", "--usage", "--usage"],
    ["run", "claude", "1", "--usage"],
  ]) {
    const g = fixture();
    expect(await main(args, g.deps)).toBe(1);
    expect(g.calls).toEqual([]);
  }
});

test("Claude shortcut keeps read failure instead of reporting an unregistered current account", async () => {
  for (const fallback of [false, true]) {
    const f = fixture();
    let reads = 0;
    f.deps.listClaude = async () => {
      reads++;
      return {
        accounts: [],
        ...(fallback && reads === 1 ? {} : { warnings: ["keychain_no_gui_session"] }),
      };
    };
    expect(await main(["c"], f.deps)).toBe(1);
    expect(f.errors.join("\n")).toContain("keychain_no_gui_session");
    expect(f.errors.join("\n")).not.toContain("account_current_not_in_pool");
    expect(reads).toBe(fallback ? 2 : 1);
    expect(f.launched).toEqual([]);
    expect(f.calls).toEqual([]);
  }
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
      ["codex", "claude"].flatMap((host) =>
        ["one", "two"].map(async (label) => {
          const child = Bun.spawn(
            [
              process.execPath,
              resolve(import.meta.dir, "../src/bin.ts"),
              "run",
              host,
              label,
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
          expect(err).toBe("");
          expect(out).toBe(`${join(home, `.${host}-${label}`)}\n--version\n`);
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
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
