import { chmod, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { errorCode, PoolError } from "./errors.ts";
import { logger } from "./log.ts";
import { localProfiles } from "./profiles.ts";
import type { AccountListing, Pool, PoolSpec, Pools } from "./types.ts";

export { PoolError } from "./errors.ts";
export const POOLS = join(homedir(), ".config", "ha-switch", "codex-pools.json");
const log = logger("pool");
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && !value.includes("\0");

function validatePool(value: unknown, home: string): asserts value is PoolSpec {
  const pool = record(value);
  if (
    !pool ||
    !nonempty(pool.home) ||
    !Array.isArray(pool.accounts) ||
    !pool.accounts.length ||
    pool.accounts.some((account) => !nonempty(account))
  )
    throw new PoolError("pool_config_invalid");
  const accounts = pool.accounts as string[];
  if (new Set(accounts).size !== accounts.length) throw new PoolError("pool_profile_duplicate");
  if (
    pool.args !== undefined &&
    (!Array.isArray(pool.args) ||
      pool.args.some((argument) => typeof argument !== "string" || argument.includes("\0")))
  )
    throw new PoolError("pool_config_invalid");
  const from = pool.from === undefined ? {} : record(pool.from);
  if (
    !from ||
    Object.entries(from).some(
      ([account, directory]) => !accounts.includes(account) || !nonempty(directory),
    )
  )
    throw new PoolError("pool_config_invalid");
  const paths = accounts.map((account) =>
    resolve(home, Object.hasOwn(from, account) ? (from[account] as string) : account),
  );
  if (new Set(paths).size !== paths.length) throw new PoolError("pool_profile_duplicate");
}

export async function readPools(path = POOLS, home = homedir()): Promise<Pools> {
  if (!(await Bun.file(path).exists())) return {};
  let parsed: unknown;
  try {
    parsed = await Bun.file(path).json();
  } catch (cause) {
    throw new PoolError("pool_config_invalid", undefined, { cause });
  }
  const pools = record(parsed);
  if (!pools) throw new PoolError("pool_config_invalid");
  for (const [name, pool] of Object.entries(pools)) {
    if (!nonempty(name)) throw new PoolError("pool_config_invalid");
    validatePool(pool, home);
  }
  return pools as Pools;
}

export function poolOf(pools: Pools, directory: string): Pool | undefined {
  for (const [name, pool] of Object.entries(pools))
    if (pool.home === directory) return { name, ...pool };
  return undefined;
}

export function poolNamed(pools: Pools, name?: string): Pool {
  if (!name || !Object.hasOwn(pools, name)) throw new PoolError("pool_unknown");
  return { name, ...pools[name] };
}

export function profileDirectory(pool: PoolSpec, label: string, home = homedir()): string {
  validatePool(pool, home);
  if (!pool.accounts.includes(label)) throw new PoolError("account_not_in_pool");
  return pool.from && Object.hasOwn(pool.from, label) ? pool.from[label] : label;
}

export async function listAccounts(pool: Pool, home = homedir()): Promise<AccountListing> {
  validatePool(pool, home);
  const auths = await Promise.all(
    pool.accounts.map((account) => readAuth(profileDirectory(pool, account, home), home)),
  );
  const held = (await readAuth(pool.home, home))?.account;
  return {
    current: held
      ? pool.accounts.find((_account, index) => auths[index]?.account === held)
      : undefined,
    accounts: pool.accounts.map((account, index) => ({
      account,
      plan: auths[index]?.plan ?? null,
    })),
  };
}

export interface AuthSnapshot {
  directory: string;
  text: string;
  account?: string;
  refreshed?: string;
  plan: string | null;
}

function parseAuth(text: string): { account?: string; refreshed?: string; plan: string | null } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new PoolError("account_auth_invalid", undefined, { cause });
  }
  const auth = record(value);
  if (!auth) throw new PoolError("account_auth_invalid");
  const tokens = record(auth.tokens);
  if (auth.tokens !== undefined && !tokens) throw new PoolError("account_auth_invalid");
  const account = tokens?.account_id;
  if (account !== undefined && !nonempty(account)) throw new PoolError("account_auth_invalid");
  let plan: string | null = null;
  if (tokens?.id_token !== undefined) {
    const token = tokens.id_token;
    if (typeof token !== "string" || token.split(".").length !== 3)
      throw new PoolError("account_auth_invalid");
    try {
      const payload = record(
        JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")),
      );
      if (!payload) throw new Error("jwt_payload_invalid");
      const claim = record(payload["https://api.openai.com/auth"])?.chatgpt_plan_type;
      if (claim !== undefined && typeof claim !== "string") throw new Error("jwt_plan_invalid");
      plan = typeof claim === "string" ? claim : null;
    } catch (cause) {
      throw new PoolError("account_auth_invalid", undefined, { cause });
    }
  }
  return {
    account: typeof account === "string" ? account : undefined,
    refreshed: typeof auth.last_refresh === "string" ? auth.last_refresh : undefined,
    plan,
  };
}

