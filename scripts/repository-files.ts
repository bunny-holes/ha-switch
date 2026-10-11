/**
 * The files Git treats as part of this repository: tracked, plus new files that no ignore
 * rule covers. Biome's VCS integration reads .gitignore and .git/info/exclude but not the
 * global excludes file, so Biome is handed this list rather than walking the tree itself —
 * that keeps local tool folders such as .obsidian or .idea out of formatting.
 */
export async function repositoryFiles(root: string): Promise<string[]> {
  const git = Bun.which("git");
  if (!git) throw new Error("required command is missing: git");
  const child = Bun.spawn(
    [git, "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { stdout: "pipe", stderr: "inherit" },
  );
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  if (code !== 0) throw new Error(`git ls-files exited ${code}`);
  return output.split("\0").filter(Boolean);
}
