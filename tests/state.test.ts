import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readSelectionState,
  selectionEntry,
  selectionStatePath,
  updateSelection,
} from "../src/state.ts";

const paths: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), "ha-switch-state-"));
  paths.push(path);
  return path;
}
afterEach(async () => {
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

test("selections record current, previous and the time, and restore forgets the current", async () => {
  const path = selectionStatePath(await temporary());
  expect(await readSelectionState(path)).toEqual({ version: 1, selections: {} });
  expect(
    await updateSelection(path, "codex", "default", {
      kind: "selected",
      account: "work",
      at: 10,
      before: "personal",
    }),
  ).toEqual({
    current: "work",
    previous: "personal",
    checkedAt: 10,
  });
  expect(
    await updateSelection(path, "codex", "default", { kind: "selected", account: "work", at: 20 }),
  ).toEqual({
    current: "work",
    previous: "personal",
    checkedAt: 20,
  });
  expect(
    await updateSelection(path, "codex", "default", { kind: "selected", account: "spare", at: 30 }),
  ).toEqual({
    current: "spare",
    previous: "work",
    checkedAt: 30,
  });
  expect(
    await updateSelection(path, "codex", "default", { kind: "checked", account: null, at: 40 }),
  ).toEqual({
    current: null,
    previous: "spare",
    checkedAt: 40,
  });
  expect(
    await updateSelection(path, "codex", "default", { kind: "checked", account: "work", at: 50 }),
  ).toEqual({
    current: "work",
    previous: "spare",
    checkedAt: 50,
  });
  expect(await updateSelection(path, "codex", "default", { kind: "restored", at: 60 })).toEqual({
    previous: "work",
  });
  expect(
    await updateSelection(path, "codex", "default", { kind: "selected", account: "work", at: 70 }),
  ).toEqual({ current: "work", checkedAt: 70 });
  expect(
    await updateSelection(path, "codex", "default", {
      kind: "selected",
      account: "work",
      at: 80,
      before: "spare",
    }),
  ).toEqual({ current: "work", previous: "spare", checkedAt: 80 });
  const state = await readSelectionState(path);
  expect(selectionEntry(state, "codex", "default")).toEqual({
    current: "work",
    previous: "spare",
    checkedAt: 80,
  });
  expect(selectionEntry(state, "claude", "default")).toEqual({});
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  const text = await Bun.file(path).text();
  expect(text).not.toMatch(/token|@/);
});

test("invalid state is reported, never trusted, and replaced on the next write", async () => {
  const path = selectionStatePath(await temporary());
  for (const text of [
    "{",
    '{"version":2,"selections":{}}',
    '{"version":1,"selections":{"codex/default":{"current":"../x"}}}',
    '{"version":1,"selections":{"evil/x":{}}}',
    '{"version":1,"selections":{"codex/default":{"checkedAt":"soon"}}}',
  ]) {
    await Bun.write(path, text);
    await expect(readSelectionState(path)).rejects.toThrow("state_invalid");
  }
  await updateSelection(path, "claude", "default", { kind: "selected", account: "work", at: 5 });
  expect(await readSelectionState(path)).toEqual({
    version: 1,
    selections: { "claude/default": { current: "work", checkedAt: 5 } },
  });
});
