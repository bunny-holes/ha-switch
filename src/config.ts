import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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

export async function appendProfile(
  directory: string,
  host: Host,
  poolName: string,
  label: string,
  source: string,
  home = homedir(),
): Promise<void> {
  const path = poolsPath(directory, host);
  const before = await readPools(path, home);
  const current = before[poolName] ?? {
    home: host === "codex" ? ".codex-ha-switch" : host === "claude" ? ".claude" : ".gemini",
    accounts: [],
  };
  if (current.accounts.includes(label)) throw new PoolError("account_label_taken");
  const nextPool = {
    ...current,
    accounts: [...current.accounts, label],
    ...(host === "agy"
      ? {}
      : { from: { ...(current.from ?? {}), [label]: source } }),
  };
  const next = validateHostPools(host, { ...before, [poolName]: nextPool });
  const expected = (await Bun.file(path).exists()) ? await Bun.file(path).text() : undefined;
  if (expected !== undefined && (await Bun.file(path).text()) !== expected)
    throw new PoolError("config_changed");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const mode = expected === undefined ? 0o600 : (await stat(path)).mode & 0o777;
  try {
    await Bun.write(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode });
    await rename(temporary, path);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch (cleanup) {
      if (!(cleanup instanceof Error && "code" in cleanup && cleanup.code === "ENOENT"))
        throw new PoolError("config_cleanup_failed", undefined, {
          cause: new AggregateError([error, cleanup]),
        });
    }
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
