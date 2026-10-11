import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export async function nativeRegression(executable: string) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "ha-switch-native-smoke-")));
  try {
    const configuration = join(home, ".config", "ha-switch");
    const labels = [".codex", ".codex-pkl1", ".codex-pkl2"];
    await Bun.write(
      join(configuration, "codex-pools.json"),
      JSON.stringify({ pkls: { home: ".codex", accounts: labels } }),
    );
    const auth = (number: number) =>
      JSON.stringify({ tokens: { account_id: `synthetic-${number}` }, last_refresh: "2026-01-01" });
    for (const [index, profile] of labels.entries()) {
      await mkdir(join(home, profile), { recursive: true });
      await Bun.write(join(home, profile, "auth.json"), auth(index + 1));
      await Bun.write(join(home, profile, "config.toml"), "# synthetic settings\n");
    }
    const usageFile = join(home, "synthetic-usage.json");
    const setUsage = (five: number[], weekly: number[]) =>
      Bun.write(
        usageFile,
        JSON.stringify(
          five.map((value, index) => ({
            primary: { usedPercent: 100 - value, windowDurationMins: 300 },
            secondary: { usedPercent: 100 - weekly[index], windowDurationMins: 10080 },
          })),
        ),
      );
    await setUsage([80, 15, 30], [80, 80, 80]);
    const mock = join(home, "bin", "codex");
    await Bun.write(
      mock,
      `#!${process.execPath}\nimport { createInterface } from "node:readline";
if (process.argv[2] !== "app-server") {
  console.log(process.env.CODEX_HOME === undefined ? "CODEX_HOME unset" : "CODEX_HOME set");
  process.exit(7);
}
const auth = await Bun.file(process.env.CODEX_HOME + "/auth.json").json();
const number = Number(auth.tokens.account_id.replace("synthetic-", ""));
const limits = (await Bun.file(process.env.HOME + "/synthetic-usage.json").json())[number - 1];
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === "initialize") console.log(JSON.stringify({ id: message.id, result: {} }));
  else if (message.method === "account/rateLimits/read") console.log(JSON.stringify({ id: message.id, result: { rateLimits: limits, rateLimitResetCredits: { availableCount: 0 } } }));
}
`,
    );
    await chmod(mock, 0o755);
    const run = async (args: string[]) => {
      const child = Bun.spawn([process.execPath, resolve(executable), ...args], {
        cwd: home,
        env: {
          ...process.env,
          HOME: home,
          HA_SWITCH_CONFIG_DIR: configuration,
          CODEX_HOME: join(home, ".inherited-home"),
          PATH: `${join(home, "bin")}:${process.env.PATH}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return {
        output: output.replaceAll(home, "<home>"),
        error: error.replaceAll(home, "<home>"),
        code,
      };
    };
    const login = () => Bun.file(join(home, ".codex", "auth.json")).text();
    const switched = await run(["switch", "codex", "2"]);
    assert.equal(switched.code, 0);
    assert.equal(switched.error, "");
    assert.equal(await login(), auth(2));
    assert.equal(
      await Bun.file(join(configuration, "codex-accounts", "native", "auth.json")).text(),
      auth(1),
    );
    const explicit = await run(["x", "--account", "3"]);
    assert.deepEqual(explicit, { output: "CODEX_HOME unset\n", error: "", code: 7 });
    assert.equal(await login(), auth(3));
    const automatic = await run(["x"]);
    assert.deepEqual(automatic, explicit);
    assert.equal(await login(), auth(3));
    await setUsage([80, 9, 9], [21, 80, 80]);
    const fallback = await run(["x"]);
    assert.deepEqual(fallback, explicit);
    assert.equal(await login(), auth(1));
    await setUsage([80, 9, 9], [20, 80, 80]);
    const before = await Promise.all(
      labels.map((label) => Bun.file(join(home, label, "auth.json")).text()),
    );
    const refused = await run(["x"]);
    assert.equal(refused.code, 1);
    assert.equal(refused.output, "");
    assert.match(refused.error, /no_available_account.*사용 가능한 계정 없음/);
    assert.deepEqual(
      await Promise.all(labels.map((label) => Bun.file(join(home, label, "auth.json")).text())),
      before,
    );
    assert.equal(await Bun.file(join(home, labels[1], "auth.json")).text(), auth(2));
    assert.equal(await Bun.file(join(home, labels[2], "auth.json")).text(), auth(3));
    assert.equal(
      await Bun.file(join(configuration, "codex-accounts", "native", "auth.json")).text(),
      auth(1),
    );
    for (const label of labels)
      assert.equal(
        await Bun.file(join(home, label, "config.toml")).text(),
        "# synthetic settings\n",
      );
    return { switched, explicit, automatic, fallback, refused };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const executables = process.argv.slice(2);
  assert.ok(executables.length > 0, "executable paths required");
  const baseline = await nativeRegression(executables[0]);
  for (const executable of executables.slice(1))
    assert.deepEqual(await nativeRegression(executable), baseline);
  console.log(
    `[ha-switch:native-regression:success] executables=${executables.length} native switch/launch/selection/refusal verified`,
  );
}
