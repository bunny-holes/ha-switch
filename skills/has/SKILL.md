# HA Switch

Use the installed `has` command. It requires macOS and Bun 1.4.2 or later.
Run `has -h` to check the installed command without reading account state.
If it is missing, use the installation guide in the project's README.[^install]

The daily surface is five commands plus the bare dashboard:

```text
has
has list [TOOL] [--usage] [--json]
has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]
has switch TOOL [SELECTOR]
has add TOOL NAME
has restore TOOL
```

`TOOL` is `codex`, `claude`, or `agy`; `x`, `c`, and `a` are accepted in that position.
A `SELECTOR` is `-` (previous shared selection), a row number, an exact name, or a
fragment that matches one name. `-h` is always help, never a tool choice.

## Look before acting

- Use `has` for the local dashboard. It reads configuration, the last recorded shared
  selection, and cached usage only. It never reads the keychain or the network.
- Use `has list TOOL --json` when you need machine-readable rows. The document has
  `schemaVersion` 1; `current` is `null` until a check happened, `status` separates
  `fresh`, `stale`, `limited`, `query_failed`, `signed_out`, and `unknown`.
- Use `has list [TOOL] --usage` only when the user wants fresh usage. It reads credentials
  and queries usage; a failed row stays visible and the exit code is 0.
- Keep zero, unknown, stale, and failed values distinct in your report. Never print
  tokens, raw credentials, email addresses, or account ids.
- Row numbers count from 1 inside one pool. Pass the same `--pool NAME` and
  `--config-dir DIR` to list, run, and switch.

## Open a tool

- `has run codex` picks an account by live usage and the pool's `selection` policy,
  replaces the shared `~/.codex` login, and starts Codex. `no_available_account` and
  `selection_usage_unavailable` mean nothing was switched or launched.
- `has run claude` starts Claude on the login already in `~/.claude` without reading the
  keychain. `has run TOOL NAME` validates the name, switches the shared home, and starts.
- `has run TOOL NAME --isolated` starts the account's own source folder and leaves the
  shared login alone. Use it to run two accounts side by side, and when a shared Claude
  run fails with `keychain_no_gui_session`; the error already prints that `Next:` line.
- Every run adds the pool `args` and the approval-bypass flags once (Codex:
  `--dangerously-bypass-approvals-and-sandbox` or an existing `--yolo`, plus
  `--dangerously-bypass-hook-trust`; Claude: `--dangerously-skip-permissions`).
  `--safe` omits both. Arguments after `--` go to the tool unchanged.
- Antigravity has no documented isolated login; `has run agy [NAME]` always uses the
  shared keyring and `--isolated` is refused.
- Launch only when the user asks. Do not run shared switches or shared runs in parallel,
  and never during a token refresh. Isolated runs may overlap.

## Switch, restore, register

- `has switch TOOL SELECTOR` changes the shared login without starting the tool. Open
  sessions keep their loaded login. `has switch TOOL -` returns to the previous shared
  selection. Without a selector the command opens a picker only on a terminal; in your
  shell it stops with `selector_required`, so always pass the selector.
- `has restore TOOL` restores the login the shared home held before the first switch.
  It is not the same as `switch TOOL -`.
- `has add codex NAME` and `has add claude NAME` open the official sign-in in a new
  source folder and register the profile only after the sign-in is verified. The user
  must complete the browser flow; do not run these unattended.
- `has add agy NAME` saves the account `agy` is currently signed in to.
- Report a CLI failure by its `has: CODE — reason` line and the `Next:` command. Exit
  code 2 is a usage problem, 1 an operation failure, 130 a cancellation. Do not repair a
  failure by editing native login files, reading keychain secrets, or changing settings.

## Retired spellings

`has x`, `has c`, `has -h TOOL`, `-s`, `--switch`, `--account`, `-c`, `--create`,
`has save`, `has sync`, `--list`, `--local`, and `--dry-run` stop with exit code 2 and
print the replacement. Use the new form directly:

| Old | New |
| --- | --- |
| `has x`, `has x -s N` | `has run codex`, `has run codex N` |
| `has c`, `has c -s N` | `has run claude`, `has run claude N` |
| `has -h c -s N` | `has switch claude N` |
| `has switch N`, `has restore` | `has switch codex N`, `has restore codex` |
| `has -c a NAME` | `has add agy NAME` |
| `has run TOOL NAME` (source only) | `has run TOOL NAME --isolated` |

`has init` and `has import --from DIRECTORY` remain as maintenance commands; use them
only on an explicit setup or migration request. Edit `~/.zshenv` only when the user
explicitly requests that change.

## macOS keychain access

Keychain lock and process security-session access are separate conditions.
`keychain_locked` reports a confirmed locked keychain; the user runs
`security unlock-keychain ~/Library/Keychains/login.keychain-db` and enters the
password only at its prompt. `keychain_no_gui_session` means the calling security
session cannot show an approval window: use a normal Mac Terminal or the `--isolated`
run that the error names. A Herdr server started in a remote session keeps that session
for new panes; do not stop an existing Herdr server or its agents without the user's
explicit instruction. `keychain_interaction_not_allowed` means the cause could not be
narrowed; do not claim the keychain is locked. Keep existing access controls; never
grant unrestricted access or export credentials.

The CLI owns native credential reads, backups, validation, and replacement.
Configuration stays under `~/.config/ha-switch/` unless the user selects another directory.
The skill has no marketplace, toolbox, or MCP dependency.

[^install]: [HA Switch installation guide](https://github.com/bunny-holes/ha-switch#install-cli).
