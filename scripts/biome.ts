// Runs the Biome pinned in package.json, by name and never by a path inside node_modules.
// `bun x --no-install biome` takes the copy installed above `cwd` first, but when that copy is
// missing it silently runs any `biome` on PATH. So the version answered by the command that is
// about to run is compared with the pin first, and a missing or different Biome stops the run.
import { join } from "node:path";

export const biomeCommand = ["x", "--no-install", "biome"] as const;

/**
 * A Windows command line stops at 32,767 characters (CreateProcess), and at 8,191 when a shim
 * goes through cmd.exe. File lists are split so that no single call comes near either.
 */
const commandLineBudget = 6000;

/** The exact Biome version package.json pins. A range would let the lockfile drift silently. */
export async function pinnedBiomeVersion(root: string): Promise<string> {
  const manifest = (await Bun.file(join(root, "package.json")).json()) as {
    devDependencies?: Record<string, string>;
  };
  const pinned = manifest.devDependencies?.["@biomejs/biome"];
  if (!pinned || !/^\d+\.\d+\.\d+$/.test(pinned))
    throw new Error(`biome_pin_invalid: package.json must pin @biomejs/biome exactly (${pinned})`);
  return pinned;
}

/** Refuses to go on unless `bun x --no-install biome` in `cwd` answers the pinned version. */
export async function requirePinnedBiome(
  cwd: string,
  pinned: string,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const child = Bun.spawn([process.execPath, ...biomeCommand, "--version"], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  if (code !== 0)
    throw new Error(
      `biome_missing: no Biome answers in ${cwd} (exit ${code}) — run bun install at the repository root`,
    );
  const found = /Version:\s*(\S+)/.exec(output)?.[1];
  if (found !== pinned)
    throw new Error(
      `biome_version_mismatch: expected Biome ${pinned}, the command in ${cwd} answers ${found ?? "no version"}`,
    );
}

/**
 * Runs Biome over `files` in as many calls as the command-line budget needs. Every call gets the
 * same leading arguments. A batch may hold only files Biome does not handle (markdown, shell scripts),
 * and Biome fails such a call with "No files were processed", so `--no-errors-on-unmatched` goes
 * with every call. Returns the first non-zero exit code, or 0.
 */
export async function runBiome(
  cwd: string,
  args: readonly string[],
  files: readonly string[],
): Promise<number> {
  const leading = [...args, "--no-errors-on-unmatched"];
  const fixed = [process.execPath, ...biomeCommand, ...leading].join(" ").length;
  const batches: string[][] = [[]];
  let length = fixed;
  for (const file of files) {
    const batch = batches[batches.length - 1];
    if (batch.length && length + file.length + 1 > commandLineBudget) {
      batches.push([file]);
      length = fixed + file.length + 1;
    } else {
      batch.push(file);
      length += file.length + 1;
    }
  }
  let failed = 0;
  for (const batch of batches.filter((batch) => batch.length)) {
    const child = Bun.spawn([process.execPath, ...biomeCommand, ...leading, ...batch], {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    if (code !== 0 && failed === 0) failed = code;
  }
  return failed;
}
