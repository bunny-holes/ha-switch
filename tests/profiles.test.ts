import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localProfiles, profileEnvironment } from "../src/profiles.ts";

test("profile discovery uses directory metadata without opening credentials", async () => {
  const home = await mkdtemp(join(tmpdir(), "ha-switch-test-"));
  try {
    await mkdir(join(home, ".codex-account-a"));
    await mkdir(join(home, ".claude-account-b"));
    await Bun.write(join(home, ".codex-account-a", "auth.json"), "synthetic-non-json");
    await Bun.write(join(home, ".claude-not-a-directory"), "synthetic-file");
    const file = spyOn(Bun, "file");
    try {
      expect(await localProfiles(home)).toEqual([
        { host: "claude", directory: ".claude" },
        { host: "codex", directory: ".codex" },
        { host: "claude", directory: ".claude-account-b" },
        { host: "codex", directory: ".codex-account-a" },
      ]);
      expect(file).not.toHaveBeenCalled();
    } finally {
      file.mockRestore();
    }
  } finally {
    await rm(home, { recursive: true });
  }
});

test("default Claude path stays unset even when configured as absolute", () => {
  const home = join(tmpdir(), "ha-switch-synthetic-home");
  const base = { CLAUDE_CONFIG_DIR: "other", CODEX_HOME: "other", PRESERVED: "value" };
  expect(
    profileEnvironment({ host: "claude", directory: join(home, ".claude") }, home, base),
  ).toEqual({ CODEX_HOME: "other", PRESERVED: "value" });
  expect(
    profileEnvironment({ host: "claude", directory: "custom" }, home, base).CLAUDE_CONFIG_DIR,
  ).toBe(join(home, "custom"));
  expect(profileEnvironment({ host: "codex", directory: "custom" }, home, base).CODEX_HOME).toBe(
    join(home, "custom"),
  );
  expect(base.CLAUDE_CONFIG_DIR).toBe("other");
});
