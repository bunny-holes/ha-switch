

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

## ⚡ Run

The executable is `has`. With no options, it shows help.

```bash
has
has --list
has -h c -s 2
```

Before installing a release, use `bun src/bin.ts` in this repository in place of `has`.

Sign in with Codex and Claude accounts in their native profiles first.
For Antigravity, save each login under a label after signing in with `agy`.

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
has --list
```

`init` writes local configuration without switching accounts.
Codex uses a separate `.codex-ha-switch` target so its source profiles stay intact.
Start Codex with `has run codex` so it reads the selected account from that target.
Claude keeps the target profile's settings and replaces only its login and account metadata.
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

## 🎛️ Commands

| Result | Command after `has` |
| --- | --- |
| Show help | `--help` |
| Show all configured harnesses, profiles, current selections and usage | `--list` |
| Show Codex profiles and usage | `-h x` |
| Show Claude profiles and usage | `-h c` |
| Show saved Antigravity profiles | `-h a` |
| Read local profile labels without usage requests or writes | `--list --local` |
| Switch Codex to profile number 2 | `-h x -s 2` |
| Switch Claude to profile number 1 | `-h c -s 1` |
| Switch Antigravity to profile number 2 | `-h a -s 2` |
| Synchronize saved login copies | `sync` |
| Restore Codex's account from before its first switch | `restore codex` |
| Restore Claude's previous account | `restore claude` |
| Restore Antigravity's account from before its first switch | `restore agy` |
| Save the current Antigravity login | `-c a <label>` |
| Start Codex with the selected pool | `run codex -- resume` |
| Select an account before starting Codex | `run codex --account 2 -- resume` |
| Start Claude with the pool's current login | `run claude` |
| Start Antigravity with its current login | `run agy` |
| Create local configuration from existing profiles | `init` |
| Import existing pool configuration and Claude snapshots | `import --from <directory>` |

A harness is one of these coding tools. Use `-h` or `--harness` to choose it:
`c` or `claude`, `x` or `codex`, and `a` or `antigravity`. The native name `agy` also works.
Use `-s` or `--switch` to choose a profile number. For example,
`has --harness claude --switch 2` selects Claude profile 2.
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

`agy-pools.json` is created by `has -c a <label>`. Its `accounts` list contains the saved labels.

</details>

## ✅ Check the result

Run `has -h x`, `has -h c`, or `has -h a` after switching. `*` marks the current profile.
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
bun run pack:release /tmp/ha-switch-release-0.1.0
```

The release builder writes `ha-switch-0.1.0.tgz`, `has-skill-0.1.0.tgz`, and `SHA256SUMS`.
It builds in temporary directories and refuses to replace existing release files.
`bun scripts/build.ts /tmp/ha-switch.tgz` still builds only the CLI package.

</details>

[^bun-add]: [Bun's global and tarball installation documentation](https://bun.sh/docs/pm/cli/add).
[^codex-skills]: [Codex skill directories and invocation](https://learn.chatgpt.com/docs/build-skills).
[^claude-skills]: [Claude Code skill installation and invocation](https://code.claude.com/docs/en/skills).
