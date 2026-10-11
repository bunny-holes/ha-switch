import { expect, test } from "bun:test";
import { shortcutArguments } from "../src/launch.ts";

const approvals = "--dangerously-bypass-approvals-and-sandbox";
const hooks = "--dangerously-bypass-hook-trust";
const permissions = "--dangerously-skip-permissions";

test("Codex shortcut injects both flags and preserves configuration and resume arguments", () => {
  expect(
    shortcutArguments(
      "codex",
      ["-c", "web_search=live", "-c", "model_reasoning_effort=medium"],
      ["resume", "synthetic-session"],
    ),
  ).toEqual([
    approvals,
    hooks,
    "-c",
    "web_search=live",
    "-c",
    "model_reasoning_effort=medium",
    "resume",
    "synthetic-session",
  ]);
});

test("Codex shortcut treats --yolo as the approval flag and avoids duplicates from either source", () => {
  expect(shortcutArguments("codex", ["--yolo", hooks], [approvals, hooks, "resume"])).toEqual([
    "--yolo",
    hooks,
    "resume",
  ]);
  expect(shortcutArguments("codex", [hooks], ["--yolo"])).toEqual([hooks, "--yolo"]);
});

test("safe mode removes managed bypass flags while keeping native settings and argument order", () => {
  expect(
    shortcutArguments(
      "codex",
      ["--yolo", "-c", "model_reasoning_effort=medium", hooks],
      [approvals, "resume", "synthetic-session"],
      true,
    ),
  ).toEqual(["-c", "model_reasoning_effort=medium", "resume", "synthetic-session"]);
});

test("native end-of-options payload remains intact even when it looks like a bypass flag", () => {
  expect(shortcutArguments("codex", [], ["--", "--yolo", hooks])).toEqual([
    approvals,
    hooks,
    "--",
    "--yolo",
    hooks,
  ]);
  expect(shortcutArguments("codex", [approvals], ["--", "--yolo"], true)).toEqual(["--", "--yolo"]);
});

test("Claude shortcut injects, deduplicates and disables its permission flag", () => {
  expect(
    shortcutArguments("claude", ["--model", "synthetic-model"], ["--resume", "synthetic-session"]),
  ).toEqual([permissions, "--model", "synthetic-model", "--resume", "synthetic-session"]);
  expect(shortcutArguments("claude", [permissions], [permissions, "--resume"])).toEqual([
    permissions,
    "--resume",
  ]);
  expect(shortcutArguments("claude", [permissions], [permissions, "--resume"], true)).toEqual([
    "--resume",
  ]);
});
