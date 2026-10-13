import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ClaudeDependencies,
  captureClaudeAccount,
  configFiles,
  configPath,
  credentialService,
  importLegacyClaudeAccounts,
  listClaudeAccounts,
  restoreClaudeBackup,
  syncAccounts,
  useClaudeAccount,
  validateClaudePools,
} from "../src/claude-accounts.ts";
import { PoolError } from "../src/errors.ts";
import type { Pool } from "../src/types.ts";

const home = "/tmp/ha-switch-fixture";
const pool: Pool = {
  name: "team",
  home: ".claude",
  accounts: ["work", "personal"],
  from: { work: ".claude-work", personal: ".claude-personal" },
};
const token = (revision: string, expiresAt = 4e12) => ({
  accessToken: "fixture-access-" + revision,
  refreshToken: "fixture-refresh-" + revision,
  expiresAt,
  subscriptionType: "max",
  unknownField: "keep",
});
const snap = (id: string, revision: string, expiresAt = 4e12) => ({
  claudeAiOauth: token(revision, expiresAt),
  oauthAccount: { accountUuid: id, displayName: "fixture" },
});
function fixture() {
  const keys = new Map<string, string>();
  const files = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const reads: string[] = [];
  let readHook: ((service: string) => void) | undefined;
  const deps: ClaudeDependencies = {
    home,
    keychain: {
      async read(s) {
        reads.push(s);
        readHook?.(s);
        return keys.get(s);
      },
      async write(s, v) {
        writes.push(s);
        keys.set(s, v);
      },
    },
    files: {
      async read(p) {
        return structuredClone(files.get(p));
      },
      async write(p, v) {
        writes.push(p);
        files.set(p, structuredClone(v));
      },
    },
    profiles: async () => [],
    fetch: async () =>
      new Response(
        JSON.stringify({
          five_hour: { utilization: 25, resets_at: "2030-01-01T00:00:00Z" },
          seven_day: { utilization: 60 },
          cedar_ember: { eligible: true, grants: [{ resets_left: 2 }] },
        }),
      ),
    now: () => 1e12,
  };
  const setProfile = (dir: string, id: string, revision: string, expiresAt = 4e12) => {
    const s = snap(id, revision, expiresAt);
    keys.set(
      credentialService(dir, home),
      JSON.stringify({
        claudeAiOauth: s.claudeAiOauth,
        mcpOAuth: { fixture: "preserve" },
        future: "keep",
      }),
    );
    files.set(configPath(dir, home), { oauthAccount: s.oauthAccount, settings: { keep: true } });
  };
  return {
    keys,
    files,
    writes,
    reads,
    deps,
    setProfile,
    onRead: (h: typeof readHook) => {
      readHook = h;
    },
  };
}
describe("Claude macOS account swapping", () => {
  test("first list uses configured native profiles before HA snapshots exist", async () => {
    const f = fixture();
    const scoped: Pool = {
      name: "team",
      home: ".claude",
      accounts: ["personal", "work"],
      from: { personal: ".claude", work: ".claude-work" },
    };
    f.setProfile(".claude", "fixture-a", "a");
    f.setProfile(".claude-work", "fixture-b", "b");
    const listing = await listClaudeAccounts(scoped, f.deps);
    expect(listing.current).toBe("personal");
    expect(listing.accounts.map((row) => row.authenticated)).toEqual([true, true]);
    expect(listing.accounts.map((row) => row.plan)).toEqual(["max", "max"]);
    expect(listing.accounts.map((row) => row.resetCredits)).toEqual([2, 2]);
    expect(listing.accounts.map((row) => row.rateLimits?.primary?.usedPercent)).toEqual([25, 25]);
    expect(f.reads).toHaveLength(4);
    expect(f.reads.some((service) => service.startsWith("toolbox:"))).toBe(false);
    expect(f.writes).toHaveLength(0);
  });
  test("readonly list queries fresh native login when the saved copy has expired", async () => {
    const f = fixture();
    const scoped: Pool = {
      name: "team",
      home: ".claude",
      accounts: ["personal", "work"],
      from: { personal: ".claude", work: ".claude-work" },
    };
    f.setProfile(".claude", "fixture-a", "fresh");
    f.setProfile(".claude-work", "fixture-b", "b");
    f.keys.set(
      "ha-switch:claude-account:personal",
      JSON.stringify(snap("fixture-a", "expired", 1)),
    );
    f.keys.set("ha-switch:claude-account:work", JSON.stringify(snap("fixture-b", "b")));
    let freshQueried = false;
    f.deps.fetch = async (_input, options) => {
      if (new Headers(options?.headers).get("Authorization") === "Bearer fixture-access-fresh")
        freshQueried = true;
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 25 },
          cedar_ember: { eligible: true, grants: [{ resets_left: 2 }] },
        }),
      );
    };
    const listing = await listClaudeAccounts(scoped, f.deps);
    expect(freshQueried).toBe(true);
    expect(listing.accounts[0]?.resetError).toBeUndefined();
    expect(listing.accounts[0]?.resetCredits).toBe(2);
    expect(listing.accounts[0]?.rateLimits?.primary?.usedPercent).toBe(25);
    expect(f.reads).toHaveLength(4);
    expect(f.writes).toHaveLength(0);
  });
  test("cleared native login keeps its saved account available for listing and switching", async () => {
    const f = fixture();
    const scoped: Pool = {
      name: "team",
      home: ".claude",
      accounts: ["personal", "work"],
      from: { personal: ".claude", work: ".claude-work" },
    };
    f.setProfile(".claude", "fixture-a", "a");
    f.setProfile(".claude-work", "fixture-b", "b");
    const source = credentialService(".claude-work", home);
    const cleared = JSON.stringify({
      claudeAiOauth: { accessToken: "", refreshToken: "", expiresAt: 0 },
      mcpOAuth: { fixture: "preserve" },
      future: "keep",
    });
    f.keys.set(source, cleared);
    f.keys.set("ha-switch:claude-account:personal", JSON.stringify(snap("fixture-a", "a")));
    f.keys.set("ha-switch:claude-account:work", JSON.stringify(snap("fixture-b", "b")));
    f.deps.fetch = async () => {
      throw new Error("local_list_must_not_query_usage");
    };
    const listing = await listClaudeAccounts(scoped, { ...f.deps, local: true });
    expect(listing.current).toBe("personal");
    expect(listing.accounts.map((row) => row.authenticated)).toEqual([true, true]);
    expect(f.writes).toHaveLength(0);
    await useClaudeAccount(scoped, "work", f.deps);
    const active = JSON.parse(f.keys.get(credentialService(".claude", home)) as string);
    expect(active.claudeAiOauth.accessToken === "fixture-access-b").toBe(true);
    expect(active.mcpOAuth).toEqual({ fixture: "preserve" });
    expect(f.keys.get(source) === cleared).toBe(true);
  });
  test("cleared current login has no current marker and cannot supply an unsigned account", async () => {
    const f = fixture();
    const scoped: Pool = {
      name: "team",
      home: ".claude",
      accounts: ["personal", "work"],
      from: { personal: ".claude", work: ".claude-work" },
    };
    f.setProfile(".claude", "fixture-a", "a");
    f.setProfile(".claude-work", "fixture-b", "b");
    f.keys.set(
      credentialService(".claude", home),
      JSON.stringify({ claudeAiOauth: { accessToken: "", refreshToken: "", expiresAt: 0 } }),
    );
    const listing = await listClaudeAccounts(scoped, { ...f.deps, local: true });
    expect(listing.current).toBeUndefined();
    expect(listing.accounts.map((row) => row.authenticated)).toEqual([false, true]);
    await expect(useClaudeAccount(scoped, "personal", f.deps)).rejects.toMatchObject({
      code: "account_not_signed_in",
    });
    expect(f.writes).toHaveLength(0);
  });
  test("partly cleared or malformed logins remain invalid before writes", async () => {
    for (const invalid of [
      { ...token("a"), accessToken: "" },
      { ...token("a"), refreshToken: "" },
      { accessToken: "", refreshToken: "", expiresAt: "invalid" },
    ]) {
      const f = fixture();
      f.setProfile(".claude", "fixture-a", "a");
      f.keys.set(credentialService(".claude", home), JSON.stringify({ claudeAiOauth: invalid }));
      await expect(useClaudeAccount(pool, "work", f.deps)).rejects.toMatchObject({
        code: "claude_credential_invalid",
      });
      expect(f.writes).toHaveLength(0);
    }
  });
  test("two configured profiles avoid global scans and redundant reads", async () => {
    const scoped: Pool = {
      name: "team",
      home: ".claude",
      accounts: ["personal", "work"],
      from: { personal: ".claude", work: ".claude-work" },
    };
    for (const operation of ["list-local", "list", "sync", "switch"] as const) {
      const f = fixture();
      f.setProfile(".claude", "fixture-a", "a");
      f.setProfile(".claude-work", "fixture-b", "b");
      f.keys.set("ha-switch:claude-account:personal", JSON.stringify(snap("fixture-a", "a")));
      f.keys.set("ha-switch:claude-account:work", JSON.stringify(snap("fixture-b", "b")));
      f.deps.profiles = async () => {
        throw new Error("global_profile_scan_forbidden");
      };
      if (operation === "list-local") await listClaudeAccounts(scoped, { ...f.deps, local: true });
      if (operation === "list") await listClaudeAccounts(scoped, f.deps);
      if (operation === "sync") await syncAccounts(scoped, f.deps);
      if (operation === "switch") await useClaudeAccount(scoped, "work", f.deps);
      expect(f.reads.length).toBe(operation === "switch" ? 11 : 4);
      expect(new Set(f.reads).size).toBe(operation === "switch" ? 5 : 4);
      expect(
        f.writes.filter(
          (path) => path.startsWith("ha-switch:") || path.startsWith("Claude Code-credentials"),
        ).length,
      ).toBe(operation === "switch" ? 2 : 0);
    }
  });
  test("profile paths reject every ASCII control byte and allow ordinary Unicode", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      const path = `.claude-${String.fromCharCode(code)}fixture`;
      expect(() => validateClaudePools({ team: { home: path, accounts: ["work"] } })).toThrow(
        "claude_pools_invalid",
      );
      expect(() =>
        validateClaudePools({
          team: { home: ".claude", accounts: ["work"], from: { work: path } },
        }),
      ).toThrow("claude_pools_invalid");
    }
    expect(
      validateClaudePools({ team: { home: ".claude-시험", accounts: ["work"] } }).team?.home,
    ).toBe(".claude-시험");
  });
  test("default and custom native keychain names follow absolute path hash", () => {
    expect(credentialService(".claude", home)).toBe("Claude Code-credentials");
    expect(credentialService(home + "/.claude", home)).toBe("Claude Code-credentials");
    expect(credentialService(".claude-work", home)).toMatch(
      /^Claude Code-credentials-[0-9a-f]{8}$/,
    );
    expect(configPath(".claude", home)).toBe(home + "/.claude.json");
  });
  test("save and switch preserve MCP keys, settings, metadata and large payloads", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "a");
    await captureClaudeAccount("work", f.deps);
    f.setProfile(".claude", "fixture-b", "b");
    await captureClaudeAccount("personal", f.deps);
    const native = credentialService(".claude", home);
    const old = JSON.parse(f.keys.get(native) as string);
    old.large = "x".repeat(40000);
    f.keys.set(native, JSON.stringify(old));
    await useClaudeAccount(pool, "work", f.deps);
    const active = JSON.parse(f.keys.get(native) as string);
    expect(active.mcpOAuth).toEqual({ fixture: "preserve" });
    expect(active.large.length).toBe(40000);
    expect(f.files.get(configPath(".claude", home))?.settings).toEqual({ keep: true });
    expect(f.files.get(configPath(".claude", home))?.oauthAccount).toMatchObject({
      accountUuid: "fixture-a",
    });
    await restoreClaudeBackup(pool, f.deps);
    expect(f.files.get(configPath(".claude", home))?.oauthAccount).toMatchObject({
      accountUuid: "fixture-b",
    });
    expect(JSON.parse(f.keys.get(native) as string).large.length).toBe(40000);
  });
  test("list local reads only and emits safe labels and unknown counts", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "a");
    f.setProfile(".claude-work", "fixture-a", "a");
    const out = await listClaudeAccounts(pool, { ...f.deps, local: true });
    expect(out.accounts).toHaveLength(2);
    expect(out.accounts[0]?.plan).toBe("max");
    expect(out.accounts[0]?.resetCredits).toBeNull();
    expect(out.accounts[0]?.rateLimits).toBeNull();
    expect(f.writes).toHaveLength(0);
    expect(JSON.stringify(out).includes("fixture-access")).toBe(false);
    expect(JSON.stringify(out).includes("accountUuid")).toBe(false);
  });
  test("usage list keeps all fields and does not write credentials", async () => {
    const f = fixture();
    f.setProfile(".claude-work", "fixture-a", "a");
    const out = await listClaudeAccounts(pool, f.deps);
    expect(out.accounts[0]?.resetCredits).toBe(2);
    expect(out.accounts[0]?.rateLimits?.primary?.usedPercent).toBe(25);
    expect(out.accounts[0]?.rateLimits?.secondary?.usedPercent).toBe(60);
    expect(out.accounts).toHaveLength(2);
    expect(f.writes).toHaveLength(0);
  });
  test("sync imports configured profiles and selects freshest login without touching MCP", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "old", 2e12);
    f.setProfile(".claude-work", "fixture-a", "new", 4e12);
    f.setProfile(".claude-personal", "fixture-b", "b");
    await syncAccounts(pool, f.deps);
    const live = JSON.parse(f.keys.get(credentialService(".claude", home)) as string);
    expect(live.claudeAiOauth.expiresAt).toBe(4e12);
    expect(live.mcpOAuth).toEqual({ fixture: "preserve" });
    expect(f.keys.has("ha-switch:claude-account:personal")).toBe(true);
  });
  test("invalid target and invalid complete config reject before writes", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "a");
    await expect(
      useClaudeAccount({ ...pool, from: undefined }, "personal", f.deps),
    ).rejects.toMatchObject({ code: "account_not_stored" });
    await expect(
      importLegacyClaudeAccounts(
        { good: pool, bad: { home: ".claude", accounts: ["../unsafe"] } },
        f.deps,
      ),
    ).rejects.toMatchObject({ code: "claude_pools_invalid" });
    expect(f.writes).toHaveLength(0);
    expect(() =>
      validateClaudePools({
        team: { home: ".claude", accounts: ["work"], from: { unknown: ".claude-work" } },
      }),
    ).toThrow("claude_pools_invalid");
  });
  test("label collision and source race do not write", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "a");
    await captureClaudeAccount("work", f.deps);
    f.writes.length = 0;
    f.setProfile(".claude", "fixture-b", "b");
    await expect(captureClaudeAccount("work", f.deps)).rejects.toMatchObject({
      code: "account_label_taken",
    });
    expect(f.writes).toHaveLength(0);
    const g = fixture();
    g.setProfile(".claude", "fixture-a", "a");
    let reads = 0;
    g.onRead((s) => {
      if (s === credentialService(".claude", home) && ++reads === 2)
        g.setProfile(".claude", "fixture-b", "b");
    });
    await expect(captureClaudeAccount("work", g.deps)).rejects.toMatchObject({
      code: "profile_changed",
    });
    expect(g.writes).toHaveLength(0);
  });
  test("switch rejects changed destination before writing its backup", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "a");
    f.keys.set("ha-switch:claude-account:personal", JSON.stringify(snap("fixture-b", "b")));
    let reads = 0;
    f.onRead((service) => {
      if (service === "ha-switch:claude-account:personal" && ++reads === 2)
        f.keys.set(service, JSON.stringify(snap("fixture-c", "c")));
    });
    await expect(
      useClaudeAccount({ ...pool, from: undefined }, "personal", f.deps),
    ).rejects.toMatchObject({ code: "profile_changed" });
    expect(f.writes).toHaveLength(0);
  });
  test("metadata write failure rolls back login while retaining unrelated keys", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "a");
    await captureClaudeAccount("work", f.deps);
    f.setProfile(".claude", "fixture-b", "b");
    await captureClaudeAccount("personal", f.deps);
    f.deps.files.write = async () => {
      throw new Error("fixture failure");
    };
    await expect(useClaudeAccount(pool, "work", f.deps)).rejects.toMatchObject({
      code: "claude_config_write_failed",
    });
    const live = JSON.parse(f.keys.get(credentialService(".claude", home)) as string);
    expect(live.claudeAiOauth.accessToken === "fixture-access-b").toBe(true);
    expect(live.mcpOAuth).toEqual({ fixture: "preserve" });
  });
  test("imports old OS keychain namespace without changing legacy items", async () => {
    const f = fixture();
    const raw = JSON.stringify(snap("fixture-a", "a"));
    f.keys.set("toolbox:claude-account:work", raw);
    expect(await importLegacyClaudeAccounts({ team: pool }, f.deps)).toBe(1);
    expect(f.keys.get("toolbox:claude-account:work") === raw).toBe(true);
    expect(f.keys.get("ha-switch:claude-account:work") === raw).toBe(true);
  });
  test("atomic config rewrite preserves existing mode", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ha-switch-config-test-"));
    const p = join(directory, "config.json");
    try {
      await Bun.write(p, JSON.stringify({ fixture: true }));
      await chmod(p, 0o640);
      await configFiles.write(p, { fixture: false });
      expect((await stat(p)).mode & 0o777).toBe(0o640);
      expect(await configFiles.read(p)).toEqual({ fixture: false });
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  test("restore selects freshest known credential for original identity", async () => {
    const f = fixture();
    f.setProfile(".claude", "fixture-a", "old", 2e12);
    await captureClaudeAccount("work", f.deps);
    f.setProfile(".claude-personal", "fixture-b", "b", 4e12);
    await useClaudeAccount(pool, "personal", f.deps);
    f.setProfile(".claude-work", "fixture-a", "new", 5e12);
    await restoreClaudeBackup(pool, f.deps);
    const restored = JSON.parse(f.keys.get(credentialService(".claude", home)) as string);
    expect(restored.claudeAiOauth.expiresAt).toBe(5e12);
  });
});

