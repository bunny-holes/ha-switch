

# Changelog

## Unreleased

HA-3 interface redesign. The daily surface is `has`, `list`, `run`, `switch`, `add`, and `restore`.

- Make bare `has` a local dashboard: configuration, the last recorded shared selection, and cached usage in one table, with no keychain, network, or input. An empty configuration prints the next step instead of an error.
- Add `has list [TOOL] [--usage] [--json]`. Default lists read configuration, state, and cache only; `--usage` queries live usage per tool, keeps failed rows visible with their last good value, records the checked shared login, and exits 0 with one stderr line and a `Next:` per failure.
- Add `has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]`. `run codex` picks by live usage and the pool's `selection` policy and replaces the shared `~/.codex` login; `run claude` starts the shared home without a keychain read; a named run validates and switches first; `--isolated` runs the account's source folder and leaves the shared login alone. Every run applies pool `args` and the approval-bypass flags once; `--safe` omits both.
- Add `has switch TOOL [SELECTOR]`, `has restore TOOL`, and `has add TOOL NAME`. `switch TOOL -` returns to the previous shared selection; `restore` returns the login from before the first switch; `add codex|claude` runs the official sign-in in a new source folder and registers it only after verification; `add agy` saves the current Antigravity login.
- Add selectors: `-`, row number, exact name, unique fragment. Ambiguous or missing selectors open a numbered picker only when stdin and stdout are TTYs; otherwise they fail with the candidates. Cancel exits 130 without writes.
- Add `--json` (schemaVersion 1 documents for the dashboard and lists, including errors), `--color auto|always|never` with `NO_COLOR`, `--no-input`, `-h`/`--help`, and `-V`. Errors print `has: CODE — reason` plus `Next:`; exit codes are 0, 1 (operation), 2 (usage), 130 (cancel).
- Show `5H RESET`, `7D RESET`, and `CREDITS` as separate columns with relative times, distinguish `fresh`, `stale`, `limited`, `query failed`, `signed out`, and `unknown`, and fold the table for narrow panes (sources first, then the weekly reset, then a compact layout).
- Store `state.json` (shared selections and check times) and `usage-cache.json` (allow-listed usage values and safe error codes) under the configuration directory with validation and atomic writes. Cached values are never used for automatic selection.
- Write the Claude pre-switch backup once so `restore claude` returns the first pre-switch login like Codex and Antigravity.
- Report a keychain failure during a named shared Claude run with `Next: has run claude NAME --isolated` and zero writes or launches.
- Retire `x`, `c`, `save`, `sync`, `--list`, `--local`, `-h TOOL`, `-s`, `--switch`, `-c`, `--create`, `--account`, and `--dry-run`: they exit 2 and print the replacement. Keep `init` and `import --from` as maintenance commands. Existing pool files, folder-name labels, `args`, and `selection` policies are read unchanged; the retired `.codex-pkls` home no longer blocks commands.

## 0.1.0

- Install the standalone `has` command from a GitHub Release with Bun.
- Show help with `has`, list all tools with `has --list`, and switch Claude with `has -h c -s 2`.
- Select tools with short or full names and show the current profile with `*`.
- Install the separate `has` agent skill for Codex or Claude Code without a marketplace.
- List Codex, Claude Code, and Antigravity CLI accounts on macOS.
- Show available usage, reset times, and reset credits; distinguish unknown values and query failures.
- Back up the current login and switch by account number without replacing profile directories.
- Save Antigravity logins in the macOS keychain and restore the login from before the first switch.
- Import existing pool configuration and saved Claude accounts without removing originals.
- Preserve native settings, plugins, MCP credentials, and session history during account changes.
- Keep source code and runtime packaging independent of toolbox and marketplace installation caches.
