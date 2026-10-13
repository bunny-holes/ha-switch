import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { validateAgyPools } from "./agy-accounts.ts";
import { validateClaudePools } from "./claude-accounts.ts";
import { PoolError } from "./errors.ts";
import { readPools } from "./pool.ts";
import { localProfiles } from "./profiles.ts";
import type { Pools } from "./types.ts";

export type Host = "codex" | "claude" | "agy";
export const defaultConfigDir = () =>
  process.env.HA_SWITCH_CONFIG_DIR || join(homedir(), ".config", "ha-switch");
export const poolsPath = (directory: string, host: Host) => join(directory, `${host}-pools.json`);

export function validateHostPools(host: Host, pools: Pools): Pools {
  if (host === "claude") return validateClaudePools(pools);
  if (host === "agy") return validateAgyPools(pools);
  return pools;
}

async function checkDestination(path: string, pools: Pools): Promise<boolean> {
  if (!(await Bun.file(path).exists())) return false;
  if (JSON.stringify(await readPools(path)) !== JSON.stringify(pools))
    throw new PoolError("config_destination_exists");
  return true;
}

export async function saveConfigurations(
  directory: string,
  configurations: Partial<Record<Host, Pools>>,
): Promise<void> {
  const entries = Object.entries(configurations) as [Host, Pools][];
  for (const [host, pools] of entries) validateHostPools(host, pools);
  const existing = await Promise.all(
    entries.map(([host, pools]) => checkDestination(poolsPath(directory, host), pools)),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const [index, [host, pools]] of entries.entries()) {
    if (existing[index]) continue;
    const file = await open(poolsPath(directory, host), "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(pools, null, 2)}\n`);
    } finally {
      await file.close();
    }
  }
}

export async function initConfiguration(
  directory = defaultConfigDir(),
  home = homedir(),
): Promise<void> {
  const configurations: Partial<Record<Host, Pools>> = {};
  const profiles = await localProfiles(home);
  for (const host of ["codex", "claude"] as const) {
    const target = host === "codex" ? ".codex-ha-switch" : undefined;
    const accounts: string[] = [];
    for (const profile of profiles.filter((profile) => profile.host === host)) {
      if (profile.directory === target) continue;
      try {
        if ((await stat(join(home, profile.directory))).isDirectory())
          accounts.push(profile.directory);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    if (!accounts.length) continue;
    configurations[host] = {
      default: {
        home: target ?? accounts[0],
        accounts,
        ...(host === "claude"
          ? { from: Object.fromEntries(accounts.map((account) => [account, account])) }
          : {}),
      },
    };
  }
  if (!Object.keys(configurations).length) throw new PoolError("profiles_not_found");
  await saveConfigurations(directory, configurations);
}

export async function importConfiguration(
  source: string,
  directory = defaultConfigDir(),
): Promise<Partial<Record<Host, Pools>>> {
  const configurations: Partial<Record<Host, Pools>> = {};
  for (const host of ["codex", "claude", "agy"] as const) {
    const path = poolsPath(source, host);
    if (await Bun.file(path).exists())
      configurations[host] = validateHostPools(host, await readPools(path));
  }
  if (!Object.keys(configurations).length) throw new PoolError("import_config_missing");
  await saveConfigurations(directory, configurations);
  return configurations;
}

export interface ProfileRegistration {
  path: string;
  expectedText?: string;
  pool: string;
  label: string;
  source: string;
  next: Pools;
}

const DEFAULT_HOME: Record<Host, string> = {
  codex: ".codex",
  claude: ".claude",
  agy: ".gemini",
};

/** Checks name, pool, and source conflicts before any official login starts. */
export async function prepareProfileRegistration(
  directory: string,
  host: Host,
  poolName: string | undefined,
  label: string,
  source: string,
  home = homedir(),
): Promise<ProfileRegistration> {
  const path = poolsPath(directory, host);
  const file = Bun.file(path);
  const expectedText = (await file.exists()) ? await file.text() : undefined;
  const before = validateHostPools(host, await readPools(path, home));
  const names = Object.keys(before);
  const selected =
    poolName ?? (names.length === 0 ? "default" : names.length === 1 ? names[0] : undefined);
  if (!selected) throw new PoolError("pool_selection_required");
  if (poolName && names.length && !Object.hasOwn(before, poolName))
    throw new PoolError("pool_unknown");
  const current = before[selected] ?? { home: DEFAULT_HOME[host], accounts: [] };
  if (current.accounts.includes(label)) throw new PoolError("account_label_taken");
  const target = resolve(home, source);
  for (const pool of Object.values(before))
    for (const account of pool.accounts)
      if (resolve(home, pool.from?.[account] ?? account) === target)
        throw new PoolError("account_source_exists");
  const nextPool = {
    ...current,
    accounts: [...current.accounts, label],
    ...(host === "agy" ? {} : { from: { ...(current.from ?? {}), [label]: source } }),
  };
  const next = validateHostPools(host, { ...before, [selected]: nextPool });
  return { path, expectedText, pool: selected, label, source, next };
}

/** Writes the prepared registration only when the file is unchanged since preflight. */
export async function commitProfileRegistration(
  directory: string,
  registration: ProfileRegistration,
): Promise<void> {
  const { path, expectedText, next } = registration;
  const file = Bun.file(path);
  const currentText = (await file.exists()) ? await file.text() : undefined;
  if (currentText !== expectedText) throw new PoolError("config_changed");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const mode = expectedText === undefined ? 0o600 : (await stat(path)).mode & 0o777;
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", mode);
  let closed = false;
  try {
    await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`);
    await handle.close();
    closed = true;
    const recheck = (await file.exists()) ? await file.text() : undefined;
    if (recheck !== expectedText) throw new PoolError("config_changed");
    await rename(temporary, path);
  } catch (error) {
    const causes: unknown[] = [error];
    if (!closed) {
      try {
        await handle.close();
      } catch (cleanup) {
        causes.push(cleanup);
      }
    }
    try {
      await unlink(temporary);
    } catch (cleanup) {
      if (!(cleanup instanceof Error && "code" in cleanup && cleanup.code === "ENOENT"))
        causes.push(cleanup);
    }
    if (causes.length > 1)
      throw new PoolError("config_cleanup_failed", undefined, {
        cause: new AggregateError(causes),
      });
    throw error;
  }
}

export async function saveAgyConfiguration(
  directory: string,
  previous: Pools,
  next: Pools,
  capture: () => Promise<unknown>,
): Promise<void> {
  validateAgyPools(previous);
  validateAgyPools(next);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = poolsPath(directory, "agy");
  const checkCurrent = async () => {
    const current = await readPools(path);
    validateAgyPools(current);
    if (JSON.stringify(current) !== JSON.stringify(previous)) throw new PoolError("config_changed");
  };
  await checkCurrent();
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  const failures: unknown[] = [];
  try {
    await file.writeFile(`${JSON.stringify(next, null, 2)}\n`);
    await file.close();
    await capture();
    await checkCurrent();
    await rename(temporary, path);
  } catch (error) {
    failures.push(error);
  }
  try {
    await file.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    await unlink(temporary);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new PoolError("config_cleanup_failed", undefined, {
      cause: new AggregateError(failures, "config_operation_and_cleanup_failed"),
    });
}
