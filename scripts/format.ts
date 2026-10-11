// Formats, organizes imports, and applies safe lint fixes with the pinned Biome. Run
// `bun install` at the repository root once so the pinned version is the one that runs.
import { resolve } from "node:path";
import { pinnedBiomeVersion, requirePinnedBiome, runBiome } from "./biome.ts";
import { repositoryFiles } from "./repository-files.ts";

const root = resolve(import.meta.dir, "..");
await requirePinnedBiome(root, await pinnedBiomeVersion(root));
const files = await repositoryFiles(root);
process.exitCode = await runBiome(root, ["check", "--write"], files);
