import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addProfile,
  claudeStatusVerified,
  type LoginRunner,
  profileSourcePath,
} from "../src/add.ts";
import { commitProfileRegistration, prepareProfileRegistration } from "../src/config.ts";

const paths: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "ha-switch-add-"));
  paths.push(path);
  return path;
}
afterEach(async () => {
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

const signIn =
  (events: string[]): LoginRunner =>
  async (command, args, env, options) => {
    events.push(`${command} ${args.join(" ")}${options?.capture ? " (captured)" : ""}`);
    if (command === "codex") {
      await Bun.write(
        join(env.CODEX_HOME as string, "auth.json"),
        JSON.stringify({ tokens: { account_id: "synthetic-new" } }),
      );
      return { code: 0 };
    }
    if (args[1] === "login") {
      await Bun.write(join(env.CLAUDE_CONFIG_DIR as string, ".credentials.json"), "{}");
      return { code: 0 };
    }
    return {
      code: 0,
      stdout: JSON.stringify({
        loggedIn: true,
        authMethod: "claude.ai",
        configDirectory: env.CLAUDE_CONFIG_DIR,
        email: "private@example.invalid",
      }),
    };
  };

test("add registers Codex and Claude sources only after the official login is verified", async () => {
  const directory = await temporary();
  const home = await temporary();
  const events: string[] = [];
  const codex = await addProfile("codex", "work", {
    directory,
    home,
    run: signIn(events),
    env: {},
  });
  expect(codex).toEqual({ pool: "default", source: profileSourcePath(directory, "codex", "work") });
  expect((await stat(codex.source)).mode & 0o777).toBe(0o700);
  const claude = await addProfile("claude", "work", {
    directory,
    home,
    run: signIn(events),
    env: {},
  });
  expect(events).toEqual([
    "codex login",
    "claude auth login",
    "claude auth status --json (captured)",
  ]);
  expect(await Bun.file(join(directory, "codex-pools.json")).json()).toEqual({
    default: { home: ".codex", accounts: ["work"], from: { work: codex.source } },
  });
  expect(await Bun.file(join(directory, "claude-pools.json")).json()).toEqual({
    default: { home: ".claude", accounts: ["work"], from: { work: claude.source } },
  });
  expect((await stat(join(directory, "codex-pools.json"))).mode & 0o777).toBe(0o600);
  await addProfile("codex", "personal", { directory, home, run: signIn(events), env: {} });
  expect((await Bun.file(join(directory, "codex-pools.json")).json()).default.accounts).toEqual([
    "work",
    "personal",
  ]);
});

test("conflicts are refused before the login starts; failures leave configuration untouched", async () => {
  const directory = await temporary();
  const home = await temporary();
  const events: string[] = [];
  await addProfile("codex", "work", { directory, home, run: signIn(events), env: {} });
  events.length = 0;
  const before = await Bun.file(join(directory, "codex-pools.json")).text();
  for (const [label, code] of [
    ["work", "account_label_taken"],
    ["bad/name", "account_label_invalid"],
    ["..", "account_label_invalid"],
  ] as const) {
    await expect(
      addProfile("codex", label, { directory, home, run: signIn(events), env: {} }),
    ).rejects.toThrow(code);
  }
  await Bun.write(join(profileSourcePath(directory, "codex", "stray"), "auth.json"), "{}");
  await expect(
    addProfile("codex", "stray", { directory, home, run: signIn(events), env: {} }),
  ).rejects.toThrow("account_source_exists");
  expect(events).toEqual([]);
  const failing: LoginRunner = async () => ({ code: 1 });
  await expect(
    addProfile("codex", "spare", { directory, home, run: failing, env: {} }),
  ).rejects.toThrow("add_login_failed");
  const unverified: LoginRunner = async () => ({ code: 0 });
  await expect(
    addProfile("codex", "spare2", { directory, home, run: unverified, env: {} }),
  ).rejects.toThrow("add_login_unverified");
  const otherDirectory: LoginRunner = async (_c, args) =>
    args[1] === "login"
      ? { code: 0 }
      : {
          code: 0,
          stdout: JSON.stringify({
            loggedIn: true,
            authMethod: "claude.ai",
            configDirectory: "/elsewhere",
          }),
        };
  await expect(
    addProfile("claude", "spare", { directory, home, run: otherDirectory, env: {} }),
  ).rejects.toThrow("add_login_unverified");
  const cancelled: LoginRunner = async () => ({ code: 130 });
  await expect(
    addProfile("claude", "spare3", { directory, home, run: cancelled, env: {} }),
  ).rejects.toThrow("cancelled");
  expect(await Bun.file(join(directory, "codex-pools.json")).text()).toBe(before);
  expect(await Bun.file(join(directory, "claude-pools.json")).exists()).toBe(false);
  expect((await readdir(join(directory, "profiles", "codex"))).sort()).toEqual([
    "spare",
    "spare2",
    "stray",
    "work",
  ]);
});

test("Claude status verification needs login, the claude.ai method, and the same directory", () => {
  const source = "/synthetic/profiles/claude/work";
  expect(
    claudeStatusVerified(
      JSON.stringify({ loggedIn: true, authMethod: "claude.ai", configDirectory: source }),
      source,
    ),
  ).toBe(true);
  expect(
    claudeStatusVerified(
      JSON.stringify({ loggedIn: true, authMethod: "claude.ai", configDirectory: `${source}/` }),
      source,
    ),
  ).toBe(true);
  expect(
    claudeStatusVerified(
      JSON.stringify({ loggedIn: false, authMethod: "none", configDirectory: source }),
      source,
    ),
  ).toBe(false);
  expect(
    claudeStatusVerified(
      JSON.stringify({ loggedIn: true, authMethod: "api_key", configDirectory: source }),
      source,
    ),
  ).toBe(false);
  expect(
    claudeStatusVerified(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }), source),
  ).toBe(false);
  expect(claudeStatusVerified("not json", source)).toBe(false);
  expect(claudeStatusVerified(undefined, source)).toBe(false);
});

test("registration refuses a concurrent configuration change between preflight and commit", async () => {
  const directory = await temporary();
  const first = await prepareProfileRegistration(
    directory,
    "codex",
    undefined,
    "work",
    "/synthetic/work",
  );
  const second = await prepareProfileRegistration(
    directory,
    "codex",
    undefined,
    "personal",
    "/synthetic/personal",
  );
  await commitProfileRegistration(directory, first);
  await expect(commitProfileRegistration(directory, second)).rejects.toThrow("config_changed");
  expect(await Bun.file(join(directory, "codex-pools.json")).json()).toEqual({
    default: { home: ".codex", accounts: ["work"], from: { work: "/synthetic/work" } },
  });
  expect(await readdir(directory)).toEqual(["codex-pools.json"]);
  await expect(
    prepareProfileRegistration(directory, "codex", undefined, "copy", "/synthetic/work"),
  ).rejects.toThrow("account_source_exists");
  await expect(
    prepareProfileRegistration(directory, "codex", "missing", "x", "/synthetic/x"),
  ).rejects.toThrow("pool_unknown");
  await Bun.write(
    join(directory, "codex-pools.json"),
    JSON.stringify({
      a: { home: ".codex", accounts: ["one"] },
      b: { home: ".codex", accounts: ["two"] },
    }),
  );
  await expect(
    prepareProfileRegistration(directory, "codex", undefined, "x", "/synthetic/x"),
  ).rejects.toThrow("pool_selection_required");
  const named = await prepareProfileRegistration(directory, "codex", "b", "x", "/synthetic/x");
  expect(named.next.b.accounts).toEqual(["two", "x"]);
});
