import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultConfigDir,
  importConfiguration,
  initConfiguration,
  saveAgyConfiguration,
  saveConfigurations,
} from "../src/config.ts";
import { PoolError } from "../src/errors.ts";
import { poolNamed, readPools, useAccount } from "../src/pool.ts";

const paths: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "ha-switch-config-"));
  paths.push(path);
  return path;
}
afterEach(async () => {
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});
test("import preserves schema, is idempotent and refuses unrelated destination", async () => {
  const source = await temporary();
  const destination = await temporary();
  const pools = {
    default: { home: ".codex", accounts: ["account-a", "account-b"], args: ["--search"] },
  };
  await Bun.write(join(source, "codex-pools.json"), JSON.stringify(pools));
  expect((await importConfiguration(source, destination)).codex).toEqual(pools);
  expect((await stat(join(destination, "codex-pools.json"))).mode & 0o777).toBe(0o600);
  await importConfiguration(source, destination);
  await expect(saveConfigurations(destination, { codex: {} })).rejects.toThrow(
    "config_destination_exists",
  );
  expect(await Bun.file(join(destination, "codex-pools.json")).json()).toEqual(pools);
});
test("init discovers profiles without rewriting login files", async () => {
  const home = await temporary();
  const destination = await temporary();
  await mkdir(join(home, ".codex"));
  await Bun.write(join(home, ".codex", "auth.json"), "{}");
  await initConfiguration(destination, home);
  expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe("{}");
  expect(await Bun.file(join(destination, "codex-pools.json")).json()).toEqual({
    default: { home: ".codex-ha-switch", accounts: [".codex"] },
  });
});
test("init includes native Claude profiles without reading or changing their login", async () => {
  const home = await temporary();
  const destination = await temporary();
  await mkdir(join(home, ".claude"));
  await mkdir(join(home, ".claude-account-b"));
  await initConfiguration(destination, home);
  expect(await Bun.file(join(destination, "claude-pools.json")).json()).toEqual({
    default: {
      home: ".claude",
      accounts: [".claude", ".claude-account-b"],
      from: { ".claude": ".claude", ".claude-account-b": ".claude-account-b" },
    },
  });
  expect(await Bun.file(join(home, ".claude.json")).exists()).toBe(false);
});
test("initialized Codex target preserves both sources across switch and switch back", async () => {
  const home = await temporary();
  const destination = await temporary();
  const first = JSON.stringify({
    tokens: { account_id: "account-a" },
    last_refresh: "2026-01-01T00:00:00Z",
  });
  const second = JSON.stringify({
    tokens: { account_id: "account-b" },
    last_refresh: "2026-01-01T00:00:00Z",
  });
  for (const directory of [".codex", ".codex-account-b", ".codex-ha-switch"])
    await mkdir(join(home, directory));
  await Bun.write(join(home, ".codex", "auth.json"), first);
  await Bun.write(join(home, ".codex-account-b", "auth.json"), second);
  await initConfiguration(destination, home);
  const pool = poolNamed(await readPools(join(destination, "codex-pools.json")), "default");
  expect(pool.home).toBe(".codex-ha-switch");
  expect(pool.accounts).toEqual([".codex", ".codex-account-b"]);
  await useAccount(pool, ".codex-account-b", home);
  expect(await Bun.file(join(home, pool.home, "auth.json")).text()).toBe(second);
  await useAccount(pool, ".codex", home);
  expect(await Bun.file(join(home, pool.home, "auth.json")).text()).toBe(first);
  expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(first);
  expect(await Bun.file(join(home, ".codex-account-b", "auth.json")).text()).toBe(second);
});
test("init refuses a lone Codex switch target with no source accounts", async () => {
  const home = await temporary();
  const destination = await temporary();
  await mkdir(join(home, ".codex-ha-switch"));
  await Bun.write(join(home, ".codex-ha-switch", "auth.json"), "{}");
  await expect(initConfiguration(destination, home)).rejects.toThrow("profiles_not_found");
  expect(await Bun.file(join(destination, "codex-pools.json")).exists()).toBe(false);
});
test("import requires actual source configuration", async () => {
  await expect(importConfiguration(await temporary(), await temporary())).rejects.toThrow(
    "import_config_missing",
  );
});
test("invalid Claude source mapping refuses the whole import before config writes", async () => {
  const source = await temporary();
  const destination = await temporary();
  await Bun.write(
    join(source, "codex-pools.json"),
    JSON.stringify({ default: { home: ".codex-target", accounts: ["account-a"] } }),
  );
  await Bun.write(
    join(source, "claude-pools.json"),
    JSON.stringify({
      default: { home: ".claude", accounts: ["account-a"], from: { "account-a": 123 } },
    }),
  );
  await expect(importConfiguration(source, destination)).rejects.toThrow("pool_config_invalid");
  expect(await Bun.file(join(destination, "codex-pools.json")).exists()).toBe(false);
  expect(await Bun.file(join(destination, "claude-pools.json")).exists()).toBe(false);
});
test("unsafe and duplicate Claude labels reject before any imported files", async () => {
  for (const accounts of [["bad/name"], ["account-a", "account-a"]]) {
    const source = await temporary();
    const destination = await temporary();
    await Bun.write(
      join(source, "codex-pools.json"),
      JSON.stringify({ default: { home: ".codex-target", accounts: ["account-a"] } }),
    );
    await Bun.write(
      join(source, "claude-pools.json"),
      JSON.stringify({ default: { home: ".claude", accounts } }),
    );
    await expect(importConfiguration(source, destination)).rejects.toThrow();
    expect(await Bun.file(join(destination, "codex-pools.json")).exists()).toBe(false);
    expect(await Bun.file(join(destination, "claude-pools.json")).exists()).toBe(false);
  }
});
test("config environment overrides default and empty falls back", () => {
  const previous = process.env.HA_SWITCH_CONFIG_DIR;
  try {
    process.env.HA_SWITCH_CONFIG_DIR = "/test-config";
    expect(defaultConfigDir()).toBe("/test-config");
    process.env.HA_SWITCH_CONFIG_DIR = "";
    expect(defaultConfigDir()).toBe(join(homedir(), ".config", "ha-switch"));
    delete process.env.HA_SWITCH_CONFIG_DIR;
    expect(defaultConfigDir()).toBe(join(homedir(), ".config", "ha-switch"));
  } finally {
    if (previous === undefined) delete process.env.HA_SWITCH_CONFIG_DIR;
    else process.env.HA_SWITCH_CONFIG_DIR = previous;
  }
});
test("Antigravity save preflights and commits without losing existing configuration", async () => {
  const destination = await temporary();
  const first = { default: { home: ".gemini", accounts: ["account-a"] } };
  let captured = false;
  await saveAgyConfiguration(destination, {}, first, async () => {
    captured = true;
    expect(await Bun.file(join(destination, "agy-pools.json")).exists()).toBe(false);
  });
  expect(captured).toBe(true);
  expect(await Bun.file(join(destination, "agy-pools.json")).json()).toEqual(first);
  const second = { default: { home: ".gemini", accounts: ["account-a", "account-b"] } };
  await expect(
    saveAgyConfiguration(destination, first, second, async () => {
      throw new Error("capture failed");
    }),
  ).rejects.toThrow("capture failed");
  expect(await Bun.file(join(destination, "agy-pools.json")).json()).toEqual(first);
  await saveAgyConfiguration(destination, first, second, async () => {});
  expect(await Bun.file(join(destination, "agy-pools.json")).json()).toEqual(second);
  expect((await stat(join(destination, "agy-pools.json"))).mode & 0o777).toBe(0o600);
});
test("Antigravity changed configuration refuses capture before any snapshot", async () => {
  const destination = await temporary();
  const existing = { default: { home: ".gemini", accounts: ["account-a"] } };
  await Bun.write(join(destination, "agy-pools.json"), JSON.stringify(existing));
  let captures = 0;
  await expect(
    saveAgyConfiguration(destination, {}, existing, async () => {
      captures++;
    }),
  ).rejects.toThrow("config_changed");
  expect(captures).toBe(0);
  expect(await Bun.file(join(destination, "agy-pools.json")).json()).toEqual(existing);
});
test("failed capture and failed cleanup preserve both errors", async () => {
  const destination = await temporary();
  const primary = new Error("capture failed");
  let observed: unknown;
  try {
    await saveAgyConfiguration(
      destination,
      {},
      { default: { home: ".gemini", accounts: ["account-a"] } },
      async () => {
        const temporaryName = (await readdir(destination)).find((name) => name.endsWith(".tmp"));
        if (!temporaryName) throw new Error("temporary config missing");
        const temporaryPath = join(destination, temporaryName);
        await unlink(temporaryPath);
        await mkdir(temporaryPath);
        throw primary;
      },
    );
  } catch (error) {
    observed = error;
  }
  expect(observed).toBeInstanceOf(PoolError);
  if (!(observed instanceof PoolError)) throw new Error("expected named failure");
  expect(observed.code).toBe("config_cleanup_failed");
  expect(observed.cause).toBeInstanceOf(AggregateError);
  if (!(observed.cause instanceof AggregateError)) throw new Error("expected both errors");
  expect(observed.cause.errors[0]).toBe(primary);
  expect(observed.cause.errors).toHaveLength(2);
  expect(await Bun.file(join(destination, "agy-pools.json")).exists()).toBe(false);
});
