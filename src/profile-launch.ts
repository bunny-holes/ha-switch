import { resolve } from "node:path";
import { accountAt } from "./account-table.ts";
import type { Host } from "./config.ts";
import { PoolError } from "./errors.ts";
import { profileDirectory } from "./pool.ts";
import type { Pool } from "./types.ts";

function sourceDirectory(host: Host, pool: Pool, label: string, home: string): string | undefined {
  if (host === "agy") return undefined;
  if (host === "claude" && !pool.from?.[label] && !label.startsWith(".claude")) return undefined;
  return resolve(home, profileDirectory(pool, label, home));
}

export function configuredProfile(
  host: "codex" | "claude",
  pool: Pool,
  selector: string,
  home: string,
): string {
  const label = /^\d+$/.test(selector) ? accountAt(pool, selector) : selector;
  if (!pool.accounts.includes(label)) throw new PoolError("account_not_in_pool");
  const directory = sourceDirectory(host, pool, label, home);
  if (!directory) throw new PoolError("account_source_missing");
  return directory;
}

export function profileList(host: Host, pool: Pool, home: string): string {
  const title = host === "agy" ? "Antigravity" : host === "codex" ? "Codex" : "Claude";
  return [
    `${title} / ${pool.name}`,
    "#  profile  source path",
    ...pool.accounts.map(
      (label, index) =>
        `${index + 1}  ${label}  ${sourceDirectory(host, pool, label, home) ?? "(no source profile)"}`,
    ),
  ].join("\n");
}
