

# HA Switch

Use the installed `has` command. It requires macOS and Bun 1.4.2 or later.
Run `has --help` to check the installed command without reading account state.
If it is missing, use the installation guide in the project's README.[^install]

## List accounts

- Use `has --list --local` to show all configured tools and profiles without usage queries or credential writes.
- Use `has -h c --local`, `has -h x --local`, or `has -h a --local` for one tool.
- Use `has --list` or `has -h c` when the user wants usage. Normal Codex listing can refresh logins and synchronize saved copies; keep `--local` when credential changes are outside the task.
- Interpret `*` as the current profile. Keep zero, unknown values, and query failures distinct.
- Treat numbers as positions within the selected pool's configuration. Use the same `--pool NAME` and `--config-dir DIRECTORY` for listing and switching.
- Report profile labels and usage only as needed for the task. Never print tokens, raw credentials, or account addresses.

## Switch a saved account

Switch only when the user requests it and the tool and profile are clear.
Use `has -h c -s 2` to select Claude profile 2, or
`has --harness claude --switch 2` for the same action.
Codex accepts `x` or `codex`; Antigravity accepts `a`, `antigravity`, or `agy`.
`-h` selects a tool. Help uses `--help`.

When several pools exist, select the user's pool with `--pool NAME`.
If the requested profile or pool is unclear, list its local profiles and ask for the missing choice.
Verify with `has -h c --local`, using the selected tool and the same pool and configuration directory.
Open sessions keep their loaded login. Treat the configured account sources as
slots 1, 2, and 3, and `~/.codex` as the replaceable launch slot 0. Each new terminal
uses the account placed in slot 0 before its launch.

Never run account switching and launching in parallel. Complete one switch and
launch before starting another. Do not delegate these operations to concurrent
workers, batch them with parallel tools, or switch during an authentication refresh.
HA Switch checks its own writes and verifies the selected account before launch;
it cannot stop another running Codex process from writing the shared login file.
Use `has -h x --local` or `has switch --local` to list the native Codex home.
Use `has switch codex N` or `has switch N` to select account N there.
Use `has x -s N` or `has c -s N` to select an account and start the tool.
`has -h x -s N` and `has -h c -s N` keep their switch-only meaning.
Explicit commands targeting the retired `.codex-pkls` home fail instead of recreating it.
For a custom Codex or Claude target, use `has run codex` or `has run claude` with the same pool and configuration directory.

## Replace toolbox commands

Toolbox 0.37.0 removed `codex-auth` and `claude-auth`. A `codex-auth` function in
`~/.zshenv` that calls the removed script will fail, along with `codex-pkls` and
other aliases that use it. Use the installed `has` command for these account tasks.
Edit `~/.zshenv` only when the user explicitly requests that change.

On an explicit migration request, import the user's chosen pool directory with
`has import --from DIRECTORY`. The old default was `~/.config/xiyo/toolbox/`.
If it is already imported, use the existing HA Switch configuration.

| Old shell command | HA Switch command |
| --- | --- |
| `codex-pkls` | `has x` |
| `codex-pkls-N` | `has x -s N -- ARGS` |
| `codex-switch NUMBER` | `has switch NUMBER` |

Resolve `N` or `NUMBER` from `has switch --local`, using the same pool and
configuration directory. Numbers start at 1. If several pools exist, use `--pool NAME`.
`has c -s N` follows the same selection and launch rule for Claude.

`has x` uses `~/.codex` with `CODEX_HOME` unset. `has c` uses `~/.claude` with
`CLAUDE_CONFIG_DIR` unset. They use the native home's settings, plugins, MCP
credentials, and history. They do not copy configuration from a pool home.

Shortcuts add Codex's `--dangerously-bypass-approvals-and-sandbox` and
`--dangerously-bypass-hook-trust`, or Claude's `--dangerously-skip-permissions`.
An existing Codex `--yolo` counts as the approval flag. Managed flags are not duplicated.
Use `--safe` to remove these flags from pool and forwarded arguments; native
permission settings still apply. Native arguments after their own `--` stay literal.
Use `has x --dry-run` or `has c --dry-run` to inspect arguments without credential
reads or writes. Launch only when the user requests it.

