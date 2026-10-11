

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
Open sessions keep their loaded login.
Use `has switch --local` to list the native Codex home and `has switch N` to select it.
Use `has x -s N` or `has c -s N` to select an account and start the tool.
`has -h x -s N` and `has -h c -s N` keep their switch-only meaning.
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

For an old pkls session, keep `has run codex --pool pkls -- resume ID`.
That compatible command keeps the pool home and arguments without adding shortcut
flags. `has -h x --pool pkls -s N` still switches only the pkls target.
Session records stay in their original homes; shortcuts do not move them.

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
