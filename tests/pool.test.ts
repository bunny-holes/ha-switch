import { expect, spyOn, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listAccounts,
  poolNamed,
  profileDirectory,
  readPools,
  restoreAccount,
  useAccount,
} from "../src/pool.ts";

const auth = (account: string, refreshed: string, plan = "plus") =>
  JSON.stringify({
    tokens: {
      account_id: account,
      id_token: `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_plan_type: plan } })).toString("base64url")}.signature`,
    },
    last_refresh: refreshed,
  });
const pool = { name: "personal", home: "active", accounts: ["account-a", "account-b"] };
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "ha-switch-test-"));
  for (const [directory, text] of [
    ["account-a", auth("synthetic-a", "2026-01-01")],
    ["account-b", auth("synthetic-b", "2026-01-02")],
    ["active", auth("synthetic-a", "2026-01-03")],
  ] as const) {
    await mkdir(join(home, directory));
    await Bun.write(join(home, directory, "auth.json"), text);
  }
  return home;
}
test("reads pools and rejects malformed mappings and duplicate paths", async () => {
  const home = await fixture();
  try {
    const path = join(home, "pools.json");
    expect(await readPools(path, home)).toEqual({});
    await Bun.write(
      path,
      JSON.stringify({
        personal: { home: "active", accounts: ["account-a"], from: { "account-a": "custom" } },
      }),
    );
    expect(
      profileDirectory(poolNamed(await readPools(path, home), "personal"), "account-a", home),
    ).toBe("custom");
    for (const from of [null, [], { "account-a": 1 }, { missing: "source" }]) {
      await Bun.write(
        path,
        JSON.stringify({ personal: { home: "active", accounts: ["account-a"], from } }),
      );
      await expect(readPools(path, home)).rejects.toThrow("pool_config_invalid");
    }
    await Bun.write(
      path,
      JSON.stringify({ personal: { ...pool, from: { "account-b": "./account-a" } } }),
    );
    await expect(readPools(path, home)).rejects.toThrow("pool_profile_duplicate");
  } finally {
    await rm(home, { recursive: true });
  }
});
test("restore keeps the original identity with its newest known credentials", async () => {
  const home = await fixture();
  try {
    await useAccount(pool, "account-b", home);
    const fresh = auth("synthetic-a", "2027-01-01");
    await Bun.write(join(home, "account-a", "auth.json"), fresh);
    expect(await restoreAccount(pool, home)).toBe(true);
    expect(await Bun.file(join(home, "active", "auth.json")).text()).toBe(fresh);
  } finally {
    await rm(home, { recursive: true });
  }
});
test("failed switching preserves a later native login instead of rolling it back", async () => {
  const home = await fixture();
  const file = Bun.file;
  const target = join(home, "active", "auth.json");
  const source = join(home, "account-b", "auth.json");
  const later = auth("synthetic-c", "2028-01-01");
  let reads = 0;
  const intercepted = spyOn(Bun, "file").mockImplementation((path, options) => {
    const native = Reflect.apply(file, Bun, [path, options]) as Bun.BunFile;
    if (path !== source) return native;
    return new Proxy(native, {
      get(object, key) {
        if (key === "text")
          return async () => {
            reads++;
            if (reads === 2) {
              await Bun.write(target, later);
              return "invalid synthetic auth";
            }
            return object.text();
          };
        const value = Reflect.get(object, key);
        return typeof value === "function" ? value.bind(object) : value;
      },
    });
  });
  try {
    await expect(useAccount(pool, "account-b", home)).rejects.toThrow("account_rollback_changed");
    expect(await file(target).text()).toBe(later);
  } finally {
    intercepted.mockRestore();
    await rm(home, { recursive: true });
  }
});
test("failed switching rolls back a target update still owned by that switch", async () => {
  const home = await fixture();
  const file = Bun.file;
  const target = join(home, "active", "auth.json");
  const before = await file(target).text();
  await Bun.write(join(home, "account-a", "auth.json"), auth("synthetic-a", "2027-01-01"));
  let reads = 0;
  const intercepted = spyOn(Bun, "file").mockImplementation((path, options) => {
    const native = Reflect.apply(file, Bun, [path, options]) as Bun.BunFile;
    if (path !== join(home, "account-b", "auth.json")) return native;
    return new Proxy(native, {
      get(object, key) {
        if (key === "text")
          return async () => (++reads === 3 ? "invalid synthetic auth" : object.text());
        const value = Reflect.get(object, key);
        return typeof value === "function" ? value.bind(object) : value;
      },
    });
  });
  try {
    await expect(useAccount(pool, "account-b", home)).rejects.toThrow("account_auth_invalid");
    expect(await file(target).text()).toBe(before);
  } finally {
    intercepted.mockRestore();
    await rm(home, { recursive: true });
  }
});
test("switch preserves refreshed credentials, settings, modes and original backup", async () => {
  const home = await fixture();
  try {
    const target = join(home, "active", "auth.json");
    const before = await Bun.file(target).text();
    await chmod(target, 0o400);
    await Bun.write(join(home, "active", "config.toml"), 'model = "synthetic"');
    await Bun.write(join(home, "active", "sessions.json"), "sessions");
    await useAccount(pool, "account-b", home);
    expect((await Bun.file(join(home, "account-a", "auth.json")).json()).last_refresh).toBe(
      "2026-01-03",
    );
    expect((await listAccounts(pool, home)).current).toBe("account-b");
    expect((await listAccounts(pool, home)).accounts[0]?.plan).toBe("plus");
    expect(await Bun.file(`${target}.ha-switch-backup`).text()).toBe(before);
    expect(await Bun.file(join(home, "active", "config.toml")).text()).toBe('model = "synthetic"');
    expect(await Bun.file(join(home, "active", "sessions.json")).text()).toBe("sessions");
    if (process.platform !== "win32") expect((await stat(target)).mode & 0o777).toBe(0o400);
    await useAccount(pool, "account-a", home);
    expect(await Bun.file(`${target}.ha-switch-backup`).text()).toBe(before);
    expect(await restoreAccount(pool, home)).toBe(true);
    expect(await Bun.file(target).text()).toBe(before);
    expect((await readdir(join(home, "active"))).some((name) => name.endsWith(".tmp"))).toBe(false);
  } finally {
    await rm(home, { recursive: true });
  }
});
test("non-file credential stores are refused before target or backup writes", async () => {
  const home = await fixture();
  try {
    const target = join(home, "active", "auth.json");
    const before = await Bun.file(target).text();
    for (const store of ["keyring", "auto", "ephemeral"]) {
      await Bun.write(
        join(home, "active", "config.toml"),
        `cli_auth_credentials_store = "${store}"`,
      );
      await expect(useAccount(pool, "account-b", home)).rejects.toThrow(
        "codex_credentials_store_unsupported",
      );
      expect(await Bun.file(target).text()).toBe(before);
      expect(await Bun.file(`${target}.ha-switch-backup`).exists()).toBe(false);
    }
  } finally {
    await rm(home, { recursive: true });
  }
});
test("target/source collision and malformed JWT refuse before writes", async () => {
  const home = await fixture();
  try {
    const before = await Bun.file(join(home, "account-a", "auth.json")).text();
    await expect(useAccount({ ...pool, home: "./account-a" }, "account-b", home)).rejects.toThrow(
      "pool_target_is_account",
    );
    expect(await Bun.file(join(home, "account-a", "auth.json")).text()).toBe(before);
    await Bun.write(
      join(home, "account-b", "auth.json"),
      JSON.stringify({ tokens: { account_id: "synthetic-b", id_token: "invalid" } }),
    );
    const target = await Bun.file(join(home, "active", "auth.json")).text();
    await expect(useAccount(pool, "account-b", home)).rejects.toThrow("account_auth_invalid");
    expect(await Bun.file(join(home, "active", "auth.json")).text()).toBe(target);
    expect(await Bun.file(join(home, "active", "auth.json.ha-switch-backup")).exists()).toBe(false);
  } finally {
    await rm(home, { recursive: true });
  }
});
