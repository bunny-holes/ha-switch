import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Profile {
  host: "claude" | "codex";
  directory: string;
}

export async function localProfiles(home = homedir()): Promise<Profile[]> {
  const entries = await readdir(home, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
  const profiles: Profile[] = [
    { host: "claude", directory: ".claude" },
    { host: "codex", directory: ".codex" },
  ];
  for (const host of ["claude", "codex"] as const) {
    for (const name of names.filter((name) => name.startsWith(`.${host}-`))) {
      try {
        if ((await stat(join(home, name))).isDirectory()) {
          profiles.push({ host, directory: name });
          break;
        }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
  }
  return profiles;
}

export function profileEnvironment(
  profile: Profile,
  home = homedir(),
  base = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  if (profile.host === "codex") env.CODEX_HOME = resolve(home, profile.directory);
  else if (resolve(home, profile.directory) === resolve(home, ".claude"))
    delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = resolve(home, profile.directory);
  return env;
}
