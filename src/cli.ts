import { homedir } from "node:os";
import { resolve } from "node:path";
import { version } from "../package.json";
import { accountAt, accountTable } from "./account-table.ts";
import {
  captureAgyAccount,
  listAgyAccounts,
  restoreAgyBackup,
  syncAgyAccounts,
  useAgyAccount,
} from "./agy-accounts.ts";
import {
  importLegacyClaudeAccounts,
  listClaudeAccounts,
  restoreClaudeBackup,
  syncAccounts,
  useClaudeAccount,
} from "./claude-accounts.ts";
import {
  defaultConfigDir,
  type Host,
  importConfiguration,
  initConfiguration,
  poolsPath,
  saveAgyConfiguration,
  validateHostPools,
} from "./config.ts";
import { errorCode, PoolError } from "./errors.ts";
import {
  listAccounts,
  profileDirectory,
  readPools,
  restoreAccount,
  syncAll,
  useAccount,
} from "./pool.ts";
import { profileEnvironment } from "./profiles.ts";
import type { AccountListing, Pool, Pools } from "./types.ts";
import { codexAccountUsage } from "./usage.ts";

const HELP = `HA Switch ${version}
Usage: has [OPTIONS]
       has <COMMAND> [ARGS...]

has                          Show help
has --list                   List managed harnesses, profiles, and current selections
has -h c                     List Claude profiles
has -h c -s 2                Switch Claude to profile 2
has -c a personal            Save the current Antigravity login as personal

--list                       List all configured harnesses or the selected harness
-h, --harness HARNESS         c/claude, x/codex, a/antigravity (agy)
-s, --switch NUMBER           Switch the selected harness to the shown profile number
-c, --create HARNESS          Save the current Antigravity login; a label is required
--help                       Show help
--version                    Show version

Commands:

list [codex|claude|agy] [--pool NAME] [--local]
switch <codex|claude|agy> [NUMBER] [--pool NAME]
sync [codex|claude|agy] [--pool NAME]
restore <codex|claude|agy> [--pool NAME]
save agy <LABEL> [--pool NAME]
run <codex|claude|agy> [--pool NAME] [--account NUMBER] [-- ARGS...]
init
import --from DIRECTORY

Default: show help. Selecting only a harness lists its profiles.
Create supports Antigravity only. Sign in with agy first.
--local reads saved data without updates or queries.
Common: --config-dir DIRECTORY
One pool is selected automatically. Use --pool when switching among several.`;

const HARNESSES: Record<Host, { shortcut: string; title: string }> = {
  codex: { shortcut: "x", title: "Codex" },
  claude: { shortcut: "c", title: "Claude" },
  agy: { shortcut: "a", title: "Antigravity" },
};

const OPTION_ALIASES = new Map([
  ["-h", "--harness"],
  ["-s", "--switch"],
  ["-c", "--create"],
]);

function hostForHarness(text: string): Host | undefined {
  return (Object.keys(HARNESSES) as Host[]).find(
    (host) =>
      text === host ||
      text === HARNESSES[host].shortcut ||
      text === HARNESSES[host].title.toLowerCase(),
  );
}

async function launch(host: Host, pool: Pool, args: string[], home: string): Promise<number> {
  const child = Bun.spawn([host, ...(pool.args ?? []), ...args], {
    env:
      host === "agy"
        ? { ...process.env }
        : profileEnvironment({ host, directory: pool.home }, home),
    stdio: ["inherit", "inherit", "inherit"],
  });
  const ignoreInterrupt = () => {};
  process.on("SIGINT", ignoreInterrupt);
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", ignoreInterrupt);
  }
}

export interface CliDependencies {
  platform: NodeJS.Platform;
  home: string;
  print: (text: string) => void;
  error: (text: string) => void;
  readPools: typeof readPools;
  listCodex: typeof listAccounts;
  syncCodex: typeof syncAll;
  useCodex: typeof useAccount;
  restoreCodex: typeof restoreAccount;
  readUsage: typeof codexAccountUsage;
  listClaude: typeof listClaudeAccounts;
  syncClaude: typeof syncAccounts;
  useClaude: typeof useClaudeAccount;
  restoreClaude: typeof restoreClaudeBackup;
  listAgy: typeof listAgyAccounts;
  syncAgy: typeof syncAgyAccounts;
  useAgy: typeof useAgyAccount;
  restoreAgy: typeof restoreAgyBackup;
  captureAgy: typeof captureAgyAccount;
  saveAgy: typeof saveAgyConfiguration;
  importLegacy: typeof importLegacyClaudeAccounts;
  init: typeof initConfiguration;
  import: typeof importConfiguration;
  launch: typeof launch;
}

function selectPools(pools: Pools, name: string | undefined, one: boolean): Pool[] {
  const selected = Object.entries(pools)
    .filter(([key]) => name === undefined || name === key)
    .map(([key, pool]) => ({ ...pool, name: key }));
  if (!selected.length) throw new PoolError(name ? "pool_unknown" : "pool_config_missing");
  if (one && selected.length !== 1) throw new PoolError("pool_selection_required");
  return selected;
}