Import preserves pool `args`, which precede arguments forwarded after `--`.
Options kept only in old shell functions are not imported.

The `.codex-pkls` execution home is retired. Legacy commands targeting it fail
with `pool_home_retired` and must not recreate it. On an explicit configuration
migration request, set pool `home` to `.codex`, keeping the source account list.
The pool name `pkls` may remain; it selects configuration, not a separate home.
Use `has switch codex N` or `has x --account N` for the native home.

## Setup and recovery

- On an explicit setup request, use `has init` to discover existing Codex and Claude profiles without switching accounts.
- Import an explicitly chosen configuration directory with `has import --from DIRECTORY`.
- Save the current Antigravity login with `has -c a LABEL` or `has --create antigravity LABEL` only when the user asks to save it. This saves an existing login; it does not start sign-in. Codex and Claude registration is not supported.
- Use `has restore` for the native Codex home, or `has restore codex`, `has restore claude`, or `has restore agy` when the user asks to restore a saved login.
- Use `has sync` only when synchronization is part of the request; it can write saved login copies.
- Report a CLI failure by its safe error code. Do not repair it by editing native login files, reading keychain secrets, or changing unrelated settings.

The CLI owns native credential reads, backups, validation, and replacement.
Configuration stays under `~/.config/ha-switch/` unless the user selects another directory.
The skill has no marketplace, toolbox, or MCP dependency.

[^install]: [HA Switch installation guide](https://github.com/bunny-holes/ha-switch#install-cli).

`has restore c --pool NAME` restores the shortcut Claude home.
`has restore claude --pool NAME` keeps restoring the configured pool home.

## Automatic Codex selection

Without `--account` or `-s`, `has x` queries the same native usage as `has -h x`.
Among accounts 2 and 3, choose the largest 5-hour remaining usage when at least
10% remains. Weekly usage breaks ties, then configured priority order. Limited,
signed-out, and failed-query rows are not candidates. Unknown 5-hour remaining
usage cannot prove the threshold and is not eligible.
If neither qualifies, account 1 needs known weekly remaining usage above 20%.
Otherwise stop with `no_available_account` and “사용 가능한 계정 없음”; never launch.
An explicit account selection skips automatic usage selection.

Pool `selection` can set `priority`, `minimumFiveHourRemaining`, `fallback`, and
`minimumFallbackWeeklyRemaining`. Do not alter these values without a user request.
Before replacing slot 0, preserve its refreshed login in the matching account source.
The original slot-1 login is kept separately under HA Switch configuration after
slot 0 first becomes a target. Reject mixed account/token identity and changed state.

A launch is ready when the new session has loaded its selected login. Then the
next terminal may be started; existing sessions may stay open. Do not wait for
them to exit, and do not overlap the switch or startup steps.

## macOS keychain access

Keychain lock and process security-session access are separate conditions.
`keychain_locked` reports a confirmed locked keychain. Run
`security unlock-keychain ~/Library/Keychains/login.keychain-db` and enter the
password only at its prompt.

`keychain_no_gui_session` reports that the calling macOS security session cannot
show an approval window. Use a normal Mac Terminal. A Herdr server started in a
remote session keeps that session even after a local client attaches; new panes
inherit it. Reloading shell settings with `source` or clearing SSH environment
variables does not change the macOS security session. Do not stop an existing
Herdr server or its agents without the user's explicit instruction.

If native status cannot identify the condition, report
`keychain_interaction_not_allowed` without claiming that the keychain is locked.
Denied access and missing items have separate guidance. Keep existing access
controls; do not grant unrestricted access or export credentials.

`has -h c` keeps configured account labels visible when keychain access fails,
shows usage and current selection as unknown, and prints one recovery message.
Previous usage is not cached, so no last confirmed balance is available while
credential access is blocked. Missing entries show signed-out state. Switching
still fails before credential writes when preflight reads are blocked.
