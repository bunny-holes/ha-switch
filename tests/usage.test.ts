import { expect, test } from "bun:test";
import {
  claudeResetCount,
  codexAccountUsage,
  resetCount,
  type SpawnAppServer,
} from "../src/usage.ts";

function server(result: unknown, mode: "success" | "error" | "hang" | "invalid" = "success") {
  const sent: string[] = [];
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let killed = false;
  const spawn: SpawnAppServer = () => ({
    stdout: new ReadableStream({
      start(value) {
        controller = value;
      },
      cancel() {
        closed = true;
      },
    }),
    stdin: {
      write(text) {
        const message = JSON.parse(text);
        sent.push(message.method);
        if (mode === "hang") return;
        const reply =
          mode === "invalid"
            ? "invalid\n"
            : `${JSON.stringify({ id: message.id, ...(message.id === 2 && mode === "error" ? { error: { message: "synthetic-error" } } : { result: message.id === 1 ? {} : result }) })}\n`;
        if (message.id) {
          controller.enqueue(new TextEncoder().encode(reply.slice(0, 4)));
          controller.enqueue(new TextEncoder().encode(reply.slice(4)));
        }
      },
    },
    kill() {
      killed = true;
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
    exited: Promise.resolve(0),
  });
  return { spawn, sent, killed: () => killed };
}
test("reset counts distinguish unknown and zero and reject invalid values", () => {
  expect(resetCount(undefined)).toBeNull();
  expect(resetCount(0)).toBe(0);
  for (const value of [-1, "1", Infinity, 0.5])
    expect(() => resetCount(value)).toThrow("reset_count_invalid");
  expect(
    claudeResetCount({
      cedar_ember: { eligible: true, grants: [{ resets_left: 2 }, { resets_left: 1 }] },
    }),
  ).toBe(3);
  expect(claudeResetCount({ cedar_ember: { eligible: false, grants: [] } })).toBe(0);
  expect(claudeResetCount({})).toBeNull();
});
test("preserves Codex quotas and credits with by-limit precedence without model calls", async () => {
  const limits = {
    primary: { usedPercent: 30, resetsAt: 2000000000 },
    secondary: { usedPercent: 2 },
  };
  const fake = server({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: { codex: limits },
    rateLimitResetCredits: { availableCount: 4 },
  });
  expect(await codexAccountUsage("account-a", { spawn: fake.spawn })).toEqual({
    rateLimits: limits,
    resetCredits: 4,
  });
  expect(fake.sent).toEqual(["initialize", "initialized", "account/rateLimits/read"]);
  expect(fake.killed()).toBe(true);
});
test("missing credits remain unknown", async () => {
  const fake = server({ rateLimits: null });
  expect(await codexAccountUsage("account-a", { spawn: fake.spawn })).toEqual({
    rateLimits: null,
    resetCredits: null,
  });
});
test("query failure, malformed reply and timeout always close the process", async () => {
  for (const [mode, code] of [
    ["error", "codex_reset_query_failed"],
    ["invalid", "codex_response_invalid"],
    ["hang", "codex_reset_query_timeout"],
  ] as const) {
    const fake = server({}, mode);
    await expect(
      codexAccountUsage("account-a", { spawn: fake.spawn, timeoutMs: 10 }),
    ).rejects.toThrow(code);
    expect(fake.killed()).toBe(true);
  }
});
test("a real child that ignores SIGTERM is killed before query timeout returns", async () => {
  let child: Bun.Subprocess<"pipe", "pipe", "ignore"> | undefined;
  const spawn: SpawnAppServer = (_command, options) => {
    child = Bun.spawn(
      [
        process.execPath,
        "-e",
        "process.on('SIGTERM',()=>{}); console.log(JSON.stringify({method:'ready'})); setInterval(()=>{},1000)",
      ],
      options,
    );
    return child;
  };
  const start = Date.now();
  try {
    await expect(codexAccountUsage("account-a", { spawn, timeoutMs: 250 })).rejects.toThrow(
      "codex_reset_query_timeout",
    );
    expect(Date.now() - start).toBeLessThan(2500);
    expect(child?.signalCode).toBe("SIGKILL");
    if (!child) throw new Error("expected child process");
    const pid = child.pid;
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    child?.kill("SIGKILL");
  }
});
test("cleanup failure preserves the original query error as its cause", async () => {
  const fake = server({}, "hang");
  const spawn: SpawnAppServer = (command, options) => {
    const child = fake.spawn(command, options);
    child.kill = () => {
      throw new Error("synthetic-cleanup-error");
    };
    return child;
  };
  try {
    await codexAccountUsage("account-a", { spawn, timeoutMs: 5 });
    throw new Error("expected query failure");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause as AggregateError;
    expect(cause).toBeInstanceOf(AggregateError);
    expect((cause.errors[0] as Error).message).toBe("codex_reset_query_timeout");
  }
});
