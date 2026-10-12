

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
Without a number, Codex chooses account 2 or 3 with at least 10% of its 5-hour
usage remaining, preferring the larger remainder. If neither qualifies, account 1
needs more than 20% weekly remaining. Otherwise it exits without launching.
Unknown required usage or a failed query cannot qualify. Claude keeps its current
configured account. Explicit account numbers skip automatic usage selection.

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

The old `.codex-pkls` target is retired. Legacy execution, switching, sync, and
restore paths targeting it fail with `pool_home_retired`; they never recreate it.
Set the pool `home` to `.codex` and retain its account source list. The pool name
`pkls` can remain as a configuration name; it no longer implies a separate home.
Use `has switch codex N` and `has x --account N` for native-home selection.

Treat `~/.codex` as replaceable slot 0. Slots 1, 2, and 3 retain their own account
sources. The original `.codex` source is archived separately before slot 0 is
replaced. Before switching, updated login tokens are synchronized back to the
matching source. `*` marks the account currently applied to the native home.

Switch and launch one terminal at a time. Complete one before starting another;
never run these operations concurrently or during an authentication refresh.
Open sessions keep their loaded login. HA Switch rechecks changed state, rejects
mixed account/token identities, and checks the selected account before launch.
It cannot prevent a separate Codex process from writing the shared login file.

The single home uses `~/.codex/config.toml`; settings are not copied from old homes.
Use pool `args` for explicit overrides, such as `"-c", "model_reasoning_effort=medium"`.
`has restore` restores the native Codex login.

### Automatic Codex selection

The same usage values and status rules drive `has -h x` and automatic selection.
Among eligible priority accounts, higher 5-hour remaining usage wins, then weekly
remaining usage, then configured order. Query failures and unknown required usage
cannot qualify. Account 1 at 20% weekly remaining or below is not eligible.
Failure prints `no_available_account` and “사용 가능한 계정 없음”, returns 1,
and does not switch or launch.

Configure each pool's optional `selection` object:

```json
{
  "priority": [2, 3],
  "minimumFiveHourRemaining": 10,
  "fallback": 1,
  "minimumFallbackWeeklyRemaining": 20
}
```

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
| Restore a configured non-retired Codex target | `restore codex --pool NAME` |
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
