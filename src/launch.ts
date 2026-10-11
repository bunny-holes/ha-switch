import type { Host } from "./config.ts";
import { profileEnvironment } from "./profiles.ts";
import type { Pool } from "./types.ts";

const BYPASS = {
  codex: ["--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust"],
  claude: ["--dangerously-skip-permissions"],
} as const;

export function shortcutArguments(
  host: "codex" | "claude",
  poolArgs: readonly string[],
  forwarded: readonly string[],
  safe = false,
): string[] {
  const required: readonly string[] = BYPASS[host];
  const canonical = (argument: string) =>
    host === "codex" && argument === "--yolo" ? required[0] : argument;
  const seen = new Set<string>();
  const args: string[] = [];
  let optionsEnded = false;
  for (const argument of [...poolArgs, ...forwarded]) {
    const flag = canonical(argument);
    if (!optionsEnded && required.includes(flag)) {
      if (safe || seen.has(flag)) continue;
      seen.add(flag);
    }
    args.push(argument);
    if (argument === "--") optionsEnded = true;
  }
  return [...(safe ? [] : required.filter((flag) => !seen.has(flag))), ...args];
}

export async function launch(
  host: Host,
  pool: Pool,
  args: string[],
  home: string,
): Promise<number> {
  const child = Bun.spawn([host, ...(pool.args ?? []), ...args], {
    env:
      host === "agy"
        ? { ...process.env }
        : profileEnvironment({ host, directory: pool.home }, home),
    stdio: ["inherit", "inherit", "inherit"],
  });
  const ignoreInterrupt = () => {};
  process.on("SIGINT", ignoreInterrupt);
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", ignoreInterrupt);
  }
}
