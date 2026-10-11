import { expect, spyOn, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codexPoolSources,
  listAccounts,
  listNativeCodexAccounts,
  nativeCodexPool,
  prepareNativeCodexPool,
  restoreAccount,
  useAccount,
  verifySelectedCodexAccount,
} from "../src/pool.ts";

const auth = (account: string, date = "2026-01-01") =>
  JSON.stringify({ tokens: { account_id: account }, last_refresh: date });
const legacy = { name: "pkls", home: ".codex-pkls", accounts: [".codex", ".codex-account-b"] };

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "ha-switch-native-test-"));
  for (const [directory, text] of [
    [".codex", auth("synthetic-a")],
    [".codex-account-b", auth("synthetic-b")],
    [".codex-pkls", auth("synthetic-b", "2028-01-01")],
  ]) {
    await mkdir(join(home, directory));
    await Bun.write(join(home, directory, "auth.json"), text);
  }
  return { home, directory: join(home, ".config", "ha-switch") };
}

test("native switch saves the original source, preserves settings and leaves the old pool untouched", async () => {
  const { home, directory } = await fixture();
  try {
    const original = await Bun.file(join(home, ".codex", "auth.json")).text();
    const poolLogin = await Bun.file(join(home, ".codex-pkls", "auth.json")).text();
    const selected = await Bun.file(join(home, ".codex-account-b", "auth.json")).text();
    await chmod(join(home, ".codex", "auth.json"), 0o400);
    for (const [profile, effort] of [
      [".codex", "low"],
      [".codex-pkls", "medium"],
    ]) {
      await Bun.write(join(home, profile, "config.toml"), `model_reasoning_effort = "${effort}"\n`);
      for (const file of ["sessions/synthetic.jsonl", "plugins/synthetic.json", "state_5.sqlite"])
        await Bun.write(join(home, profile, file), "synthetic-preserved-state");
    }
    const prepared = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    await useAccount(prepared.pool, ".codex-account-b", home, {
      configuredOnly: true,
      expectedTarget: prepared.expectedTarget,
    });
    const saved = join(directory, "codex-accounts", "native", "auth.json");
    expect(await Bun.file(saved).text()).toBe(original);
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(selected);
    expect(await Bun.file(join(home, ".codex", "auth.json.ha-switch-backup")).text()).toBe(
      original,
    );
    expect(await Bun.file(join(home, ".codex-pkls", "auth.json")).text()).toBe(poolLogin);
    expect(await Bun.file(join(home, ".codex-pkls", "auth.json.ha-switch-backup")).exists()).toBe(
      false,
    );
    if (process.platform !== "win32") {
      expect((await stat(saved)).mode & 0o777).toBe(0o400);
      expect((await stat(join(home, ".codex", "auth.json"))).mode & 0o777).toBe(0o400);
    }
    for (const [profile, effort] of [
      [".codex", "low"],
      [".codex-pkls", "medium"],
    ]) {
      expect(await Bun.file(join(home, profile, "config.toml")).text()).toBe(
        `model_reasoning_effort = "${effort}"\n`,
      );
      for (const file of ["sessions/synthetic.jsonl", "plugins/synthetic.json", "state_5.sqlite"])
        expect(await Bun.file(join(home, profile, file)).text()).toBe("synthetic-preserved-state");
    }
    expect((await listNativeCodexAccounts(legacy, directory, home)).current).toBe(
      ".codex-account-b",
    );
    const sources = await codexPoolSources(legacy, directory, home);
    expect(sources.home).toBe(".codex-pkls");
    expect((await listAccounts(sources, home)).current).toBe(".codex-account-b");
    const next = await prepareNativeCodexPool(legacy, ".codex", directory, home);
    await useAccount(next.pool, ".codex", home, {
      configuredOnly: true,
      expectedTarget: next.expectedTarget,
    });
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(original);
    expect(await Bun.file(saved).text()).toBe(original);
    expect(await restoreAccount(next.pool, home, { configuredOnly: true })).toBe(true);
    expect(await Bun.file(join(home, ".codex-pkls", "auth.json")).text()).toBe(poolLogin);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("initial native listing uses the original source without creating a saved login", async () => {
  const { home, directory } = await fixture();
  try {
    expect((await listNativeCodexAccounts(legacy, directory, home)).current).toBe(".codex");
    expect(await Bun.file(join(directory, "codex-accounts", "native", "auth.json")).exists()).toBe(
      false,
    );
    expect(nativeCodexPool(legacy, directory, home).from?.[".codex"]).toBe(
      join(directory, "codex-accounts", "native"),
    );
    expect(legacy).toEqual({
      name: "pkls",
      home: ".codex-pkls",
      accounts: [".codex", ".codex-account-b"],
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("an invalid selected login is rejected before source preservation or native writes", async () => {
  const { home, directory } = await fixture();
  try {
    const before = await Bun.file(join(home, ".codex", "auth.json")).text();
    await Bun.write(join(home, ".codex-account-b", "auth.json"), "invalid-synthetic-login");
    await expect(
      prepareNativeCodexPool(legacy, ".codex-account-b", directory, home),
    ).rejects.toThrow("account_auth_invalid");
    expect(await Bun.file(join(directory, "codex-accounts", "native", "auth.json")).exists()).toBe(
      false,
    );
    expect(await Bun.file(join(home, ".codex", "auth.json.ha-switch-backup")).exists()).toBe(false);
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a login changed after preparation is left intact without creating a native backup", async () => {
  const { home, directory } = await fixture();
  try {
    const prepared = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    const later = auth("synthetic-c");
    await Bun.write(join(home, ".codex", "auth.json"), later);
    await expect(
      useAccount(prepared.pool, ".codex-account-b", home, {
        configuredOnly: true,
        expectedTarget: prepared.expectedTarget,
      }),
    ).rejects.toThrow("account_auth_changed");
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(later);
    expect(await Bun.file(join(home, ".codex", "auth.json.ha-switch-backup")).exists()).toBe(false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("native switching never reads an unconfigured old home", async () => {
  const { home, directory } = await fixture();
  const file = Bun.file;
  const intercepted = spyOn(Bun, "file").mockImplementation((path, options) => {
    if (typeof path === "string" && path.startsWith(join(home, ".codex-pkls")))
      throw new Error("old home accessed");
    return Reflect.apply(file, Bun, [path, options]);
  });
  try {
    const prepared = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    await useAccount(prepared.pool, ".codex-account-b", home, {
      configuredOnly: true,
      expectedTarget: prepared.expectedTarget,
    });
    expect((await listNativeCodexAccounts(legacy, directory, home)).current).toBe(
      ".codex-account-b",
    );
  } finally {
    intercepted.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

test("native refreshed credentials return to their own source before selecting another account", async () => {
  const { home, directory } = await fixture();
  try {
    const initial = await prepareNativeCodexPool(legacy, ".codex", directory, home);
    await useAccount(initial.pool, ".codex", home, {
      configuredOnly: true,
      expectedTarget: initial.expectedTarget,
    });
    const selectedSource = join(home, ".codex-account-b", "auth.json");
    const selected = await Bun.file(selectedSource).text();
    const refreshed = auth("synthetic-a", "2029-01-01");
    await Bun.write(join(home, ".codex", "auth.json"), refreshed);
    const next = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    await useAccount(next.pool, ".codex-account-b", home, {
      configuredOnly: true,
      expectedTarget: next.expectedTarget,
    });
    expect(await Bun.file(join(directory, "codex-accounts", "native", "auth.json")).text()).toBe(
      refreshed,
    );
    expect(await Bun.file(selectedSource).text()).toBe(selected);
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(selected);
    await verifySelectedCodexAccount(next.pool, ".codex-account-b", home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a delayed old session write only changes the execution slot and fails the launch identity check", async () => {
  const { home, directory } = await fixture();
  try {
    const prepared = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    await useAccount(prepared.pool, ".codex-account-b", home, {
      configuredOnly: true,
      expectedTarget: prepared.expectedTarget,
    });
    const archive = join(directory, "codex-accounts", "native", "auth.json");
    const source = join(home, ".codex-account-b", "auth.json");
    const original = await Bun.file(archive).text();
    const selected = await Bun.file(source).text();
    await Bun.write(join(home, ".codex", "auth.json"), auth("synthetic-a", "2029-01-01"));
    await expect(
      verifySelectedCodexAccount(prepared.pool, ".codex-account-b", home),
    ).rejects.toThrow("account_auth_changed");
    expect(await Bun.file(archive).text()).toBe(original);
    expect(await Bun.file(source).text()).toBe(selected);
    const repaired = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    await useAccount(repaired.pool, ".codex-account-b", home, {
      configuredOnly: true,
      expectedTarget: repaired.expectedTarget,
    });
    await verifySelectedCodexAccount(repaired.pool, ".codex-account-b", home);
    expect(await Bun.file(source).text()).toBe(selected);
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(selected);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("mixed account metadata and refreshed JWT credentials are rejected without writing any source", async () => {
  const { home, directory } = await fixture();
  try {
    const prepared = await prepareNativeCodexPool(legacy, ".codex-account-b", directory, home);
    await useAccount(prepared.pool, ".codex-account-b", home, {
      configuredOnly: true,
      expectedTarget: prepared.expectedTarget,
    });
    const archive = join(directory, "codex-accounts", "native", "auth.json");
    const source = join(home, ".codex-account-b", "auth.json");
    const original = await Bun.file(archive).text();
    const selected = await Bun.file(source).text();
    const payload = Buffer.from(
      JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-a" } }),
    ).toString("base64url");
    const mixed = JSON.stringify({
      tokens: { account_id: "synthetic-b", id_token: `synthetic.${payload}.synthetic` },
      last_refresh: "2029-01-01",
    });
    await Bun.write(join(home, ".codex", "auth.json"), mixed);
    await expect(
      useAccount(prepared.pool, ".codex-account-b", home, { configuredOnly: true }),
    ).rejects.toThrow("account_auth_invalid");
    expect(await Bun.file(archive).text()).toBe(original);
    expect(await Bun.file(source).text()).toBe(selected);
    expect(await Bun.file(join(home, ".codex", "auth.json")).text()).toBe(mixed);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
