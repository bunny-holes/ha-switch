import { createInterface } from "node:readline";

/** Shows numbered choices on stderr and returns the typed answer, or undefined when cancelled. */
export type Prompter = (title: string, choices: readonly string[]) => Promise<string | undefined>;

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export const terminalPrompter: Prompter = (title, choices) =>
  new Promise((resolveAnswer) => {
    const lines = [title, ...choices.map((choice, index) => `${index + 1}) ${choice}`)];
    process.stderr.write(`${lines.join("\n")}\n`);
    const reader = createInterface({ input: process.stdin, output: process.stderr });
    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      reader.close();
      resolveAnswer(value);
    };
    reader.on("SIGINT", () => {
      process.stderr.write("\n");
      finish(undefined);
    });
    reader.on("close", () => finish(undefined));
    reader.question("Number or name (q to cancel): ", (answer) => {
      const text = answer.trim();
      finish(text === "" || text.toLowerCase() === "q" ? undefined : text);
    });
  });
