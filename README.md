---
uuid: 01a129d8-4ffd-70be-80f2-0b071d3cecc9
type: guide
audience: People switching between saved work and personal coding-agent accounts.
goal: List and switch Codex, Claude Code, and Antigravity accounts on macOS with Bun.
tone: Plain English with short instructions and exact commands.
manner: Explain account behavior and data boundaries before development details.
---

# HA Switch

See the current account and available usage, then switch Codex, Claude Code, or Antigravity CLI
by number. HA means Harness Account. This first release supports macOS.

[한국어](README.ko.md)

## Run

```bash
bunx @bunny-holes/ha-switch
```

You need Bun 1.4.2 or later and the native `codex`, `claude`, or `agy` command.
Sign in with Codex and Claude accounts in their native profiles first.
For Antigravity, save each login under a label after signing in with `agy`.
No global package installation is required.

## First use

Create configuration from the Codex and Claude profiles already on your computer:

```bash
bunx @bunny-holes/ha-switch init
bunx @bunny-holes/ha-switch list
```

`init` writes local configuration without switching accounts.
Codex uses a separate `.codex-ha-switch` target so its source profiles stay intact.
Claude keeps the target profile's settings and replaces only its login and account metadata.
If you already have pool configuration from toolbox, import that directory:

```bash
bunx @bunny-holes/ha-switch import --from <directory>
```

Import preserves the source configuration and saved accounts. It refuses different destination
configuration. Existing Claude account snapshots are copied into HA Switch's keychain names.

While signed in to an Antigravity account, save it once:

```bash
bunx @bunny-holes/ha-switch save agy personal
```

Sign in to another account with `agy`, then save it under another label:

```bash
bunx @bunny-holes/ha-switch save agy work
bunx @bunny-holes/ha-switch list agy
bunx @bunny-holes/ha-switch switch agy 1
```

## Commands

| Result | Command after `bunx @bunny-holes/ha-switch` |
| --- | --- |
| Show all configured accounts and usage | `list` |
| Show Codex accounts and usage | `list codex` |
| Show Claude accounts and usage | `list claude` |
| Show saved Antigravity accounts | `list agy` |
| Read local account labels without usage requests or writes | `list --local` |
| Switch Codex to account number 2 | `switch codex 2` |
| Switch Claude to account number 1 | `switch claude 1` |
| Switch Antigravity to account number 2 | `switch agy 2` |
| List accounts before choosing a number | `switch codex` |
| Synchronize saved login copies | `sync` |
| Restore Codex's account from before its first switch | `restore codex` |
| Restore Claude's previous account | `restore claude` |
| Restore Antigravity's account from before its first switch | `restore agy` |
| Save the current Antigravity login | `save agy <label>` |
| Start Codex with the selected pool | `run codex -- resume` |
| Select an account before starting Codex | `run codex --account 2 -- resume` |
| Start Claude with the pool's current login | `run claude` |
| Start Antigravity with its current login | `run agy` |
| Create local configuration from existing profiles | `init` |
| Import existing pool configuration and Claude snapshots | `import --from <directory>` |

Use `--pool <name>` when you have several pools for the same tool.
Use `--config-dir <directory>` to select another configuration directory.
`--version` prints the installed package version.

The table shows the current account, plan, status, five-hour remainder and reset time,
weekly remainder and reset time, and available reset credits. Missing values stay unknown.
A query failure stays visible in its account row. Reset credits are never consumed.

## Configuration

The default directory is `~/.config/ha-switch/`. Set `HA_SWITCH_CONFIG_DIR` to change it.
Account order in each file is the numbering used by `switch`.

`codex-pools.json`:

```json
{
  "default": {
    "home": ".codex-ha-switch",
    "accounts": [".codex-personal", ".codex-work"],
    "args": []
  }
}
```

`claude-pools.json`:

```json
{
  "default": {
    "home": ".claude",
    "accounts": ["personal", "work"],
    "from": { "personal": ".claude-personal", "work": ".claude-work" }
  }
}
```

Paths are resolved from your home directory. Absolute paths also work.
Pool configuration stores paths and labels, never login tokens.

`agy-pools.json` is created by `save agy`. Its `accounts` list contains the saved labels.

## Check the result

Run `list codex`, `list claude`, or `list agy` after switching. The current account has a check mark.
`list --local` skips network requests and login synchronization.
Normal Codex listing can refresh expired logins and synchronize their saved copies.
Claude listing synchronizes saved copies; use Claude itself to refresh an expired login.

## Data and limits

Codex copies native `auth.json` login data into the target profile and queries usage through the
installed app-server. Claude and Antigravity use their native macOS keychain formats. Saved logins
and login backups are kept in the keychain. No custom encrypted vault is created.
Profile directories are not replaced. Settings, plugins, MCP credentials, and history stay in place.
An already-running agent process can retain the login it loaded. Use the switched account on the
next native launch.

Antigravity CLI quotas are not queried yet; unavailable quota values remain unknown.
Antigravity IDE switching is not included. Gemini CLI is not a supported host.
Claude Console profiles, cloud-provider credentials, and Codex keyring-only logins are outside this
first release. Windows and Linux adapters will need separate validation.

The adapters use the native account formats described in the
[Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) and
[Claude Code authentication documentation](https://code.claude.com/docs/en/authentication).
Antigravity's native storage is described in its
[authentication documentation](https://github.com/google-antigravity/antigravity-cli#authentication).

## Development

Source code is TypeScript. The npm package contains one executable, both READMEs, package metadata,
and the license. No private profile data or development dependencies are shipped.

```bash
bun install
bun run format
bun run check
bun scripts/build.ts /tmp/ha-switch.tgz
```
