import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { buildRelease } from "../scripts/release.ts";

test("standalone skill release preserves instructions and native metadata and verifies its assets", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ha-switch-release-test-"));
  try {
    const assets = await buildRelease(join(temporary, "release"));
    const sums = (await Bun.file(assets[2]).text()).trim().split("\n");
    for (const [index, asset] of assets.slice(0, 2).entries()) {
      const hash = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(asset).bytes())
        .digest("hex");
      expect(sums[index]).toBe(`${hash}  ${basename(asset)}`);
    }
    const extract = Bun.spawn(["tar", "-xzf", assets[1], "-C", temporary], {
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await extract.exited).toBe(0);
    expect((await readdir(join(temporary, "has"))).sort()).toEqual([
      "LICENSE",
      "SKILL.md",
      "agents",
    ]);
    expect(await readdir(join(temporary, "has/agents"))).toEqual(["openai.yaml"]);
    const source = await Bun.file(join(import.meta.dir, "../skills/has/SKILL.md")).text();
    const metadata = await Bun.file(join(import.meta.dir, "../skills/has/skill.json")).json();
    const emitted = await Bun.file(join(temporary, "has/SKILL.md")).text();
    const split = (text: string) => {
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
      if (!front) throw new Error("missing front matter");
      return {
        fields: Bun.YAML.parse(front[1]) as Record<string, unknown>,
        body: text.slice(front[0].length),
      };
    };
    const after = split(emitted);
    expect(after.body).toBe(source);
    expect(after.fields).toEqual(metadata);
    expect(after.fields.name).toBe("has");
    expect(await Bun.file(join(temporary, "has/LICENSE")).text()).toBe(
      await Bun.file(join(import.meta.dir, "../LICENSE")).text(),
    );
    expect(await Bun.file(join(temporary, "has/agents/openai.yaml")).text()).toBe(
      await Bun.file(join(import.meta.dir, "../skills/has/agents/openai.yaml")).text(),
    );
    await expect(buildRelease(join(temporary, "release"))).rejects.toThrow("release_asset_exists");
    expect(await Bun.file(assets[2]).text()).toBe(`${sums.join("\n")}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);
