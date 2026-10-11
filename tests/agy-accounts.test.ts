import { expect, test } from "bun:test";
import {
  type AgyDependencies,
  captureAgyAccount,
  listAgyAccounts,
  restoreAgyBackup,
  syncAgyAccounts,
  useAgyAccount,
  validateAgyPools,
} from "../src/agy-accounts.ts";
import type { Pool } from "../src/types.ts";

const pool: Pool = { name: "team", home: ".gemini", accounts: ["work", "personal"] };
const native = "gemini/antigravity",
  key = (a: string) => "ha-switch:agy-account:" + a + "/ha-switch";
function login(sub: string, expiry = "2030-01-01T00:00:00Z") {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return (
    "go-keyring-base64:" +
    Buffer.from(
      JSON.stringify({
        token: {
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
          expiry,
          token_type: "Bearer",
        },
        auth_method: "fixture",
        id_token: "header." + payload + ".signature",
        future: { keep: true },
      }),
    ).toString("base64")
  );
}
function fixture() {
  const items = new Map<string, string>();
  const writes: string[] = [];
  let hook: ((key: string) => void) | undefined;
  const deps: AgyDependencies = {
    keychain: {
      async read(s, n) {
        const k = s + "/" + n;
        hook?.(k);
        return items.get(k);
      },
      async write(s, n, v) {
        const k = s + "/" + n;
        writes.push(k);
        items.set(k, v);
      },
    },
  };
  return {
    items,
    writes,
    deps,
    onRead: (h: typeof hook) => {
      hook = h;
    },
  };
}
test("agy saves two accounts, switches raw native bytes and restores original", async () => {
  const f = fixture();
  const a = login("fixture-a"),
    b = login("fixture-b");
  f.items.set(native, a);
  await captureAgyAccount("work", f.deps);
  f.items.set(native, b);
  await captureAgyAccount("personal", f.deps);
  await useAgyAccount(pool, "work", f.deps);
  expect(f.items.get(native) === a).toBe(true);
  await useAgyAccount(pool, "personal", f.deps);
  expect(f.items.get(native) === b).toBe(true);
  expect(f.items.get(key("work")) === a).toBe(true);
  expect(f.items.get(key("personal")) === b).toBe(true);
  await restoreAgyBackup(pool, f.deps);
  expect(f.items.get(native) === b).toBe(true);
});
test("agy listing is readonly with unknown quota and no tokens", async () => {
  const f = fixture();
  const a = login("fixture-a");
  f.items.set(native, a);
  f.items.set(key("work"), a);
  const out = await listAgyAccounts(pool, f.deps);
  expect(out.current).toBe("work");
  expect(out.accounts[0]?.rateLimits).toBeNull();
  expect(out.accounts[0]?.resetCredits).toBeNull();
  expect(f.writes).toHaveLength(0);
  expect(JSON.stringify(out).includes("fixture-access")).toBe(false);
});
test("agy sync captures latest current token without downgrading", async () => {
  const f = fixture();
  const old = login("fixture-a"),
    fresh = login("fixture-a", "2032-01-01T00:00:00Z");
  f.items.set(native, fresh);
  f.items.set(key("work"), old);
  await syncAgyAccounts(pool, f.deps);
  expect(f.items.get(key("work")) === fresh).toBe(true);
  f.items.set(native, old);
  f.writes.length = 0;
  await syncAgyAccounts(pool, f.deps);
  expect(f.writes).toHaveLength(0);
});
test("agy unknown backend, malformed blob and missing target reject without writes", async () => {
  for (const bad of ["{}", "go-keyring-base64:!!!"]) {
    const f = fixture();
    f.items.set(native, bad);
    f.items.set(key("personal"), login("fixture-b"));
    await expect(useAgyAccount(pool, "personal", f.deps)).rejects.toBeInstanceOf(Error);
    expect(f.writes).toHaveLength(0);
  }
  const f = fixture();
  f.items.set(native, login("fixture-a"));
  await expect(useAgyAccount(pool, "personal", f.deps)).rejects.toMatchObject({
    code: "agy_account_not_saved",
  });
  expect(f.writes).toHaveLength(0);
});
test("agy preflight race and label collision preserve live login", async () => {
  const f = fixture();
  f.items.set(native, login("fixture-a"));
  f.items.set(key("personal"), login("fixture-b"));
  let reads = 0;
  f.onRead((k) => {
    if (k === native && ++reads === 2) f.items.set(native, login("fixture-c"));
  });
  await expect(useAgyAccount(pool, "personal", f.deps)).rejects.toMatchObject({
    code: "agy_credential_changed",
  });
  expect(f.writes).toHaveLength(0);
  f.onRead(undefined);
  f.items.set(key("work"), login("fixture-a"));
  await expect(captureAgyAccount("work", f.deps)).rejects.toMatchObject({
    code: "agy_account_label_taken",
  });
  expect(f.writes).toHaveLength(0);
});
test("agy validates pool labels and rejects unsupported isolation", () => {
  for (const bad of [
    { home: ".gemini", accounts: ["../bad"] },
    { home: ".other", accounts: ["work"] },
    { home: ".gemini", accounts: ["work", "work"] },
    { home: ".gemini", accounts: ["work"], from: { work: ".other" } },
  ])
    expect(() => validateAgyPools({ team: bad })).toThrow("agy_pools_invalid");
});
test("agy restore uses newest saved token for original identity", async () => {
  const f = fixture();
  const a = login("fixture-a"),
    b = login("fixture-b"),
    fresh = login("fixture-a", "2032-01-01T00:00:00Z");
  f.items.set(native, a);
  f.items.set(key("work"), a);
  f.items.set(key("personal"), b);
  await useAgyAccount(pool, "personal", f.deps);
  f.items.set(key("work"), fresh);
  await restoreAgyBackup(pool, f.deps);
  expect(f.items.get(native) === fresh).toBe(true);
});
