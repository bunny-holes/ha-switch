import type { Host } from "./config.ts";
import { keychainErrorMessage } from "./keychain.ts";

export const TOOL_TITLE: Record<Host, string> = {
  codex: "Codex",
  claude: "Claude",
  agy: "Antigravity",
};

export interface ErrorContext {
  host?: Host;
  tool?: string;
  account?: string;
  pool?: string;
  configFlag?: string;
  candidates?: string[];
  command?: string;
}

export interface Described {
  message: string;
  next?: string;
}

const USAGE_ERRORS = new Set([
  "unknown_command",
  "unknown_option",
  "unknown_argument",
  "duplicate_option",
  "option_value_missing",
  "option_not_applicable",
  "color_mode_invalid",
  "host_invalid",
  "host_required",
  "selector_required",
  "account_selector_not_found",
  "account_selector_ambiguous",
  "account_number_invalid",
  "account_previous_missing",
  "account_label_required",
  "account_label_invalid",
  "legacy_command",
  "legacy_option",
  "pool_selection_required",
  "pool_unknown",
  "import_source_required",
  "isolated_not_supported",
  "add_not_supported",
]);

export function exitCodeFor(code: string): number {
  if (code === "cancelled") return 130;
  return USAGE_ERRORS.has(code) ? 2 : 1;
}

const LEGACY_NEXT: Record<string, string> = {
  x: "has run codex",
  c: "has run claude",
  save: "has add agy NAME",
  sync: "has switch TOOL NAME (switching synchronizes saved logins)",
  "--list": "has list",
  "--local": "has list",
  "--harness": "has list TOOL",
  "--switch": "has switch TOOL NUMBER",
  "-s": "has switch TOOL NUMBER",
  "--create": "has add TOOL NAME",
  "-c": "has add TOOL NAME",
  "--account": "has run TOOL NUMBER",
  "--dry-run": "has run TOOL NAME --isolated (no dry-run; test with a source profile)",
  "--from": "has import --from DIRECTORY",
};

export function legacyNext(word: string): string | undefined {
  return LEGACY_NEXT[word];
}

