import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

export async function pack(destination: string): Promise<string> {
  const stage = await mkdtemp(join(tmpdir(), "ha-switch-pack-"));
  try {
    const source = await Bun.file(join(root, "package.json")).json();
    const {
      scripts: _scripts,
      devDependencies: _devDependencies,
      packageManager: _manager,
      ...manifest
    } = source;
    await Bun.write(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = await Bun.build({
      entrypoints: [join(root, "src/bin.ts")],
      target: "bun",
      format: "esm",
      define: { "import.meta.main": "false" },
    });
    if (!result.success) throw new AggregateError(result.logs, "package_build_failed");
    if (result.outputs.length !== 1) throw new Error("package_output_invalid");
    const executable = join(stage, "dist/has.js");
    await mkdir(dirname(executable), { recursive: true });
    await Bun.write(executable, await result.outputs[0].text());
    await chmod(executable, 0o755);
    for (const file of ["README.md", "README.ko.md", "LICENSE"])
      await cp(join(root, file), join(stage, file));
    const target = resolve(destination);
    await mkdir(dirname(target), { recursive: true });
    const child = Bun.spawn(
      [process.execPath, "pm", "pack", "--ignore-scripts", "--filename", target],
      {
        cwd: stage,
        stdout: "ignore",
        stderr: "pipe",
      },
    );
    const errors = await new Response(child.stderr).text();
    if ((await child.exited) !== 0) throw new Error(`package_pack_failed: ${errors.trim()}`);
    return target;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) {
    console.error("Usage: bun scripts/build.ts <output.tgz>");
    process.exitCode = 1;
  } else console.log(await pack(destination));
}
