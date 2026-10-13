import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  commitProfileRegistration,
  defaultConfigDir,
  type Host,
  prepareProfileRegistration,
} from "./config.ts";
import { errorCode, PoolError } from "./errors.ts";
import { logger } from "./log.ts";
import { readAuth } from "./pool.ts";

const log = logger("add");

export interface LoginRunOptions {
  /** Capture stdout in memory instead of inheriting the terminal. */
  capture?: boolean;
}

export interface LoginResult {
  code: number;
  stdout?: string;
}

export type LoginRunner = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  options?: LoginRunOptions,
) => Promise<LoginResult>;

export const nativeLogin: LoginRunner = async (command, args, env, options = {}) => {
  const child = Bun.spawn([command, ...args], {
    env,
    stdin: options.capture ? "ignore" : "inherit",
    stdout: options.capture ? "pipe" : "inherit",
    stderr: options.capture ? "ignore" : "inherit",
  });
  const stdout = options.capture ? await new Response(child.stdout).text() : undefined;
  const code = await child.exited;
  return options.capture ? { code, stdout } : { code };
};

export function validLabel(label: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(label) && label !== "." && label !== "..";
}

export function profileSourcePath(directory: string, host: Host, label: string): string {
  return join(resolve(directory), "profiles", host, label);
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Reads `claude auth status --json` in memory and keeps only the three checked fields. */
export function claudeStatusVerified(text: string | undefined, source: string): boolean {
  if (!text) return false;
  let status: Record<string, unknown> | undefined;
  try {
    status = record(JSON.parse(text));
  } catch {
    return false;
  }
  return (
    status?.loggedIn === true &&
    status.authMethod === "claude.ai" &&
    typeof status.configDirectory === "string" &&
    resolve(status.configDirectory) === resolve(source)
  );
}

export interface AddOptions {
  directory?: string;
  home?: string;
  pool?: string;
  run?: LoginRunner;
  env?: NodeJS.ProcessEnv;
  /** Called once right before the official login starts. */
  announce?: () => void;
}

export async function addProfile(
  host: "codex" | "claude",
  label: string,
  options: AddOptions = {},
): Promise<{ pool: string; source: string }> {
  if (!validLabel(label)) throw new PoolError("account_label_invalid");
  const directory = options.directory ?? defaultConfigDir();
  const home = options.home ?? homedir();
  const source = profileSourcePath(directory, host, label);
  const registration = await prepareProfileRegistration(
    directory,
    host,
    options.pool,
    label,
    source,
    home,
  );
  try {
    if ((await readdir(source)).length) throw new PoolError("account_source_exists");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await mkdir(source, { recursive: true, mode: 0o700 });
  const env = {
    ...(options.env ?? process.env),
    ...(host === "codex" ? { CODEX_HOME: source } : { CLAUDE_CONFIG_DIR: source }),
  };
  const run = options.run ?? nativeLogin;
  const args = host === "codex" ? ["login"] : ["auth", "login"];
  log("login_start", { host });
  options.announce?.();
  const login = await run(host, args, env);
  if (login.code === 130) throw new PoolError("cancelled");
  if (login.code !== 0) {
    log("login_failure", { host, code: login.code }, "warn");
    throw new PoolError("add_login_failed");
  }
  if (host === "codex") {
    let signedIn = false;
    try {
      signedIn = Boolean((await readAuth(source, home))?.account);
    } catch (error) {
      throw new PoolError("add_login_unverified", undefined, { cause: error });
    }
    if (!signedIn) throw new PoolError("add_login_unverified");
  } else {
    const status = await run(host, ["auth", "status", "--json"], env, { capture: true });
    if (status.code !== 0 || !claudeStatusVerified(status.stdout, source))
      throw new PoolError("add_login_unverified");
  }
  log("login_success", { host });
  try {
    await commitProfileRegistration(directory, registration);
  } catch (error) {
    throw new PoolError(errorCode(error, "add_config_failed"), undefined, { cause: error });
  }
  return { pool: registration.pool, source };
}
