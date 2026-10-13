import { resolve } from "node:path";
import type { Host } from "./config.ts";
import { PoolError } from "./errors.ts";
import { profileDirectory } from "./pool.ts";
import type { Pool } from "./types.ts";

/** Absolute source folder of a saved profile, or undefined when it only exists in the keychain. */
export function sourceDirectory(
  host: Host,
  pool: Pool,
  label: string,
  home: string,
): string | undefined {
  if (host === "agy") return undefined;
  if (host === "claude" && !pool.from?.[label] && !label.startsWith(".claude")) return undefined;
  return resolve(home, profileDirectory(pool, label, home));
}

export function configuredProfile(
  host: "codex" | "claude",
  pool: Pool,
  label: string,
  home: string,
): string {
  if (!pool.accounts.includes(label)) throw new PoolError("account_not_in_pool");
  const directory = sourceDirectory(host, pool, label, home);
  if (!directory) throw new PoolError("account_source_missing");
  return directory;
}