test("shortcut Claude switching preserves the legacy target backup and restores each home", async () => {
  const f = fixture();
  f.setProfile(".claude", "synthetic-native", "native");
  f.setProfile(".claude-pkls", "synthetic-legacy", "legacy");
  f.setProfile(".claude-work", "synthetic-work", "work");
  f.setProfile(".claude-personal", "synthetic-personal", "personal");
  const legacy = { ...pool, home: ".claude-pkls" };
  await useClaudeAccount(legacy, "work", f.deps);
  const before = f.keys.get("ha-switch:claude-backup:team");
  await useClaudeAccount(pool, "personal", { ...f.deps, nativeBackup: true });
  expect(f.keys.get("ha-switch:claude-backup:team")).toBe(before);
  await restoreClaudeBackup(legacy, f.deps);
  expect(f.files.get(configPath(".claude-pkls", home))?.oauthAccount).toEqual(
    snap("synthetic-legacy", "legacy").oauthAccount,
  );
  await restoreClaudeBackup(pool, { ...f.deps, nativeBackup: true });
  expect(f.files.get(configPath(".claude", home))?.oauthAccount).toEqual(
    snap("synthetic-native", "native").oauthAccount,
  );
});

test("blocked keychain listing keeps configured labels unknown and stops duplicate reads", async () => {
  for (const code of [
    "keychain_interaction_not_allowed",
    "keychain_locked",
    "keychain_no_gui_session",
    "keychain_access_denied",
    "keychain_unavailable",
    "keychain_read_failed",
  ]) {
    const f = fixture();
    let reads = 0;
    f.deps.keychain.read = async () => {
      reads++;
      throw new PoolError(code);
    };
    const listing = await listClaudeAccounts(pool, f.deps);
    expect(listing.accounts.map((row) => row.account)).toEqual(pool.accounts);
    expect(
      listing.accounts.every(
        (row) =>
          row.authenticated === undefined && row.rateLimits === null && row.resetCredits === null,
      ),
    ).toBe(true);
    expect(listing.warnings).toEqual([code]);
    expect(listing.current).toBeUndefined();
    expect(reads).toBe(1);
    expect(f.writes).toEqual([]);
    await expect(useClaudeAccount(pool, "work", f.deps)).rejects.toThrow(code);
    expect(f.writes).toEqual([]);
  }
});

