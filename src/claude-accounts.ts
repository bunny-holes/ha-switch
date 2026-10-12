import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, stat, unlink } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { errorCode, PoolError } from "./errors.ts";
import { isKeychainFailure, keychainFailure } from "./keychain.ts";
import { logger } from "./log.ts";
import { localProfiles } from "./profiles.ts";
import type { AccountListing, AccountRow, Pool, Pools, RateLimits, RateWindow } from "./types.ts";
import { claudeResetCount } from "./usage.ts";

export const CLAUDE_POOLS = join(homedir(), ".config", "ha-switch", "claude-pools.json");
const STORE = "ha-switch:claude-account:";
const BACKUP = "ha-switch:claude-backup:";
const LEGACY = "toolbox:claude-account:";
const log = logger("claude-accounts");
type Json = Record<string, unknown>;
interface Login extends Json {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
interface Account extends Json {
  accountUuid: string;
}
interface Snapshot {
  service: string;
  item: Json;
  raw?: string;
  config?: Json;
  path?: string;
}
export interface ClaudeDependencies {
  home: string;
  keychain: {
    read(service: string): Promise<string | undefined>;
    write(service: string, value: string): Promise<void>;
  };
  files: {
    read(path: string): Promise<Json | undefined>;
    write(path: string, value: Json): Promise<void>;
  };
  profiles(home: string): Promise<{ host: string; directory: string }[]>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  now(): number;
  local?: boolean;
  nativeBackup?: boolean;
}
const object = (v: unknown): Json | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;
const labelValid = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(v) && v !== "." && v !== "..";
const pathValid = (v: unknown): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  Array.from(v).every(
    (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
  );
export function validateClaudePools(value: unknown): Pools {
  const pools = object(value);
  if (!pools) throw new PoolError("claude_pools_invalid");
  for (const [name, value] of Object.entries(pools)) {
    const p = object(value);
    if (
      !labelValid(name) ||
      !p ||
      !pathValid(p.home) ||
      !Array.isArray(p.accounts) ||
      !p.accounts.every(labelValid) ||
      new Set(p.accounts).size !== p.accounts.length ||
      (p.args !== undefined &&
        (!Array.isArray(p.args) || !p.args.every((a) => typeof a === "string")))
    )
      throw new PoolError("claude_pools_invalid");
    if (p.from !== undefined) {
      const from = object(p.from);
      const accounts = p.accounts;
      if (
        !from ||
        Object.entries(from).some(([label, path]) => !accounts.includes(label) || !pathValid(path))
      )
        throw new PoolError("claude_pools_invalid");
    }
  }
  return pools as Pools;
}
export async function readClaudePools(path = CLAUDE_POOLS): Promise<Pools> {
  if (!(await Bun.file(path).exists())) return {};
  try {
    return validateClaudePools(await Bun.file(path).json());
  } catch {
    throw new PoolError("claude_pools_invalid");
  }
}
export function keychainAccount(): string {
  return userInfo().username;
}
export function credentialService(directory: string, home = homedir()): string {
  if (resolve(home, directory) === resolve(home, ".claude")) return "Claude Code-credentials";
  return (
    "Claude Code-credentials-" +
    createHash("sha256").update(resolve(home, directory).normalize("NFC")).digest("hex").slice(0, 8)
  );
}
export const configPath = (directory: string, home = homedir()) =>
  resolve(home, directory) === resolve(home, ".claude")
    ? join(home, ".claude.json")
    : join(resolve(home, directory), ".claude.json");
export const macKeychain: ClaudeDependencies["keychain"] = {
  async read(service) {
    if (process.platform !== "darwin") throw new PoolError("keychain_unsupported");
    log("keychain_read_start");
    try {
      const value = await Bun.secrets.get({ service, name: keychainAccount() });
      log("keychain_read_success");
      return value ?? undefined;
    } catch (error) {
      const failure = keychainFailure(error);
      if (failure.code === "keychain_item_missing") return undefined;
      log("keychain_read_failure", { code: failure.code }, "error");
      throw failure;
    }
  },
  async write(service, value) {
    if (process.platform !== "darwin") throw new PoolError("keychain_unsupported");
    log("keychain_write_start");
    try {
      await Bun.secrets.set({ service, name: keychainAccount(), value });
      log("keychain_write_success");
    } catch (error) {
      const failure = keychainFailure(error, "write");
      log("keychain_write_failure", { code: failure.code }, "error");
      throw failure;
    }
  },
};
export const configFiles: ClaudeDependencies["files"] = {
  async read(path) {
    if (!(await Bun.file(path).exists())) return undefined;
    try {
      const v = object(await Bun.file(path).json());
      if (!v) throw new Error();
      return v;
    } catch {
      throw new PoolError("claude_config_invalid");
    }
  },
  async write(path, value) {
    const mode = await stat(path).then(
      (s) => s.mode & 0o777,
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return 0o600;
        throw e;
      },
    );
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = path + "." + randomUUID() + ".tmp";
    try {
      await Bun.write(temporary, JSON.stringify(value) + "\n", { mode });
      await chmod(temporary, mode);
      await rename(temporary, path);
    } catch (primary) {
      try {
        await unlink(temporary);
      } catch (cleanup) {
        if (!(cleanup instanceof Error && "code" in cleanup && cleanup.code === "ENOENT"))
          throw new PoolError("claude_config_cleanup_failed", undefined, {
            cause: new AggregateError([primary, cleanup], "claude_config_write_and_cleanup_failed"),
          });
      }
      throw primary;
    }
  },
};
const defaults = (): ClaudeDependencies => ({
  home: homedir(),
  keychain: macKeychain,
  files: configFiles,
  profiles: localProfiles,
  fetch: globalThis.fetch,
  now: Date.now,
});
function login(v: unknown): Login | undefined {
  if (v === undefined || v === null) return undefined;
  const item = object(v);
  if (
    !item ||
    typeof item.accessToken !== "string" ||
    typeof item.refreshToken !== "string" ||
    typeof item.expiresAt !== "number" ||
    !Number.isFinite(item.expiresAt) ||
    Math.abs(item.expiresAt) > 8.64e15
  )
    throw new PoolError("claude_credential_invalid");
  if (!item.accessToken && !item.refreshToken) return undefined;
  if (!item.accessToken || !item.refreshToken) throw new PoolError("claude_credential_invalid");
  return item as Login;
}
function account(v: unknown): Account | undefined {
  if (v === undefined || v === null) return undefined;
  const item = object(v);
  if (!item || typeof item.accountUuid !== "string" || !item.accountUuid)
    throw new PoolError("claude_account_invalid");
  return item as Account;
}
async function read(service: string, deps: ClaudeDependencies): Promise<Snapshot> {
  const raw = await deps.keychain.read(service);
  let item: Json = {};
  if (raw !== undefined) {
    try {
      const parsed = object(JSON.parse(raw));
      if (!parsed) throw new Error();
      item = parsed;
    } catch {
      throw new PoolError("claude_credential_invalid");
    }
  }
  login(item.claudeAiOauth);
  if (
    service.startsWith(STORE) ||
    service.startsWith(LEGACY) ||
    service.startsWith(BACKUP) ||
    service.startsWith("ha-switch:claude-native-backup:")
  )
    account(item.oauthAccount);
  return { service, raw, item };
}
async function profile(directory: string, deps: ClaudeDependencies): Promise<Snapshot> {
  const snap = await read(credentialService(directory, deps.home), deps);
  snap.path = configPath(directory, deps.home);
  snap.config = (await deps.files.read(snap.path)) ?? {};
  account(snap.config.oauthAccount);
  return snap;
}
const identity = (s: Snapshot) =>
  account(s.config?.oauthAccount ?? s.item.oauthAccount)?.accountUuid;
const meta = (s: Snapshot) => s.config?.oauthAccount ?? s.item.oauthAccount;
async function unchanged(s: Snapshot, deps: ClaudeDependencies): Promise<void> {
  if ((await deps.keychain.read(s.service)) !== s.raw) throw new PoolError("profile_changed");
  if (
    s.path &&
    JSON.stringify((await deps.files.read(s.path))?.oauthAccount) !==
      JSON.stringify(s.config?.oauthAccount)
  )
    throw new PoolError("profile_changed");
}
async function writeSnapshot(s: Snapshot, value: Json, deps: ClaudeDependencies): Promise<void> {
  await unchanged(s, deps);
  const text = JSON.stringify(value);
  await deps.keychain.write(s.service, text);
  s.raw = text;
  s.item = value;
}
async function copies(pool: Pool, deps: ClaudeDependencies) {
  validateClaudePools({ [pool.name]: pool });
  const directories = [
    ...new Set([
      pool.home,
      ...pool.accounts.filter((label) => label.startsWith(".claude")),
      ...Object.values(pool.from ?? {}),
    ]),
  ];
  // Fail at the first unavailable keychain boundary instead of logging the same
  // global access failure for every profile in parallel.
  const native: Snapshot[] = [];
  for (const directory of directories) native.push(await profile(directory, deps));
  const stored: Snapshot[] = [];
  for (const label of pool.accounts) stored.push(await read(STORE + label, deps));
  return { native, stored };
}
export async function captureClaudeAccount(
  label: string,
  overrides: Partial<ClaudeDependencies> & { directory?: string } = {},
): Promise<void> {
  if (!labelValid(label)) throw new PoolError("claude_account_label_invalid");
  const deps = { ...defaults(), ...overrides };
  const source = await profile(overrides.directory ?? ".claude", deps);
  const held = identity(source);
  const token = login(source.item.claudeAiOauth);
  if (!held || !token) throw new PoolError("account_not_signed_in");
  const target = await read(STORE + label, deps);
  if (identity(target) && identity(target) !== held) throw new PoolError("account_label_taken");
  await unchanged(source, deps);
  await unchanged(target, deps);
  const old = login(target.item.claudeAiOauth);
  if (old && old.expiresAt > token.expiresAt) return;
  await writeSnapshot(
    target,
    { ...target.item, claudeAiOauth: token, oauthAccount: meta(source) },
    deps,
  );
}
async function importAccounts(
  pool: Pool,
  deps: ClaudeDependencies,
  state: Awaited<ReturnType<typeof copies>>,
) {
  const changes: { source: Snapshot; target: Snapshot }[] = [];
  for (const [i, label] of pool.accounts.entries()) {
    const target = state.stored[i];
    if (!target || identity(target)) continue;
    const directory = pool.from?.[label] ?? (label.startsWith(".claude") ? label : undefined);
    if (!directory) continue;
    const source = state.native.find((s) => s.service === credentialService(directory, deps.home));
    if (source && identity(source) && login(source.item.claudeAiOauth))
      changes.push({ source, target });
  }
  for (const { source, target } of changes) {
    await unchanged(source, deps);
    await unchanged(target, deps);
  }
  for (const { source, target } of changes) {
    await unchanged(source, deps);
    await writeSnapshot(
      target,
      { ...target.item, claudeAiOauth: source.item.claudeAiOauth, oauthAccount: meta(source) },
      deps,
    );
  }
}
async function synchronize(
  pool: Pool,
  deps: ClaudeDependencies,
  state: Awaited<ReturnType<typeof copies>>,
): Promise<Snapshot[]> {
  await importAccounts(pool, deps, state);
  const all = [...state.native, ...state.stored];
  for (const target of all) {
    const id = identity(target);
    const own = login(target.item.claudeAiOauth);
    if (!id || !own) continue;
    const newest = all
      .filter((s) => identity(s) === id && login(s.item.claudeAiOauth))
      .reduce(
        (a, b) =>
          (login(b.item.claudeAiOauth)?.expiresAt ?? 0) >
          (login(a.item.claudeAiOauth)?.expiresAt ?? 0)
            ? b
            : a,
        target,
      );
    if (JSON.stringify(newest.item.claudeAiOauth) !== JSON.stringify(target.item.claudeAiOauth)) {
      await unchanged(newest, deps);
      await writeSnapshot(
        target,
        { ...target.item, claudeAiOauth: newest.item.claudeAiOauth },
        deps,
      );
    }
  }
  return all;
}
export async function syncAccounts(
  pool: Pool,
  overrides: Partial<ClaudeDependencies> = {},
): Promise<Snapshot[]> {
  const deps = { ...defaults(), ...overrides };
  return synchronize(pool, deps, await copies(pool, deps));
}
function backupService(pool: Pool, deps: ClaudeDependencies): string {
  return deps.nativeBackup ? `ha-switch:claude-native-backup:${pool.name}` : BACKUP + pool.name;
}
async function switchTo(
  pool: Pool,
  target: Snapshot,
  deps: ClaudeDependencies,
  backup: boolean,
  freshnessSource?: Snapshot,
) {
  if (!login(target.item.claudeAiOauth) || !identity(target))
    throw new PoolError("account_not_stored");
  const previous = await profile(pool.home, deps);
  if (
    JSON.stringify(previous.item.claudeAiOauth) === JSON.stringify(target.item.claudeAiOauth) &&
    identity(previous) === identity(target)
  )
    return;
  const saved = await read(backupService(pool, deps), deps);
  if (freshnessSource) await unchanged(freshnessSource, deps);
  await unchanged(target, deps);
  await unchanged(previous, deps);
  if (backup)
    await writeSnapshot(
      saved,
      { claudeAiOauth: previous.item.claudeAiOauth ?? null, oauthAccount: meta(previous) ?? null },
      deps,
    );
  if (freshnessSource) await unchanged(freshnessSource, deps);
  await unchanged(target, deps);
  const priorLogin = previous.item.claudeAiOauth;
  await writeSnapshot(
    previous,
    { ...previous.item, claudeAiOauth: target.item.claudeAiOauth },
    deps,
  );
  try {
    const fresh = (await deps.files.read(previous.path as string)) ?? {};
    if (JSON.stringify(fresh.oauthAccount) !== JSON.stringify(previous.config?.oauthAccount))
      throw new PoolError("profile_changed");
    await deps.files.write(previous.path as string, { ...fresh, oauthAccount: meta(target) });
  } catch (error) {
    const held = await read(previous.service, deps);
    if (JSON.stringify(held.item.claudeAiOauth) !== JSON.stringify(target.item.claudeAiOauth))
      throw new PoolError("claude_rollback_changed");
    const reverted = { ...held.item };
    if (priorLogin === undefined) delete reverted.claudeAiOauth;
    else reverted.claudeAiOauth = priorLogin;
    await writeSnapshot(held, reverted, deps);
    throw new PoolError(errorCode(error, "claude_config_write_failed"));
  }
}
export async function useClaudeAccount(
  pool: Pool,
  label: string,
  overrides: Partial<ClaudeDependencies> = {},
): Promise<void> {
  validateClaudePools({ [pool.name]: pool });
  if (!pool.accounts.includes(label)) throw new PoolError("account_not_in_pool");
  const deps = { ...defaults(), ...overrides };
  // Validate source before any imports or synchronizing writes.
  const state = await copies(pool, deps);
  const target = state.stored[pool.accounts.indexOf(label)] as Snapshot;
  if (!identity(target) || !login(target.item.claudeAiOauth)) {
    const dir = pool.from?.[label] ?? (label.startsWith(".claude") ? label : undefined);
    if (!dir) throw new PoolError("account_not_stored");
    const source = state.native.find((s) => s.service === credentialService(dir, deps.home));
    if (!source || !identity(source) || !login(source.item.claudeAiOauth))
      throw new PoolError("account_not_signed_in");
  }
  await synchronize(pool, deps, state);
  await switchTo(pool, target, deps, true);
}
export async function restoreClaudeBackup(
  pool: Pool,
  overrides: Partial<ClaudeDependencies> = {},
): Promise<Account> {
  validateClaudePools({ [pool.name]: pool });
  const deps = { ...defaults(), ...overrides };
  const saved = await read(backupService(pool, deps), deps);
  if (!identity(saved) || !login(saved.item.claudeAiOauth)) throw new PoolError("backup_missing");
  const state = await copies(pool, deps);
  const newest = [...state.native, ...state.stored]
    .filter((s) => identity(s) === identity(saved) && login(s.item.claudeAiOauth))
    .reduce(
      (a, b) =>
        (login(b.item.claudeAiOauth)?.expiresAt ?? 0) >
        (login(a.item.claudeAiOauth)?.expiresAt ?? 0)
          ? b
          : a,
      saved,
    );
  const target = { ...saved, item: { ...saved.item, claudeAiOauth: newest.item.claudeAiOauth } };
  await switchTo(pool, target, deps, false, newest);
  return account(saved.item.oauthAccount) as Account;
}
export async function importLegacyClaudeAccounts(
  pools: Pools,
  overrides: Partial<ClaudeDependencies> = {},
): Promise<number> {
  validateClaudePools(pools);
  const deps = { ...defaults(), ...overrides };
  const changes: { source: Snapshot; target: Snapshot }[] = [];
  for (const label of new Set(Object.values(pools).flatMap((p) => p.accounts))) {
    const target = await read(STORE + label, deps);
    if (identity(target)) continue;
    const source = await read(LEGACY + label, deps);
    if (identity(source) && login(source.item.claudeAiOauth)) changes.push({ source, target });
  }
  for (const { source, target } of changes) {
    await unchanged(source, deps);
    await unchanged(target, deps);
  }
  for (const { source, target } of changes) {
    await unchanged(source, deps);
    await writeSnapshot(target, source.item, deps);
  }
  return changes.length;
}
function limits(value: unknown, plan: string | null): RateLimits | null {
  const body = object(value);
  if (!body) return null;
  const window = (v: unknown, duration: number): RateWindow | null => {
    const w = object(v);
    if (
      !w ||
      typeof w.utilization !== "number" ||
      !Number.isFinite(w.utilization) ||
      w.utilization < 0 ||
      w.utilization > 100
    )
      return null;
    const reset = typeof w.resets_at === "string" ? Date.parse(w.resets_at) : NaN;
    return {
      usedPercent: w.utilization,
      windowDurationMins: duration,
      ...(Number.isFinite(reset) ? { resetsAt: reset / 1000 } : {}),
    };
  };
  const primary = window(body.five_hour, 300);
  const secondary = window(body.seven_day, 10080);
  return primary || secondary ? { planType: plan, primary, secondary } : null;
}
export async function listClaudeAccounts(
  pool: Pool,
  overrides: Partial<ClaudeDependencies> = {},
): Promise<AccountListing> {
  const deps = { ...defaults(), ...overrides };
  let state: Awaited<ReturnType<typeof copies>>;
  try {
    state = await copies(pool, deps);
  } catch (error) {
    if (!isKeychainFailure(error) || error.code === "keychain_item_missing") throw error;
    return {
      accounts: pool.accounts.map((account) => ({
        account,
        credentialError: error.code,
        resetCredits: null,
        rateLimits: null,
      })),
      warnings: [error.code],
    };
  }
  const native = state.native.find((s) => s.service === credentialService(pool.home, deps.home));
  const nativeLogin = native && login(native.item.claudeAiOauth);
  const accounts: AccountRow[] = [];
  let current: string | undefined;
  for (const [i, label] of pool.accounts.entries()) {
    let s: Snapshot | undefined = state.stored[i];
    if (!s || !identity(s)) {
      const dir = pool.from?.[label] ?? (label.startsWith(".claude") ? label : undefined);
      if (dir) s = state.native.find((n) => n.service === credentialService(dir, deps.home));
    }
    if (s && identity(s) && native && nativeLogin && identity(s) === identity(native))
      current ??= label;
    let token = s ? login(s.item.claudeAiOauth) : undefined;
    if (s && identity(s)) {
      for (const candidate of [...state.native, ...state.stored]) {
        if (identity(candidate) !== identity(s)) continue;
        const held = login(candidate.item.claudeAiOauth);
        if (held && (!token || held.expiresAt > token.expiresAt)) token = held;
      }
    }
    const allowed = new Set(["free", "pro", "max", "team", "enterprise"]);
    const p = typeof token?.subscriptionType === "string" ? token.subscriptionType : "";
    const plan = allowed.has(p) ? p : null;
    const row: AccountRow = {
      account: label,
      plan,
      authenticated: Boolean(token && s && identity(s)),
      resetCredits: null,
      rateLimits: null,
    };
    if (!deps.local && token) {
      try {
        if (token.expiresAt <= deps.now()) throw new PoolError("claude_login_expired");
        const response = await deps.fetch(
          "https://api.anthropic.com/api/oauth/usage?cedar_ember=1&skip_spend=1",
          {
            headers: {
              Authorization: "Bearer " + token.accessToken,
              "anthropic-beta": "oauth-2025-04-20",
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw new PoolError("claude_usage_http_" + response.status);
        const body: unknown = await response.json();
        row.rateLimits = limits(body, plan);
        row.resetCredits = claudeResetCount(body);
      } catch (error) {
        row.resetError = errorCode(error, "claude_usage_query_failed");
      }
    }
    accounts.push(row);
  }
  return {
    current,
    accounts,
    ...(accounts.length && accounts.every((row) => row.authenticated === false)
      ? { warnings: ["keychain_item_missing"] }
      : {}),
  };
}
