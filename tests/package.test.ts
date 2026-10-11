import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pack } from "../scripts/build.ts";

test("packed executable works in an empty project without source files or state access", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "ha-switch-package-"));
  try {
    const tarball = await pack(join(temporary, "ha-switch.tgz"));
    const tar = Bun.spawn(["tar", "-tf", tarball], { stdout: "pipe", stderr: "pipe" });
    const files = (await new Response(tar.stdout).text()).trim().split("\n").sort();
    expect(await tar.exited).toBe(0);
    expect(files).toEqual([
      "package/LICENSE",
      "package/README.ko.md",
      "package/README.md",
      "package/dist/ha-switch.js",
      "package/package.json",
    ]);
    await Bun.write(join(temporary, "package.json"), '{"private":true}\n');
    const install = Bun.spawn([process.execPath, "add", "--ignore-scripts", tarball], {
      cwd: temporary,
      stdout: "pipe",
      stderr: "pipe",
    });
    const errors = await new Response(install.stderr).text();
    expect(await install.exited, errors).toBe(0);
    const manifest = JSON.parse(
      await readFile(join(temporary, "node_modules/@bunny-holes/ha-switch/package.json"), "utf8"),
    );
    expect(manifest.name).toBe("@bunny-holes/ha-switch");
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    const executable = await readFile(
      join(temporary, "node_modules/@bunny-holes/ha-switch/dist/ha-switch.js"),
      "utf8",
    );
    expect(executable).toStartWith("#!/usr/bin/env bun");
    expect(executable).not.toMatch(/\/Users\/|IdeaProjects|sourceMappingURL/);
    for (const argument of ["--help", "--version"]) {
      const child = Bun.spawn([process.execPath, "x", "--no-install", "ha-switch", argument], {
        cwd: temporary,
        env: { ...process.env, HA_SWITCH_CONFIG_DIR: join(temporary, "missing-config") },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code, error).toBe(0);
      if (argument === "--help") {
        expect(output).toContain("list");
        expect(output).toContain("switch");
      } else expect(output.trim()).toBe(manifest.version);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);
