import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { version as manifestVersion } from "../package.json";
import { pack } from "../scripts/build.ts";
import { legacyRegression } from "./fixtures/legacy-regression.ts";
import { nativeRegression } from "./fixtures/native-regression.ts";

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
      "package/dist/has.js",
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
    expect(manifest.bin).toEqual({ has: "./dist/has.js" });
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    const executable = await readFile(
      join(temporary, "node_modules/@bunny-holes/ha-switch/dist/has.js"),
      "utf8",
    );
    expect(executable).toStartWith("#!/usr/bin/env bun");
    expect(executable).not.toMatch(/\/Users\/|IdeaProjects|sourceMappingURL/);
    if (process.platform === "darwin") {
      const installed = join(temporary, "node_modules/@bunny-holes/ha-switch/dist/has.js");
      await legacyRegression(installed);
      await nativeRegression(installed);
    }
    for (const args of [[], ["--help"], ["--version"]]) {
      const child = Bun.spawn(
        [
          process.execPath,
          "x",
          "--no-install",
          "--package",
          "@bunny-holes/ha-switch",
          "has",
          ...args,
        ],
        {
          cwd: temporary,
          env: { ...process.env, HA_SWITCH_CONFIG_DIR: join(temporary, "missing-config") },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code, error).toBe(0);
      if (args[0] === "--version") expect(output.trim()).toBe(manifest.version);
      else {
        expect(output).toContain("has --list");
        expect(output).toContain("has -h c -s 2");
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);

test("release URL installs a global has command in an isolated directory and lists only synthetic profiles", async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "ha-switch-global-test-")));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const tarball = await pack(join(temporary, "ha-switch.tgz"));
    const globalDirectory = join(temporary, "global");
    const binDirectory = join(temporary, "bin");
    const installEnvironment = {
      ...process.env,
      BUN_INSTALL_GLOBAL_DIR: globalDirectory,
      BUN_INSTALL_BIN: binDirectory,
      BUN_INSTALL_CACHE_DIR: join(temporary, "cache"),
    };
    await Bun.write(join(globalDirectory, "package.json"), '{"private":true}\n');
    const location = Bun.spawn([process.execPath, "pm", "bin", "--global"], {
      cwd: temporary,
      env: installEnvironment,
      stdout: "pipe",
      stderr: "pipe",
    });
    const directory = (await new Response(location.stdout).text()).trim();
    const locationError = await new Response(location.stderr).text();
    expect(await location.exited, locationError).toBe(0);
    expect(directory).toBe(binDirectory);
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(Bun.file(tarball)),
    });
    const install = Bun.spawn(
      [process.execPath, "add", "--global", "--ignore-scripts", `${server.url}ha-switch.tgz`],
      { cwd: temporary, env: installEnvironment, stdout: "pipe", stderr: "pipe" },
    );
    const errors = await new Response(install.stderr).text();
    expect(await install.exited, errors).toBe(0);
    const executable = join(binDirectory, "has");
    const environment = {
      ...installEnvironment,
      HA_SWITCH_CONFIG_DIR: join(temporary, "missing-config"),
    };
    for (const args of [[], ["--help"], ["--version"]]) {
      const child = Bun.spawn([executable, ...args], {
        cwd: temporary,
        env: environment,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code, error).toBe(0);
      expect(output).toContain(args[0] === "--version" ? manifestVersion : "has --list");
    }
    const configuration = join(temporary, "config");
    await Bun.write(
      join(configuration, "codex-pools.json"),
      JSON.stringify({
        default: {
          home: join(temporary, "target"),
          accounts: ["profile-one"],
          from: { "profile-one": join(temporary, "source") },
        },
      }),
    );
    const listing = Bun.spawn([executable, "--list", "--local", "--config-dir", configuration], {
      cwd: temporary,
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, error, code] = await Promise.all([
      new Response(listing.stdout).text(),
      new Response(listing.stderr).text(),
      listing.exited,
    ]);
    expect(code, error).toBe(0);
    expect(output).toContain("Codex / default");
    expect(output).toContain("profile-one");
    expect(await Bun.file(join(temporary, "target/auth.json")).exists()).toBe(false);
    expect(await Bun.file(join(temporary, "source/auth.json")).exists()).toBe(false);
  } finally {
    await server?.stop(true);
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);
