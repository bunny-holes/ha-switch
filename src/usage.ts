import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
import { errorCode, PoolError } from "./errors.ts";
import { logger } from "./log.ts";
import type { AccountUsage, RateLimits } from "./types.ts";

const log = logger("usage");
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
export function resetCount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new PoolError("reset_count_invalid");
  return value;
}
export function claudeResetCount(body: unknown): number | null {
  const status = record(record(body)?.cedar_ember);
  if (typeof status?.eligible !== "boolean" || !Array.isArray(status.grants)) return null;
  let total = 0;
  for (const grant of status.grants) {
    const count = resetCount(record(grant)?.resets_left);
    if (count === null) throw new PoolError("reset_count_invalid");
    total += count;
  }
  return resetCount(total);
}
export interface AppServerChild {
  stdin: { write(value: string): unknown };
  stdout: ReadableStream<Uint8Array>;
  kill(signal?: NodeJS.Signals): unknown;
  exited: Promise<number>;
}
export type SpawnAppServer = (
  command: string[],
  options: { env: NodeJS.ProcessEnv; cwd: string; stdin: "pipe"; stdout: "pipe"; stderr: "ignore" },
) => AppServerChild;
export interface UsageOptions {
  home?: string;
  spawn?: SpawnAppServer;
  timeoutMs?: number;
}

async function within<T>(operation: Promise<T>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function codexAccountUsage(
  directory: string,
  {
    home = homedir(),
    spawn = (command, options) => Bun.spawn(command, options),
    timeoutMs = 15_000,
  }: UsageOptions = {},
): Promise<AccountUsage> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new PoolError("query_timeout_invalid");
  log("query_start");
  let child: AppServerChild;
  try {
    child = spawn(["codex", "app-server"], {
      env: { ...process.env, CODEX_HOME: resolve(home, directory) },
      cwd: tmpdir(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
  } catch (cause) {
    log("query_failure", { code: "codex_app_server_start_failed" }, "error");
    throw new PoolError("codex_app_server_start_failed", undefined, { cause });
  }
  const reader = child.stdout.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PoolError("codex_reset_query_timeout")), timeoutMs);
  });
  const send = (message: Record<string, unknown>) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  let queryFailed = false;
  let queryError: unknown;
  const query = async (): Promise<AccountUsage> => {
    send({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "ha-switch", version: "1" } },
    });
    const decoder = new TextDecoder();
    let buffer = "";
    let initialized = false;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) throw new PoolError("codex_app_server_closed");
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_048_576) throw new PoolError("codex_response_too_large");
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.trim()) continue;
        let message: Record<string, unknown> | undefined;
        try {
          message = record(JSON.parse(line));
        } catch (cause) {
          throw new PoolError("codex_response_invalid", undefined, { cause });
        }
        if (message?.id === 1 && !initialized) {
          if (message.error) throw new PoolError("codex_initialize_failed");
          initialized = true;
          send({ method: "initialized" });
          send({ id: 2, method: "account/rateLimits/read" });
        } else if (message?.id === 2 && initialized) {
          if (message.error) throw new PoolError("codex_reset_query_failed");
          const result = record(message.result);
          if (!result) throw new PoolError("codex_response_invalid");
          const limits = record(result.rateLimitsByLimitId)?.codex ?? result.rateLimits ?? null;
          if (limits !== null && !record(limits)) throw new PoolError("codex_response_invalid");
          const usage = {
            resetCredits: resetCount(record(result.rateLimitResetCredits)?.availableCount),
            rateLimits: limits as RateLimits | null,
          };
          log("query_success");
          return usage;
        }
      }
    }
  };
  let usage: AccountUsage | undefined;
  try {
    usage = await query();
  } catch (error) {
    queryFailed = true;
    queryError = error;
    log("query_failure", { code: errorCode(error, "codex_query_failed") }, "error");
  }
  clearTimeout(timer);
  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    child.kill("SIGTERM");
    if (!(await within(child.exited, 250))) {
      child.kill("SIGKILL");
      if (!(await within(child.exited, 1000))) throw new PoolError("codex_cleanup_timeout");
    }
    if (!(await within(reader.cancel(), 1000))) throw new PoolError("codex_cleanup_timeout");
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  } finally {
    reader.releaseLock();
  }
  if (cleanupFailed)
    throw new PoolError("codex_cleanup_failed", undefined, {
      cause: queryFailed
        ? new AggregateError([queryError, cleanupError], "codex_query_and_cleanup_failed")
        : cleanupError,
    });
  if (queryFailed) throw queryError;
  if (!usage) throw new PoolError("codex_response_invalid");
  return usage;
}
export async function codexResetCredits(
  directory: string,
  options?: UsageOptions,
): Promise<number | null> {
  return (await codexAccountUsage(directory, options)).resetCredits;
}
