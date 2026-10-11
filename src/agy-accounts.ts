import { homedir } from "node:os";
import { join } from "node:path";
import { PoolError } from "./errors.ts";
import { logger } from "./log.ts";
import type { AccountListing, Pool, Pools } from "./types.ts";
export const AGY_POOLS = join(homedir(), ".config", "ha-switch", "agy-pools.json");
const STORE = "ha-switch:agy-account:",
  BACKUP = "ha-switch:agy-backup:",
  NAME = "ha-switch",
  PREFIX = "go-keyring-base64:";
const log = logger("agy-accounts");
export interface AgyDependencies {
  keychain: {
    read(service: string, name: string): Promise<string | undefined>;
    write(service: string, name: string, text: string): Promise<void>;
  };
}
interface Credential {
  text: string;
  identity: string;
  expiry: number;
}
interface Item {
  service: string;
  name: string;
  value?: Credential;
}
const object = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
const labelValid = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
export function validateAgyPools(value: unknown): Pools {
  const pools = object(value);
  if (!pools) throw new PoolError("agy_pools_invalid");
  for (const [name, value] of Object.entries(pools)) {
    const p = object(value);
    if (
      !labelValid(name) ||
      !p ||
      p.home !== ".gemini" ||
      !Array.isArray(p.accounts) ||
      !p.accounts.every(labelValid) ||
      new Set(p.accounts).size !== p.accounts.length ||
      p.from !== undefined ||
      (p.args !== undefined &&
        (!Array.isArray(p.args) || !p.args.every((a) => typeof a === "string")))
    )
      throw new PoolError("agy_pools_invalid");
  }
  return pools as Pools;
}
export async function readAgyPools(path = AGY_POOLS): Promise<Pools> {
  if (!(await Bun.file(path).exists())) return {};
  try {
    return validateAgyPools(await Bun.file(path).json());
  } catch {
    throw new PoolError("agy_pools_invalid");
  }
}
function credential(text: string): Credential {
  if (!text.startsWith(PREFIX)) throw new PoolError("agy_credential_backend_unknown");
  try {
    const encoded = text.slice(PREFIX.length);
    const bytes = Buffer.from(encoded, "base64");
    if (!encoded || bytes.toString("base64") !== encoded) throw new Error();
    const j = object(JSON.parse(bytes.toString("utf8")));
    const t = object(j?.token);
    if (
      !j ||
      !t ||
      typeof j.auth_method !== "string" ||
      !j.auth_method ||
      typeof j.id_token !== "string" ||
      typeof t.access_token !== "string" ||
      !t.access_token ||
      typeof t.refresh_token !== "string" ||
      !t.refresh_token ||
      typeof t.token_type !== "string" ||
      !t.token_type ||
      typeof t.expiry !== "string" ||
      !Number.isFinite(Date.parse(t.expiry))
    )
      throw new Error();
    const parts = j.id_token.split(".");
    if (parts.length !== 3 || !parts[1]) throw new Error();
    const claims = object(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
    if (typeof claims?.sub !== "string" || !claims.sub) throw new Error();
    return { text, identity: claims.sub, expiry: Date.parse(t.expiry) };
  } catch {
    throw new PoolError("agy_credential_invalid");
  }
}
export const agyKeychain: AgyDependencies["keychain"] = {
  async read(service, name) {
    if (process.platform !== "darwin") throw new PoolError("agy_keychain_unsupported");
    log("keychain_read_start");
    try {
      const v = await Bun.secrets.get({ service, name });
      log("keychain_read_success");
      return v ?? undefined;
    } catch {
      log("keychain_read_failure", {}, "error");
      throw new PoolError("agy_keychain_read_failed");
    }
  },
  async write(service, name, text) {
    if (process.platform !== "darwin") throw new PoolError("agy_keychain_unsupported");
    log("keychain_write_start");
    try {
      await Bun.secrets.set({ service, name, value: text });
      log("keychain_write_success");
    } catch {
      log("keychain_write_failure", {}, "error");
      throw new PoolError("agy_keychain_write_failed");
    }
  },
};
const defaults = (): AgyDependencies => ({ keychain: agyKeychain });
async function read(service: string, name: string, deps: AgyDependencies): Promise<Item> {
  const text = await deps.keychain.read(service, name);
  return { service, name, value: text === undefined ? undefined : credential(text) };
}
const native = (d: AgyDependencies) => read("gemini", "antigravity", d);
const stored = (label: string, d: AgyDependencies) => read(STORE + label, NAME, d);
async function unchanged(items: readonly Item[], d: AgyDependencies): Promise<void> {
  for (const i of items)
    if ((await d.keychain.read(i.service, i.name)) !== i.value?.text)
      throw new PoolError("agy_credential_changed");
}
async function replace(i: Item, v: Credential, d: AgyDependencies): Promise<void> {
  if (i.value?.text === v.text) return;
  await unchanged([i], d);
  await d.keychain.write(i.service, i.name, v.text);
  i.value = v;
}
const freshest = (a: Credential, b: Credential) => (b.expiry >= a.expiry ? b : a);
async function state(pool: Pool, d: AgyDependencies) {
  validateAgyPools({ [pool.name]: pool });
  return {
    live: await native(d),
    accounts: await Promise.all(pool.accounts.map((a) => stored(a, d))),
  };
}
export async function captureAgyAccount(
  label: string,
  d: AgyDependencies = defaults(),
): Promise<void> {
  if (!labelValid(label)) throw new PoolError("agy_account_label_invalid");
  const live = await native(d);
  if (!live.value) throw new PoolError("agy_not_signed_in");
  const target = await stored(label, d);
  if (target.value && target.value.identity !== live.value.identity)
    throw new PoolError("agy_account_label_taken");
  await unchanged([live, target], d);
  await replace(target, target.value ? freshest(target.value, live.value) : live.value, d);
}
export async function listAgyAccounts(
  pool: Pool,
  d: AgyDependencies = defaults(),
): Promise<AccountListing> {
  const { live, accounts } = await state(pool, d);
  const index = accounts.findIndex(
    (a) => live.value !== undefined && a.value?.identity === live.value.identity,
  );
  return {
    current: index < 0 ? undefined : pool.accounts[index],
    accounts: pool.accounts.map((account, i) => ({
      account,
      authenticated: Boolean(accounts[i]?.value),
      plan: null,
      resetCredits: null,
      rateLimits: null,
    })),
  };
}
export async function syncAgyAccounts(pool: Pool, d: AgyDependencies = defaults()): Promise<void> {
  const { live, accounts } = await state(pool, d);
  await unchanged([live, ...accounts], d);
  for (const a of accounts)
    if (a.value && live.value && a.value.identity === live.value.identity) {
      await unchanged([live], d);
      await replace(a, freshest(a.value, live.value), d);
    }
}
export async function useAgyAccount(
  pool: Pool,
  label: string,
  d: AgyDependencies = defaults(),
): Promise<void> {
  validateAgyPools({ [pool.name]: pool });
  const index = pool.accounts.indexOf(label);
  if (index < 0) throw new PoolError("account_not_in_pool");
  const { live, accounts } = await state(pool, d);
  const target = accounts[index];
  if (!target?.value) throw new PoolError("agy_account_not_saved");
  const backup = await read(BACKUP + pool.name, NAME, d);
  if (
    live.value &&
    backup.value &&
    backup.value.identity !== live.value.identity &&
    !accounts.some((a) => a.value?.identity === live.value?.identity)
  )
    throw new PoolError("agy_current_account_unsaved");
  await unchanged([live, ...accounts, backup], d);
  if (live.value) {
    if (!backup.value) {
      await unchanged([live], d);
      await replace(backup, live.value, d);
    }
    for (const a of accounts)
      if (a.value && a.value.identity === live.value.identity) {
        await unchanged([live], d);
        await replace(a, freshest(a.value, live.value), d);
      }
  }
  await unchanged([target, backup], d);
  await replace(live, target.value, d);
}
export async function restoreAgyBackup(pool: Pool, d: AgyDependencies = defaults()): Promise<void> {
  const { live, accounts } = await state(pool, d);
  const backup = await read(BACKUP + pool.name, NAME, d);
  if (!backup.value) throw new PoolError("agy_backup_missing");
  if (
    live.value &&
    backup.value.identity !== live.value.identity &&
    !accounts.some((a) => a.value?.identity === live.value?.identity)
  )
    throw new PoolError("agy_current_account_unsaved");
  await unchanged([live, ...accounts, backup], d);
  for (const a of accounts)
    if (a.value && live.value && a.value.identity === live.value.identity) {
      await unchanged([live], d);
      await replace(a, freshest(a.value, live.value), d);
    }
  const candidates = accounts.filter((a) => a.value?.identity === backup.value?.identity);
  if (live.value?.identity === backup.value.identity) candidates.push(live);
  let restored = backup.value;
  for (const candidate of candidates)
    if (candidate.value) restored = freshest(restored, candidate.value);
  await unchanged([backup, ...candidates], d);
  await replace(live, restored, d);
}