test("missing login differs from an inaccessible keychain and malformed credentials still fail", async () => {
  const f = fixture();
  const listing = await listClaudeAccounts(pool, f.deps);
  expect(listing.warnings).toEqual(["keychain_item_missing"]);
  expect(listing.accounts.every((row) => row.authenticated === false)).toBe(true);
  f.keys.set(credentialService(".claude", home), "invalid");
  await expect(listClaudeAccounts(pool, f.deps)).rejects.toThrow("claude_credential_invalid");
});

test("the pre-switch backup is written once and later switches keep the first login", async () => {
  const f = fixture();
  f.setProfile(".claude", "synthetic-native", "native");
  f.setProfile(".claude-work", "synthetic-work", "work");
  f.setProfile(".claude-personal", "synthetic-personal", "personal");
  await useClaudeAccount(pool, "work", f.deps);
  const first = f.keys.get("ha-switch:claude-backup:team");
  expect(JSON.parse(first as string).oauthAccount.accountUuid).toBe("synthetic-native");
  await useClaudeAccount(pool, "personal", f.deps);
  expect(f.keys.get("ha-switch:claude-backup:team")).toBe(first);
  await restoreClaudeBackup(pool, f.deps);
  expect(f.files.get(configPath(".claude", home))?.oauthAccount).toEqual(
    snap("synthetic-native", "native").oauthAccount,
  );
  expect(f.keys.get("ha-switch:claude-backup:team")).toBe(first);
});
