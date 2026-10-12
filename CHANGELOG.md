

# Changelog

## Unreleased

- Change `run codex/claude <LABEL|NUMBER>` to launch the configured source profile directly, without credential reads, usage queries, synchronization, or global login replacement. `--account NUMBER` selects the source too; omitting a selection now reports `account_selection_required` instead of launching the shared pool target. Pool and forwarded arguments are preserved. `run agy` and `x/c` keep their existing behavior.
- Make default lists configuration-only (names and source paths). Add `--usage` for credential/current-account and usage queries. `--local` remains a configuration-only alias and conflicts with `--usage`.
- Preserve Claude current-login read errors instead of reporting `account_current_not_in_pool` when keychain access fails.

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
