import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pack } from "./build.ts";

const root = resolve(import.meta.dir, "..");
const documentKeys = ["uuid", "type", "audience", "goal", "tone", "manner"] as const;

// Repository documents keep six top-level keys. Portable skills carry those
// same values in the standard metadata map, preserving their source identity.
export function portableSkill(source: string): string {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!front) throw new Error("skill_front_matter_missing");
  const parsed = Bun.YAML.parse(front[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("skill_front_matter_invalid");
  const fields = { ...parsed } as Record<string, unknown>;
  if (fields.name !== "has" || typeof fields.description !== "string" || !fields.description.trim())
    throw new Error("skill_identity_invalid");
  const metadata: Record<string, string> = {};
  for (const key of documentKeys) {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim()) throw new Error("skill_document_key_missing");
    metadata[key] = value;
    delete fields[key];
  }
  const existing = fields.metadata;
  if (existing !== undefined) {
    if (!existing || typeof existing !== "object" || Array.isArray(existing))
      throw new Error("skill_metadata_invalid");
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value !== "string" || Object.hasOwn(metadata, key))
        throw new Error("skill_metadata_invalid");
      metadata[key] = value;
    }
  }
  fields.metadata = metadata;
  return `---\n${Bun.YAML.stringify(fields, null, 2).trimEnd()}\n---\n${source.slice(front[0].length)}`;
}

export async function buildRelease(destination: string): Promise<string[]> {
  const { version } = await Bun.file(join(root, "package.json")).json();
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("release_version_invalid");
  const directory = resolve(destination);
  const cli = join(directory, `ha-switch-${version}.tgz`);
  const skill = join(directory, `has-skill-${version}.tgz`);
  const sums = join(directory, "SHA256SUMS");
  for (const file of [cli, skill, sums])
    if (await Bun.file(file).exists()) throw new Error("release_asset_exists");
  await mkdir(directory, { recursive: true });
  await pack(cli);
  const stage = await mkdtemp(join(tmpdir(), "ha-switch-skill-"));
  try {
    await mkdir(join(stage, "has", "agents"), { recursive: true });
    await Bun.write(
      join(stage, "has", "SKILL.md"),
      portableSkill(await Bun.file(join(root, "skills/has/SKILL.md")).text()),
    );
    await cp(join(root, "skills/has/agents/openai.yaml"), join(stage, "has/agents/openai.yaml"));
    await cp(join(root, "LICENSE"), join(stage, "has/LICENSE"));
    const archive = Bun.spawn(["tar", "-czf", skill, "-C", stage, "has"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await archive.exited) !== 0) throw new Error("skill_archive_failed");
    const hashes = await Promise.all(
      [cli, skill].map(async (file) => {
        const hash = new Bun.CryptoHasher("sha256")
          .update(await Bun.file(file).bytes())
          .digest("hex");
        return `${hash}  ${basename(file)}`;
      }),
    );
    await Bun.write(sums, `${hashes.join("\n")}\n`);
    return [cli, skill, sums];
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) {
    console.error("Usage: bun scripts/release.ts <output-directory>");
    process.exitCode = 1;
  } else {
    try {
      for (const file of await buildRelease(destination)) console.log(file);
    } catch (error) {
      console.error(
        `[ha-switch:release:failure] ${error instanceof Error ? error.message : "release_failed"}`,
      );
      process.exitCode = 1;
    }
  }
}
