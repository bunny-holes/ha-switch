import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export async function legacyRegression(executable: string) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "ha-switch-legacy-test-")));
  try {
    const configuration = join(home, ".config", "ha-switch");
    const target = join(home, ".codex-team");
    await Bun.write(
      join(configuration, "codex-pools.json"),
      JSON.stringify({
        team: {
          home: ".codex-team",
          accounts: [".codex", ".codex-account-a", ".codex-account-b"],
          args: ["--yolo", "-c", "web_search=live", "-c", "model_reasoning_effort=medium"],
        },
      }),
    );
    for (const [profile, account] of [
      [".codex", "synthetic-native"],
      [".codex-account-a", "synthetic-a"],
      [".codex-account-b", "synthetic-b"],
      [".codex-team", "synthetic-a"],
    ]) {
      await mkdir(join(home, profile), { recursive: true });
      await Bun.write(
        join(home, profile, "auth.json"),
        JSON.stringify({ tokens: { account_id: account }, last_refresh: "2026-01-01" }),
      );
    }
    const mock = join(home, "bin", "codex");
    await Bun.write(mock, '#!/bin/sh\nprintf "%s\\n" "$CODEX_HOME"\nprintf "%s\\n" "$@"\nexit 7\n');
    await chmod(mock, 0o755);
    const environment = {
      ...process.env,
      HOME: home,
      HA_SWITCH_CONFIG_DIR: configuration,
      CODEX_HOME: join(home, ".inherited-home"),
      PATH: `${join(home, "bin")}:${process.env.PATH}`,
    };
    const run = async (args: string[]) => {
      const child = Bun.spawn([process.execPath, resolve(executable), ...args], {
        cwd: home,
        env: environment,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      assert.equal(error, "");
      return { output: output.replaceAll(home, "<home>"), code };
    };
    const listing = await run(["-h", "x", "--pool", "team", "--local"]);
    assert.equal(listing.code, 0);
    assert.match(listing.output, /2\s+\.codex-account-a\s+<home>\/\.codex-account-a/);
    const switched = await run(["-h", "x", "--pool", "team", "-s", "3"]);
    assert.equal(switched.code, 0);
    assert.equal(
      (await Bun.file(join(target, "auth.json")).json()).tokens.account_id,
      "synthetic-b",
    );
    assert.equal(
      (await Bun.file(join(home, ".codex", "auth.json")).json()).tokens.account_id,
      "synthetic-native",
    );
    const selectedListing = await run(["-h", "x", "--pool", "team", "--local"]);
    assert.match(selectedListing.output, /3\s+\.codex-account-b\s+<home>\/\.codex-account-b/);
    const launched = await run([
      "run",
      "codex",
      ".codex-account-b",
      "--pool",
      "team",
      "--",
      "resume",
      "synthetic-session",
    ]);
    assert.equal(launched.code, 7);
    assert.equal(
      launched.output,
      "<home>/.codex-account-b\n--yolo\n-c\nweb_search=live\n-c\nmodel_reasoning_effort=medium\nresume\nsynthetic-session\n",
    );
    return { listing, switched, selectedListing, launched };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const executables = process.argv.slice(2);
  assert.ok(executables.length > 0, "executable paths required");
  const baseline = await legacyRegression(executables[0]);
  for (const executable of executables.slice(1))
    assert.deepEqual(await legacyRegression(executable), baseline);
  console.log(
    `[ha-switch:legacy-regression:success] executables=${executables.length} configuration list/source launch/explicit switch verified`,
  );
}
