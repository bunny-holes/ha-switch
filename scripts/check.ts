import { join, resolve } from "node:path";
import { pinnedBiomeVersion, requirePinnedBiome, runBiome } from "./biome.ts";
import { repositoryFiles } from "./repository-files.ts";

const root = resolve(import.meta.dir, "..");

async function checked(args: string[], env = process.env): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await child.exited) !== 0) throw new Error("check_failed");
}

async function main(): Promise<void> {
  const manifest = await Bun.file(join(root, "package.json")).json();
  if (manifest.packageManager !== `bun@${Bun.version}`) throw new Error("bun_version_mismatch");
  await requirePinnedBiome(root, await pinnedBiomeVersion(root));
  const files = await repositoryFiles(root);
  if ((await runBiome(root, ["ci"], files)) !== 0) throw new Error("code_style_failed");
  const pin = manifest.devDependencies?.typescript;
  if (typeof pin !== "string" || !/^\d+\.\d+\.\d+$/.test(pin))
    throw new Error("typescript_pin_invalid");
  const version = Bun.spawn([process.execPath, "x", "--no-install", "tsc", "--version"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = (await new Response(version.stdout).text()).trim();
  if ((await version.exited) !== 0) throw new Error("typescript_missing");
  if (output !== `Version ${pin}`) throw new Error("typescript_version_mismatch");
  await checked(["x", "--no-install", "tsc", "--noEmit"]);
  await checked(["test"], { ...process.env, BIOME_STAGE: root });
  for (const file of files.filter((file) => /\.(?:ts|json|md|lock)$/.test(file))) {
    if ((await Bun.file(join(root, file)).bytes()).includes(0))
      throw new Error("source_control_byte");
  }
  console.error(`[ha-switch:check:success] files=${files.length}`);
}

try {
  await main();
} catch (error) {
  console.error(
    `[ha-switch:check:failure] ${error instanceof Error ? error.message : "check_failed"}`,
  );
  process.exitCode = 1;
}
