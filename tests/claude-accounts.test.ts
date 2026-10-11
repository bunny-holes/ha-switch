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
  let readHook: ((service: string) => void) | undefined;
  const deps: ClaudeDependencies = {
    home,
    keychain: {
      async read(s) {
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
    deps,
    setProfile,
    onRead: (h: typeof readHook) => {
      readHook = h;
    },
  };
}
describe("Claude macOS account swapping", () => {
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