export function describeError(code: string, context: ErrorContext = {}): Described {
  const tool = context.tool ?? context.host ?? "TOOL";
  const account = context.account ?? "NAME";
  const flags = `${context.pool ? ` --pool ${context.pool}` : ""}${context.configFlag ?? ""}`;
  const first = context.candidates?.[0] ?? account;
  if (code.startsWith("keychain_")) {
    const described: Described = { message: keychainErrorMessage(code) };
    if (context.host === "claude" && context.account && context.command === "run")
      described.next = `has run claude ${context.account} --isolated${flags}`;
    return described;
  }
  switch (code) {
    case "unknown_command":
      return { message: "unknown command", next: "has -h" };
    case "unknown_option":
      return { message: "unknown option", next: "has -h" };
    case "unknown_argument":
      return { message: "too many arguments", next: "has -h" };
    case "duplicate_option":
      return { message: "an option was given twice", next: "has -h" };
    case "option_value_missing":
      return { message: "an option needs a value", next: "has -h" };
    case "option_not_applicable":
      return { message: "an option does not apply to this command", next: "has -h" };
    case "color_mode_invalid":
      return { message: "--color takes auto, always, or never", next: "has --color never" };
    case "host_invalid":
      return { message: "tool must be codex, claude, or agy", next: "has -h" };
    case "host_required":
      return {
        message: "name the tool",
        next: context.command
          ? `has ${context.command} codex${context.account ? ` ${context.account}` : ""}`
          : "has -h",
      };
    case "selector_required":
      return {
        message: "choose an account first",
        next: `has ${context.command ?? "switch"} ${tool} ${first}${flags}`,
      };
    case "account_selector_not_found":
      return { message: "no profile has that name or number", next: `has list ${tool}${flags}` };
    case "account_selector_ambiguous":
      return {
        message: "more than one profile matches",
        next: `has ${context.command ?? "run"} ${tool} ${first}${flags}`,
      };
    case "account_number_invalid":
      return { message: "row number is outside this pool", next: `has list ${tool}${flags}` };
    case "account_previous_missing":
      return {
        message: "no previous shared selection is recorded",
        next: `has list ${tool}${flags}`,
      };
    case "account_label_required":
      return { message: "give the new profile a name", next: `has add ${tool} work` };
    case "account_label_invalid":
      return {
        message: "names use letters, digits, dot, dash, underscore",
        next: `has add ${tool} work`,
      };
    case "account_label_taken":
      return {
        message: "a profile with this name already exists",
        next: `has list ${tool}${flags}`,
      };
    case "account_source_exists":
      return {
        message: "a source folder for this name already exists",
        next: `has add ${tool} ${account}-2`,
      };
    case "account_source_missing":
      return {
        message: "this profile has no source folder for isolated runs",
        next: `has run ${tool} ${account}${flags}`,
      };
    case "account_not_in_pool":
      return {
        message: "this profile is not in the selected pool",
        next: `has list ${tool}${flags}`,
      };
    case "account_not_signed_in":
      return {
        message: "the selected profile is not signed in",
        next: `has add ${tool} ${account}`,
      };
    case "account_not_stored":
      return {
        message: "no saved login for this profile",
        next: `has list ${tool} --usage${flags}`,
      };
    case "account_current_not_in_pool":
      return {
        message: "the current shared login is not one of the saved profiles",
        next: `has list ${tool} --usage${flags}`,
      };
    case "account_auth_changed":
      return {
        message: "the login changed while has was working; nothing was replaced",
        next: `has ${context.command ?? "switch"} ${tool} ${account}${flags}`,
      };
    case "add_login_failed":
      return {
        message: "sign-in did not finish; profile was not registered",
        next: `has add ${tool} ${account}`,
      };
    case "add_login_unverified":
      return {
        message: "sign-in could not be verified for this source; profile was not registered",
        next: `has add ${tool} ${account}`,
      };
    case "add_not_supported":
      return { message: "add supports codex, claude, and agy", next: "has -h" };
    case "agy_not_signed_in":
      return {
        message: "no current Antigravity login to save; sign in with agy first",
        next: `has add agy ${account}`,
      };
    case "agy_account_label_taken":
      return {
        message: "this label already holds a different Antigravity account",
        next: `has add agy ${account}-2`,
      };
    case "isolated_not_supported":
      return {
        message: "Antigravity has no documented isolated login; shared run only",
        next: `has run agy${flags}`,
      };
    case "legacy_command":
      return { message: "this old command was replaced", next: context.command ?? "has -h" };
    case "legacy_option":
      return { message: "this old option was replaced", next: context.command ?? "has -h" };
    case "pool_selection_required":
      return {
        message: "choose one configured pool",
        next: `has ${context.command ?? "list"} ${tool}${context.account ? ` ${context.account}` : ""} --pool NAME`,
      };
    case "pool_unknown":
      return {
        message: "no pool has that name",
        next: `has list ${tool === "TOOL" ? "" : tool}`.trimEnd(),
      };
    case "pool_config_missing":
      return {
        message: "no saved profiles for this tool",
        next: `has add ${tool === "TOOL" ? "codex" : tool} work`,
      };
    case "pool_config_invalid":
    case "claude_pools_invalid":
    case "agy_pools_invalid":
      return {
        message: "the pool configuration file is invalid",
        next: `has list ${tool === "TOOL" ? "" : tool}`.trimEnd(),
      };
    case "backup_missing":
    case "agy_backup_missing":
      return { message: "no pre-switch login is saved yet", next: `has list ${tool}${flags}` };
    case "no_available_account":
      return {
        message: "사용 가능한 계정 없음. Wait for usage to reset or select an account explicitly.",
        next: `has run ${tool} NAME${flags}`,
      };
    case "selection_usage_unavailable":
      return {
        message: "every usage query failed, so no account can be chosen automatically",
        next: `has run ${tool} NAME${flags}`,
      };
    case "platform_unsupported":
      return { message: "this command needs macOS" };
    case "import_source_required":
      return { message: "import needs --from DIRECTORY", next: "has import --from DIRECTORY" };
    case "import_config_missing":
      return { message: "no pool files in that directory", next: "has import --from DIRECTORY" };
    case "config_changed":
      return {
        message: "the configuration changed while has was working; nothing was written",
        next: `has ${context.command ?? "add"} ${tool} ${account}`,
      };
    case "config_destination_exists":
      return { message: "different configuration already exists at the destination" };
    case "profiles_not_found":
      return {
        message: "no Codex or Claude profile folders were found",
        next: "has add codex work",
      };
    case "state_invalid":
      return { message: "state.json is unreadable; previous selections are ignored" };
    case "cancelled":
      return { message: "cancelled; nothing was changed" };
    case "unexpected_error":
      return { message: "an unexpected error happened; run with LOG_LEVEL=debug for details" };
    default:
      return { message: code.replaceAll("_", " ") };
  }
}