async function assertFileStore(directory: string, home: string): Promise<void> {
  const config = Bun.file(join(resolve(home, directory), "config.toml"));
  if (!(await config.exists())) return;
  let value: unknown;
  try {
    value = Bun.TOML.parse(await config.text());
  } catch (cause) {
    throw new PoolError("codex_config_invalid", undefined, { cause });
  }
  const store = record(value)?.cli_auth_credentials_store;
  if (store !== undefined && store !== "file")
    throw new PoolError("codex_credentials_store_unsupported");
}

export async function readAuth(
  directory: string,
  home = homedir(),
): Promise<AuthSnapshot | undefined> {
  await assertFileStore(directory, home);
  const file = Bun.file(join(resolve(home, directory), "auth.json"));
  if (!(await file.exists())) return undefined;
  const text = await file.text();
  return { directory, text, ...parseAuth(text) };
}

export function syncPlan(
  auths: readonly (AuthSnapshot | undefined)[],
): { from: AuthSnapshot; to: string }[] {
  const groups = new Map<string, AuthSnapshot[]>();
  for (const auth of auths)
    if (auth?.account) {
      const copies = groups.get(auth.account) ?? [];
      copies.push(auth);
      groups.set(auth.account, copies);
    }
  const writes: { from: AuthSnapshot; to: string }[] = [];
  const refreshed = (auth: AuthSnapshot) => {
    const date = Date.parse(auth.refreshed ?? "");
    return Number.isFinite(date) ? date : -Infinity;
  };
  for (const copies of groups.values()) {
    const newest = copies.reduce((a, b) => (refreshed(b) > refreshed(a) ? b : a));
    for (const copy of copies)
      if (copy.text !== newest.text) writes.push({ from: newest, to: copy.directory });
  }
  return writes;
}