async function addUsage(pool: Pool, listing: AccountListing, deps: CliDependencies): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, listing.accounts.length) }, async () => {
      while (cursor < listing.accounts.length) {
        const row = listing.accounts[cursor++];
        try {
          Object.assign(
            row,
            await deps.readUsage(profileDirectory(pool, row.account, deps.home), {
              home: deps.home,
            }),
          );
        } catch (error) {
          row.resetError = errorCode(error, "codex_usage_query_failed");
        }
      }
    }),
  );
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  overrides: Partial<CliDependencies> = {},
): Promise<number> {
  const print = overrides.print ?? console.log;
  const report = overrides.error ?? console.error;
  const separator = argv.indexOf("--");
  const input = separator < 0 ? [...argv] : argv.slice(0, separator);
  const runArgs = separator < 0 ? [] : argv.slice(separator + 1);
  if ((input.length === 0 && separator < 0) || input.includes("--help")) {
    print(HELP);
    return 0;
  }
  if (input.includes("--version")) {
    print(version);
    return 0;
  }
  const deps: CliDependencies = {
    platform: process.platform,
    home: homedir(),
    print,
    error: report,
    readPools,
    listCodex: listAccounts,
    syncCodex: syncAll,
    useCodex: useAccount,
    restoreCodex: restoreAccount,
    readUsage: codexAccountUsage,
    listClaude: listClaudeAccounts,
    syncClaude: syncAccounts,
    useClaude: useClaudeAccount,
    restoreClaude: restoreClaudeBackup,
    listAgy: listAgyAccounts,
    syncAgy: syncAgyAccounts,
    useAgy: useAgyAccount,
    restoreAgy: restoreAgyBackup,
    captureAgy: captureAgyAccount,
    saveAgy: saveAgyConfiguration,
    importLegacy: importLegacyClaudeAccounts,
    init: initConfiguration,
    import: importConfiguration,
    launch,
    ...overrides,
  };
  try {
    const positions: string[] = [];
    const options = new Map<string, string>();
    let local = false;
    let list = false;
    for (let index = 0; index < input.length; index++) {
      const inputWord = input[index];
      const word = OPTION_ALIASES.get(inputWord) ?? inputWord;
      if (word === "--local") {
        if (local) throw new PoolError("duplicate_option");
        local = true;
      } else if (word === "--list") {
        if (list) throw new PoolError("duplicate_option");
        list = true;
      } else if (
        [
          "--pool",
          "--config-dir",
          "--account",
          "--from",
          "--harness",
          "--switch",
          "--create",
        ].includes(word)
      ) {
        if (options.has(word)) throw new PoolError("duplicate_option");
        const value = input[++index];
        if (!value || value.startsWith("-")) throw new PoolError("option_value_missing");
        options.set(word, value);
      } else if (word.startsWith("-")) throw new PoolError("unknown_option");
      else positions.push(word);
    }
    let command = positions[0] ?? "list";
    let hostText: string | undefined = positions[1];
    let number: string | undefined = positions[2];
    const extra = positions.slice(3);
    if (options.has("--create")) {
      if (list || options.has("--harness") || options.has("--switch") || positions.length > 1)
        throw new PoolError("option_not_applicable");
      command = "save";
      hostText = options.get("--create");
      number = positions[0];
    } else if (list || options.has("--harness") || options.has("--switch")) {
      if (positions.length || (list && options.has("--switch")))
        throw new PoolError("option_not_applicable");
      command = options.has("--switch") ? "switch" : "list";
      hostText = options.get("--harness");
      number = options.get("--switch");
    }
    if (extra.length) throw new PoolError("unknown_argument");
    if (!["list", "switch", "sync", "restore", "run", "init", "import", "save"].includes(command))
      throw new PoolError("unknown_command");
    if (command === "switch" && number === undefined && hostText) command = "list";
    if (
      (local && command !== "list") ||
      (options.has("--account") && command !== "run") ||
      (options.has("--from") && command !== "import") ||
      (separator >= 0 && command !== "run")
    )
      throw new PoolError("option_not_applicable");
    const directory = resolve(options.get("--config-dir") ?? defaultConfigDir());
    if (
      (["switch", "sync", "restore", "run", "save", "init", "import"].includes(command) ||
        (command === "list" && !local)) &&
      deps.platform !== "darwin"
    )
      throw new PoolError("platform_unsupported");
    if (command === "init" || command === "import") {
      if (hostText || number || options.has("--pool")) throw new PoolError("unknown_argument");
      if (command === "init") {
        await deps.init(directory, deps.home);
        print("Configuration ready.");
      } else {
        const source = options.get("--from");
        if (!source) throw new PoolError("import_source_required");
        const imported = await deps.import(resolve(source), directory);
        for (const [host, pools] of Object.entries(imported))
          validateHostPools(host as Host, pools);
        if (imported.claude) await deps.importLegacy(imported.claude, { home: deps.home });
        print("Configuration imported.");
      }
      return 0;
    }
    const selectedHost = hostText === undefined ? undefined : hostForHarness(hostText);
    if (hostText !== undefined && selectedHost === undefined) throw new PoolError("host_invalid");
    if (["switch", "restore", "run", "save"].includes(command) && !selectedHost)
      throw new PoolError("host_required");
    if (command === "save" && selectedHost !== "agy") throw new PoolError("host_not_supported");
    if (command === "save") {
      if (!number) throw new PoolError("account_label_required");
      const previous = validateHostPools("agy", await deps.readPools(poolsPath(directory, "agy")));
      const pool = Object.keys(previous).length
        ? selectPools(previous, options.get("--pool"), true)[0]
        : { name: options.get("--pool") ?? "default", home: ".gemini", accounts: [] };
      const accounts = pool.accounts.includes(number) ? pool.accounts : [...pool.accounts, number];
      const { name, ...spec } = pool;
      const next = validateHostPools("agy", { ...previous, [name]: { ...spec, accounts } });
      await deps.saveAgy(directory, previous, next, () => deps.captureAgy(number));
      print(
        "Antigravity: account saved. Log in to another account with agy, then save it under another label.",
      );
      return 0;
    }
    if (command === "switch" ? !number : number !== undefined)
      throw new PoolError(command === "switch" ? "account_number_required" : "unknown_argument");
    const hosts: Host[] = selectedHost ? [selectedHost] : ["codex", "claude", "agy"];
    const loaded = await Promise.all(
      hosts.map(async (host) => ({
        host,
        pools: validateHostPools(host, await deps.readPools(poolsPath(directory, host))),
      })),
    );
    let found = false;
    for (const { host, pools } of loaded) {
      if (
        !selectedHost &&
        (!Object.keys(pools).length ||
          (options.has("--pool") && !Object.hasOwn(pools, options.get("--pool") as string)))
      )
        continue;
      const selected = selectPools(
        pools,
        options.get("--pool"),
        ["switch", "restore", "run"].includes(command),
      );
      if (command === "run" && options.has("--account"))
        accountAt(selected[0], options.get("--account") as string);
      found = true;
      const directories = selected.flatMap((pool) => [
        pool.home,
        ...pool.accounts.map((account) => profileDirectory(pool, account, deps.home)),
      ]);
      if (
        host === "codex" &&
        ["list", "sync", "run"].includes(command) &&
        !local &&
        !(command === "run" && options.has("--account"))
      )
        await deps.syncCodex(deps.home, directories);
      for (const pool of selected) {
        if (command === "list") {
          const listing =
            host === "codex"
              ? await deps.listCodex(pool, deps.home)
              : host === "claude"
                ? await deps.listClaude(pool, { home: deps.home, local })
                : await deps.listAgy(pool);
          if (host === "codex" && !local) await addUsage(pool, listing, deps);
          const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
          const poolFlag = ` --pool ${quote(pool.name)}`;
          const configFlag = options.has("--config-dir") ? ` --config-dir ${quote(directory)}` : "";
          print(
            accountTable(pool, listing, {
              title: `${HARNESSES[host].title} / ${pool.name}`,
              command: `has -h ${HARNESSES[host].shortcut}${poolFlag}${configFlag} -s`,
            }),
          );
        } else if (command === "switch") {
          const account = accountAt(pool, number as string);
          if (host === "codex") await deps.useCodex(pool, account, deps.home);
          else if (host === "claude") await deps.useClaude(pool, account, { home: deps.home });
          else await deps.useAgy(pool, account);
          print(
            `${HARNESSES[host].title}: profile ${number} selected. Open sessions keep their current login.`,
          );
        } else if (command === "sync") {
          if (host === "claude") await deps.syncClaude(pool, { home: deps.home });
          else if (host === "agy") await deps.syncAgy(pool);
          print(`${host}: synchronized.`);
        } else if (command === "restore") {
          if (host === "claude") await deps.restoreClaude(pool, { home: deps.home });
          else if (host === "agy") await deps.restoreAgy(pool);
          else if (!(await deps.restoreCodex(pool, deps.home)))
            throw new PoolError("backup_missing");
          print(`${HARNESSES[host].title}: previous login restored.`);
        } else if (command === "run") {
          const selectedAccount = options.get("--account");
          if (selectedAccount) {
            const account = accountAt(pool, selectedAccount);
            if (host === "codex") await deps.useCodex(pool, account, deps.home);
            else if (host === "claude") await deps.useClaude(pool, account, { home: deps.home });
            else await deps.useAgy(pool, account);
          } else if (host === "claude") await deps.syncClaude(pool, { home: deps.home });
          else if (host === "agy") await deps.syncAgy(pool);
          return await deps.launch(host, pool, runArgs, deps.home);
        }
      }
    }
    if (!found) throw new PoolError(options.has("--pool") ? "pool_unknown" : "pool_config_missing");
    return 0;
  } catch (error) {
    report(`has: ${errorCode(error)}`);
    return 1;
  }
}
