// The Biome guard must not let `bun x --no-install biome` fall back to another Biome on PATH.
// Each case runs in an empty folder with no node_modules, so only PATH can answer.
import { afterAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinnedBiomeVersion, requirePinnedBiome, runBiome } from "./biome.ts";

const repositoryRoot = join(import.meta.dir, "..");
const pinned = await pinnedBiomeVersion(repositoryRoot);
const folder = await mkdtemp(join(tmpdir(), "biome-guard-"));
const empty = join(folder, "empty");
const fake = join(folder, "fake");
await Bun.write(join(empty, ".keep"), "");
if (process.platform === "win32") {
  await Bun.write(join(fake, "biome.cmd"), "@echo Version: 0.0.0\r\n");
} else {
  await Bun.write(join(fake, "biome"), "#!/bin/sh\necho 'Version: 0.0.0'\n");
  await chmod(join(fake, "biome"), 0o755);
}

/**
 * An environment whose search path is only `folder`. Windows names the variable `Path`, and an
 * extra `PATH` beside it would leave two search paths for the child, so the existing key is reused.
 */
function onlyPath(folder: string): Record<string, string | undefined> {
  const env = { ...process.env };
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  for (const name of Object.keys(env)) if (name.toUpperCase() === "PATH") delete env[name];
  env[key] = folder;
  return env;
}

afterAll(async () => {
  // mkdtemp made this folder, so only it is removed.
  await rm(folder, { recursive: true, force: true });
});

test("a Biome on PATH that answers another version is refused", async () => {
  const env = onlyPath(fake);
  await expect(requirePinnedBiome(empty, pinned, env)).rejects.toThrow(/^biome_version_mismatch:/);
});

test("no Biome at all is refused", async () => {
  const env = onlyPath(empty);
  await expect(requirePinnedBiome(empty, pinned, env)).rejects.toThrow(/^biome_missing:/);
});

// The gate passes the stage where it installed the pinned Biome in BIOME_STAGE.
const stage = process.env.BIOME_STAGE;

test.skipIf(!stage)("a batch of only files Biome does not handle passes", async () => {
  const files = [join(folder, "notes.md"), join(folder, "run.sh")];
  for (const file of files) await Bun.write(file, "text\n");
  const code = await runBiome(
    stage ?? "",
    // The fixture is outside this Git root; this case only tests unknown file handling.
    ["ci", "--reporter=summary", "--vcs-enabled=false", `--config-path=${repositoryRoot}`],
    files,
  );
  expect(code).toBe(0);
});
