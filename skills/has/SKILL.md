

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
Codex's default pool uses a separate target directory. Launch it with `has run codex` to use the selected account.
For a custom Codex or Claude target, use `has run codex` or `has run claude` with the same pool and configuration directory.

## Setup and recovery

- On an explicit setup request, use `has init` to discover existing Codex and Claude profiles without switching accounts.
- Import an explicitly chosen configuration directory with `has import --from DIRECTORY`.
- Save the current Antigravity login with `has -c a LABEL` or `has --create antigravity LABEL` only when the user asks to save it. This saves an existing login; it does not start sign-in. Codex and Claude registration is not supported.
- Use `has restore codex`, `has restore claude`, or `has restore agy` when the user asks to restore a saved login.
- Use `has sync` only when synchronization is part of the request; it can write saved login copies.
- Report a CLI failure by its safe error code. Do not repair it by editing native login files, reading keychain secrets, or changing unrelated settings.

The CLI owns native credential reads, backups, validation, and replacement.
Configuration stays under `~/.config/ha-switch/` unless the user selects another directory.
The skill has no marketplace, toolbox, or MCP dependency.

[^install]: [HA Switch installation guide](https://github.com/bunny-holes/ha-switch#install-cli).
