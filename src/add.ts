import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { appendProfile, poolsPath, type Host, defaultConfigDir } from "./config.ts";
import { errorCode, PoolError } from "./errors.ts";
import { readAuth } from "./pool.ts";

export interface LoginRunner {
  (command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<number>;
}

export const nativeLogin: LoginRunner = async (command, args, env) => {
  const child = Bun.spawn([command, ...args], {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return child.exited;
};

function validLabel(label: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(label) && label !== "." && label !== "..";
}

function sourcePath(directory: string, host: Host, label: string): string {
  return join(resolve(directory), "profiles", host, label);
}

export async function addProfile(
  host: Host,
  label: string,
  options: {
    directory?: string;
    home?: string;
    pool?: string;
    run?: LoginRunner;
  } = {},
): Promise<{ pool: string; source: string }> {
  if (!validLabel(label)) throw new PoolError("account_label_invalid");
  const directory = options.directory ?? defaultConfigDir();
  const home = options.home ?? homedir();
  const pool = options.pool ?? "default";
  if (host === "agy") throw new PoolError("agy_add_requires_login");
  const source = sourcePath(directory, host, label);
  const run = options.run ?? nativeLogin;
  const path = resolve(home, source);
  await mkdir(path, { recursive: true, mode: 0o700 });
  const env = {
    ...process.env,
    ...(host === "codex" ? { CODEX_HOME: path } : host === "claude" ? { CLAUDE_CONFIG_DIR: path } : {}),
  };
  const command = host === "codex" ? "codex" : host === "claude" ? "claude" : "agy";
  const args = host === "codex" ? ["login"] : host === "claude" ? ["auth", "login"] : [];
  const status = await run(command, args, env);
  if (status !== 0) throw new PoolError("add_login_failed");
  if (host === "codex") {
    const auth = await readAuth(source, home);
    if (!auth?.account) throw new PoolError("account_not_signed_in");
  } else if (host === "claude") {
    const check = await run(command, ["auth", "status", "--json"], env);
    if (check !== 0) throw new PoolError("add_login_unverified");
  }
  try {
    await appendProfile(directory, host, pool, label, source, home);
  } catch (error) {
    throw new PoolError(errorCode(error, "add_config_failed"), undefined, { cause: error });
  }
  return { pool, source };
}

export function addConfigPath(directory: string, host: Host): string {
  return poolsPath(directory, host);
}
