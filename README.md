

<div align="center">

<img src="https://raw.githubusercontent.com/bunny-holes/ha-switch/main/assets/ha-switch.svg" width="112" height="112" alt="HA Switch logo: two account cards linked by arrows">

# HA Switch

**One command to switch your coding account.**

Codex · Claude Code · Antigravity CLI

[![Release](https://img.shields.io/github/v/release/bunny-holes/ha-switch?style=flat-square&color=65dbc9)](https://github.com/bunny-holes/ha-switch/releases/latest)
[![Check](https://github.com/bunny-holes/ha-switch/actions/workflows/check.yml/badge.svg)](https://github.com/bunny-holes/ha-switch/actions/workflows/check.yml)
![macOS](https://img.shields.io/badge/macOS-only-172438?style=flat-square&logo=apple&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.4.2-ffb083?style=flat-square&logo=bun&logoColor=172438)
[![License](https://img.shields.io/badge/license-MIT-65dbc9?style=flat-square)](LICENSE)

[English](README.md) · [한국어](README.ko.md) · [Downloads](https://github.com/bunny-holes/ha-switch/releases/latest)

</div>

List saved accounts and switch by number. Keep your settings, plugins, MCP credentials, and history.
HA means Harness Account.

| Tool | Select with | Switch saved accounts | Usage in `has` |
| --- | --- | --- | --- |
| 🤖 Codex | `-h x` | ✅ | ✅ |
| ✳️ Claude Code | `-h c` | ✅ | ✅ |
| 🚀 Antigravity CLI | `-h a` | ✅ | Not yet |

> [!NOTE]
> Sign in with each tool first. `has` switches saved accounts.
> `-c` saves the current Antigravity login; it does not open a new sign-in.

## 📦 Install CLI

GitHub Releases provide the CLI package and a separate agent skill.
Install Bun 1.4.2 or later, then install the CLI package from its release URL.[^bun-add]

```bash
bun add --global --ignore-scripts https://github.com/bunny-holes/ha-switch/releases/download/v0.1.0/ha-switch-0.1.0.tgz
export PATH="$(bun pm bin --global):$PATH"
has --help
has --version
```

The command is `has`; the package name stays `@bunny-holes/ha-switch`.
You also need the native `codex`, `claude`, or `agy` command for the tools you use.
The published v0.1.0 package predates `has x` and `has c`. Until the next release,
build and install from source using the Development section below.

## ⚡ Run

The executable is `has`. With no options, it shows help.

```bash
has
has --list
has x
has c -s 2
has x -- resume
has x --safe
```

Before installing a release, use `bun src/bin.ts` in this repository in place of `has`.

Sign in with Codex and Claude accounts in their native profiles first.
For Antigravity, save each login under a label after signing in with `agy`.

`has x` starts Codex in `~/.codex`, with `CODEX_HOME` unset. `has c` starts Claude
in `~/.claude`, with `CLAUDE_CONFIG_DIR` unset. Each shortcut applies the selected
account to that native home. One pool is chosen automatically; several require
`--pool NAME`. Use `--account N` or `-s N` to select one account before launch.
Without a number, the shortcut keeps the native home's selected account when it
is in the pool, then falls back to the existing pool selection on first use.
If neither login is in the pool, choose an account number explicitly.

The shortcuts add these native flags, once each:

| Shortcut | Flags added |
| --- | --- |
| `has x` | `--dangerously-bypass-approvals-and-sandbox` (or an existing `--yolo`), `--dangerously-bypass-hook-trust` |
| `has c` | `--dangerously-skip-permissions` |

`--safe` removes these flags, including copies in pool arguments. Native permission
settings still apply. `has x --dry-run` and `has c --dry-run` show the launch
arguments without reading or writing credentials or starting the native CLI.
Arguments after `--` go to the native CLI. For example, `has c -s 2 -- --resume`
opens Claude's resume picker after selecting account 2.

## 🧩 Install the agent skill

The optional `has` skill uses the installed CLI. It needs no marketplace or MCP server.
For Codex, install it under `~/.agents/skills/` and invoke `$has`.[^codex-skills]
For Claude Code, use `~/.claude/skills/` instead and invoke `/has`.[^claude-skills]

```bash
has_skill_archive="$(mktemp -d)/has-skill-0.1.0.tgz"
curl -fL https://github.com/bunny-holes/ha-switch/releases/download/v0.1.0/has-skill-0.1.0.tgz -o "$has_skill_archive"
mkdir -p "$HOME/.agents/skills"
test ! -e "$HOME/.agents/skills/has" && tar -xzf "$has_skill_archive" -C "$HOME/.agents/skills"
```

The last command refuses to replace an existing `has` skill. Keep that folder until you choose to update it.
The skill is a separate download; installing the CLI does not install the skill.

## 🏁 First use

Create configuration from the Codex and Claude profiles already on your computer:

```bash
has init
has switch --local
```

`init` writes local configuration without switching accounts.
Start Codex with `has x` and Claude with `has c`. These use one native home per tool.
Before the first native Codex switch, a source account stored in `~/.codex` is
preserved under `~/.config/ha-switch/codex-accounts/native/auth.json`.
The native home's login backup remains `~/.codex/auth.json.ha-switch-backup`.
Other source profiles stay separate from the target. Claude keeps saved accounts
in the macOS keychain and replaces only login and account metadata in the native home.
`init` retains a `.codex-ha-switch` target for the compatible `has run codex` path.
If you already have pool configuration from toolbox, import that directory:

```bash
has import --from <directory>
```

Import preserves the source configuration and saved accounts. It refuses different destination
configuration. Existing Claude account snapshots are copied into HA Switch's keychain names.

While signed in to an Antigravity account, save it once:

```bash
has -c a personal
```

Sign in to another account with `agy`, then save it under another label:

```bash
has -c a work
has -h a
has -h a -s 1
```

## 🔄 Move from toolbox

Toolbox 0.37.0 removed `codex-auth` and `claude-auth`. A `codex-auth` function in
`~/.zshenv` that calls the removed script will fail, along with `codex-pkls` and
other aliases that use it. Use `has` for saved account switching and launches.

If you have not imported your old pool configuration yet, its default location was:

```bash
has import --from "$HOME/.config/xiyo/toolbox"
```

Use the directory that holds your existing pool files. Import keeps the originals
and preserves each pool's `args`. If you already imported them, use that configuration.

| Old shell command | HA Switch command |
| --- | --- |
| `codex-pkls` | `has x` |
| `codex-pkls-N` | `has x --account N -- ARGS` (or `has x -s N -- ARGS`) |
| `codex-switch` | `has switch` |
| `codex-switch NUMBER` | `has switch NUMBER` |
| `claude-auth` launch wrapper | `has c` or `has c -s N` |

Replace `N` or `NUMBER` with the number shown by `has switch --local`.
Numbers start at 1 within that pool. Replace `ARGS` with native Codex arguments, or
omit `-- ARGS` when none are needed. For example:

```bash
has x -s 2 -- resume
has switch 2
```

Both shortcuts preserve pool `args`, such as `-c web_search=live`, before the
arguments after `--`. Existing `--yolo` counts as Codex's approval bypass flag;
the shortcut adds the hook trust flag if it is missing. Options kept only in an
old shell function are not imported. `has run` keeps its existing flag behavior.

Existing `has run codex --pool pkls -- resume ID` and `has -h x --pool pkls -s N`
still use the configured `.codex-pkls` home. Keep this path to resume sessions in
that home. `has x` does not move or delete its settings, plugins, sessions, or login.
The first shortcut switch preserves the native source account separately; compatible
pool commands use that saved source afterward so account numbers keep their identities.

The single home uses `~/.codex/config.toml`; it does not copy the old pool's settings.
A migration check found default reasoning effort `low` versus `medium` in `pkls`,
different enabled `code-review`/`workbench` plugins, 126/128 trusted projects, and
40/2 `hooks.state` entries. These are local differences, not HA Switch defaults.
To use medium effort on shortcut launches, include `"-c", "model_reasoning_effort=medium"`
in the pool's `args`, as shown below. Plugins, project trust, hooks, and old session
records stay in their original homes. `has restore` restores the native Codex login;
`has restore codex --pool pkls` restores the compatible pool login.

## 🎛️ Commands

| Result | Command after `has` |
| --- | --- |
| Show help | `--help` |
| Show all configured harnesses, profiles, current selections and usage | `--list` |
| Show Codex profiles and usage | `-h x` |
| Show native Codex profiles and usage | `switch` |
| Show Claude profiles and usage | `-h c` |
| Show saved Antigravity profiles | `-h a` |
| Read local profile labels without usage requests or writes | `--list --local` |
| Switch native Codex to profile number 2 | `switch 2` |
| Switch the compatible Codex pool target | `-h x -s 2` |
| Switch Claude to profile number 1 | `-h c -s 1` |
| Switch Antigravity to profile number 2 | `-h a -s 2` |
| Synchronize saved login copies | `sync` |
| Restore native Codex's account from before its first switch | `restore` |
| Restore the compatible Codex pool target | `restore codex` |
| Restore Claude's previous account | `restore claude` |
| Restore Antigravity's account from before its first switch | `restore agy` |
| Save the current Antigravity login | `-c a <label>` |
| Start Codex in the native home | `x -- resume` |
| Select an account before starting Codex | `x -s 2 -- resume` |
| Start Claude in the native home | `c` |
| Select an account and resume Claude | `c -s 2 -- --resume` |
| Start a shortcut without bypass flags | `x --safe` or `c --safe` |
| Inspect shortcut arguments without touching logins | `x --dry-run` or `c --dry-run` |
| Start the compatible pool target | `run codex -- resume` or `run claude` |
| Start Antigravity with its current login | `run agy` |
| Create local configuration from existing profiles | `init` |
| Import existing pool configuration and Claude snapshots | `import --from <directory>` |

A harness is one of these coding tools. Use `-h` or `--harness` to choose it:
`c` or `claude`, `x` or `codex`, and `a` or `antigravity`. The native name `agy` also works.
Use `-s` or `--switch` to choose a profile number. For example,
`has --harness claude --switch 2` selects Claude profile 2.
With `has x` or `has c`, `-s N` is an alias for `--account N` and also starts the tool.
`has -h c -s N` only switches the configured target; plain `claude` uses that login
when the target is the default `~/.claude` home.
Use `--help` for help; `-h` selects a harness.
Use `-c` or `--create` with a harness and label to save the current Antigravity login:
`has --create antigravity personal`. This option saves an existing login without starting sign-in.
Codex and Claude account registration is not supported. `has save agy <label>` still works.

Use `--pool <name>` when you have several pools for the same tool.
Use `--config-dir <directory>` to select another configuration directory.
`--version` prints the installed package version.

The table shows the current account, plan, status, five-hour remainder and reset time,
weekly remainder and reset time, and available reset credits. Missing values stay unknown.
A query failure stays visible in its account row. Reset credits are never consumed.

## ⚙️ Configuration

The default directory is `~/.config/ha-switch/`. Set `HA_SWITCH_CONFIG_DIR` to change it.
Profile numbers follow account order within each pool's configuration.

<details>
<summary>Pool configuration examples</summary>

`codex-pools.json`:

```json
{
  "default": {
    "home": ".codex-ha-switch",
    "accounts": [".codex-personal", ".codex-work"],
    "args": ["-c", "model_reasoning_effort=medium"]
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
`home` remains the target for compatible `run`, `-h`, and explicit host commands.
`x` and `c` use the native home while keeping account order, source paths, and `args`.

`agy-pools.json` is created by `has -c a <label>`. Its `accounts` list contains the saved labels.

</details>

## ✅ Check the result

Run `has switch --local` after a native Codex switch. For configured pool targets,
use `has -h x`, `has -h c`, or `has -h a`. `*` marks the current profile.
`has --list --local` skips network requests and login synchronization.
Normal Codex listing can refresh expired logins and synchronize their saved copies.
Claude listing reads logins without changing them. Use `sync claude` to synchronize saved copies,
and Claude itself to refresh an expired login.

## 🔐 Data and limits

Codex copies native `auth.json` login data into the target profile and queries usage through the
installed app-server. Claude and Antigravity use their native macOS keychain formats. Saved logins
and login backups are kept in the keychain. No custom encrypted vault is created.
Claude keeps one login copy per saved account and one restore copy per pool.
These copies let it preserve an account when the target profile's login changes.
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

## 🛠️ Development

<details>
<summary>Build and validate from source</summary>

Source code is TypeScript. The CLI package contains one executable, both READMEs, package metadata,
and the license. No private profile data or development dependencies are shipped.
The skill archive contains `has/SKILL.md`, its UI metadata, and the license.

```bash
bun install
bun run format
bun run check
bun scripts/build.ts /tmp/ha-switch-local.tgz
bun add --global --ignore-scripts /tmp/ha-switch-local.tgz
```

For release artifacts, `bun run pack:release /tmp/ha-switch-release-0.1.0` writes
`ha-switch-0.1.0.tgz`, `has-skill-0.1.0.tgz`, and `SHA256SUMS`.
It builds in temporary directories and refuses to replace existing release files.
`bun scripts/build.ts /tmp/ha-switch.tgz` still builds only the CLI package.

</details>

[^bun-add]: [Bun's global and tarball installation documentation](https://bun.sh/docs/pm/cli/add).
[^codex-skills]: [Codex skill directories and invocation](https://learn.chatgpt.com/docs/build-skills).
[^claude-skills]: [Claude Code skill installation and invocation](https://code.claude.com/docs/en/skills).

`has restore c --pool NAME` restores the shortcut Claude home.
`has restore claude --pool NAME` keeps restoring the configured pool home.