const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
async function atomicWrite(
  path: string,
  text: string,
  fallbackMode = 0o600,
  expected?: { text?: string },
): Promise<void> {
  let mode = fallbackMode;
  try {
    mode = (await stat(path)).mode & 0o777;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const file = await open(temporary, "wx", mode);
  let closed = false;
  try {
    await file.writeFile(text);
    await file.close();
    closed = true;
    await chmod(temporary, mode);
    if (expected) {
      const held = Bun.file(path);
      const current = (await held.exists()) ? await held.text() : undefined;
      if (current !== expected.text) throw new PoolError("account_auth_changed");
    }
    await rename(temporary, path);
  } catch (error) {
    const causes = [error];
    if (!closed) {
      try {
        await file.close();
      } catch (cleanup) {
        causes.push(cleanup);
      }
    }
    try {
      await unlink(temporary);
    } catch (cleanup) {
      if (!missing(cleanup)) causes.push(cleanup);
    }
    if (causes.length > 1)
      throw new PoolError("account_write_cleanup_failed", undefined, {
        cause: new AggregateError(causes),
      });
    throw error;
  }
}

async function synchronize(
  home: string,
  directories: readonly string[],
  wrote?: (directory: string, text: string) => void,
  configuredOnly = false,
): Promise<void> {
  log("sync_start");
  const profiles = (configuredOnly ? [] : await localProfiles(home))
    .filter((profile) => profile.host === "codex")
    .map((profile) => profile.directory);
  const unique = [
    ...new Map(
      [...profiles, ...directories].map((directory) => [resolve(home, directory), directory]),
    ).values(),
  ];
  const auths = await Promise.all(unique.map((directory) => readAuth(directory, home)));
  const writes = syncPlan(auths);
  for (const { from, to } of writes) {
    const previous = auths.find((auth) => auth?.directory === to);
    await atomicWrite(join(resolve(home, to), "auth.json"), from.text, 0o600, {
      text: previous?.text,
    });
    wrote?.(to, from.text);
  }
  log("sync_success", { count: writes.length });
}

export async function syncAll(
  home = homedir(),
  directories: readonly string[] = [],
): Promise<void> {
  await synchronize(home, directories);
}

export function nativeCodexPool(pool: Pool, directory: string, home = homedir()): Pool {
  validatePool(pool, home);
  const from = { ...pool.from };
  for (const label of pool.accounts) {
    if (resolve(home, profileDirectory(pool, label, home)) === resolve(home, ".codex"))
      from[label] = join(resolve(directory), "codex-accounts", "native");
  }
  return { ...pool, home: ".codex", from };
}

export async function codexPoolSources(
  pool: Pool,
  directory: string,
  home = homedir(),
): Promise<Pool> {
  const native = nativeCodexPool(pool, directory, home);
  const from = { ...pool.from };
  for (const label of pool.accounts) {
    const saved = profileDirectory(native, label, home);
    if (
      saved !== profileDirectory(pool, label, home) &&
      (await Bun.file(join(saved, "auth.json")).exists())
    )
      from[label] = saved;
  }
  return { ...pool, from };
}

export async function listNativeCodexAccounts(
  pool: Pool,
  directory: string,
  home = homedir(),
): Promise<AccountListing> {
  return listAccounts({ ...(await codexPoolSources(pool, directory, home)), home: ".codex" }, home);
}

export interface PreparedCodexPool {
  pool: Pool;
  expectedTarget: { text?: string };
}

export async function prepareNativeCodexPool(
  pool: Pool,
  label: string,
  directory: string,
  home = homedir(),
): Promise<PreparedCodexPool> {
  const native = nativeCodexPool(pool, directory, home);
  const source = profileDirectory(native, label, home);
  const originalLabel = pool.accounts.find(
    (account) => resolve(home, profileDirectory(pool, account, home)) === resolve(home, ".codex"),
  );
  const previous = await readAuth(".codex", home);
  const archive = originalLabel ? profileDirectory(native, originalLabel, home) : undefined;
  const saved = archive ? await readAuth(archive, home) : undefined;
  const selected = label === originalLabel && !saved ? previous : await readAuth(source, home);
  if (!selected?.account) throw new PoolError("account_not_signed_in");
  if (archive && !saved && previous?.account) {
    const current = await readAuth(".codex", home);
    if (current?.text !== previous.text) throw new PoolError("account_auth_changed");
    const mode = (await stat(join(resolve(home, ".codex"), "auth.json"))).mode & 0o777;
    await atomicWrite(join(archive, "auth.json"), previous.text, mode, { text: undefined });
  }
  return { pool: native, expectedTarget: { text: previous?.text } };
}

export interface CodexWriteOptions {
  configuredOnly?: boolean;
  expectedTarget?: { text?: string };
}

export async function useAccount(
  pool: Pool,
  label: string,
  home = homedir(),
  options: CodexWriteOptions = {},
): Promise<void> {
  const sourceDirectory = profileDirectory(pool, label, home);
  const target = resolve(home, pool.home);
  if (
    pool.accounts.some((account) => resolve(home, profileDirectory(pool, account, home)) === target)
  )
    throw new PoolError("pool_target_is_account");
  if (!(await readAuth(sourceDirectory, home))?.account)
    throw new PoolError("account_not_signed_in");
  const before = await readAuth(pool.home, home);
  if (options.expectedTarget && before?.text !== options.expectedTarget.text)
    throw new PoolError("account_auth_changed");
  const authPath = join(target, "auth.json");
  const backup = `${authPath}.ha-switch-backup`;
  if (before && !(await Bun.file(backup).exists())) {
    const mode = (await stat(authPath)).mode & 0o777;
    await atomicWrite(backup, before.text, mode);
  }
  log("switch_start");
  let installedText = before?.text;
  try {
    await synchronize(
      home,
      [pool.home, ...pool.accounts.map((account) => profileDirectory(pool, account, home))],
      (directory, text) => {
        if (resolve(home, directory) === target) installedText = text;
      },
      options.configuredOnly,
    );
    const source = await readAuth(sourceDirectory, home);
    if (!source?.account) throw new PoolError("account_not_signed_in");
    const current = await readAuth(pool.home, home);
    if (current?.text !== installedText) throw new PoolError("account_auth_changed");
    if (current?.text !== source.text) {
      await atomicWrite(authPath, source.text, 0o600, { text: current?.text });
      installedText = source.text;
    }
  } catch (error) {
    log("switch_failure", { code: errorCode(error, "account_switch_failed") }, "error");
    const file = Bun.file(authPath);
    const live = (await file.exists()) ? await file.text() : undefined;
    if (live !== installedText)
      throw new PoolError("account_rollback_changed", undefined, { cause: error });
    if (before && live !== before.text) {
      try {
        await atomicWrite(authPath, before.text, 0o600, { text: live });
      } catch (rollbackError) {
        throw new PoolError("account_switch_rollback_failed", undefined, {
          cause: new AggregateError([error, rollbackError]),
        });
      }
    }
    throw error;
  }
  log("switch_success");
}

export async function currentAccount(pool: Pool, home = homedir()): Promise<string | undefined> {
  const held = (await readAuth(pool.home, home))?.account;
  if (!held) return undefined;
  for (const account of pool.accounts)
    if ((await readAuth(profileDirectory(pool, account, home), home))?.account === held)
      return account;
  return undefined;
}

export async function restoreAccount(
  pool: Pool,
  home = homedir(),
  options: { configuredOnly?: boolean } = {},
): Promise<boolean> {
  validatePool(pool, home);
  const target = resolve(home, pool.home);
  if (
    pool.accounts.some((account) => resolve(home, profileDirectory(pool, account, home)) === target)
  )
    throw new PoolError("pool_target_is_account");
  const path = join(target, "auth.json");
  const file = Bun.file(`${path}.ha-switch-backup`);
  if (!(await file.exists())) return false;
  const text = await file.text();
  const saved: AuthSnapshot = { directory: pool.home, text, ...parseAuth(text) };
  const directories = [
    pool.home,
    ...pool.accounts.map((account) => profileDirectory(pool, account, home)),
  ];
  await synchronize(home, directories, undefined, options.configuredOnly);
  const copies = await Promise.all(directories.map((directory) => readAuth(directory, home)));
  const refreshed = (auth: AuthSnapshot) => {
    const date = Date.parse(auth.refreshed ?? "");
    return Number.isFinite(date) ? date : -Infinity;
  };
  const newest = copies.reduce<AuthSnapshot>(
    (latest, copy) =>
      copy && copy.account === saved.account && refreshed(copy) > refreshed(latest) ? copy : latest,
    saved,
  );
  const current = await readAuth(pool.home, home);
  await atomicWrite(path, newest.text, 0o600, { text: current?.text });
  log("restore_success");
  return true;
}
