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

See your saved accounts and their remaining usage, then open the right one with one command.
Settings, plugins, MCP credentials, and history stay where they are.
HA means Harness Account.

| Tool | `TOOL` | Shared-home switch | Isolated run | Usage in `has` |
| --- | --- | --- | --- | --- |
| 🤖 Codex | `codex` or `x` | ✅ | ✅ | ✅ |
| ✳️ Claude Code | `claude` or `c` | ✅ | ✅ | ✅ |
| 🚀 Antigravity CLI | `agy` or `a` | ✅ | Not documented upstream | Not yet |

> [!NOTE]
> `has add codex NAME` and `has add claude NAME` open the official sign-in for a new profile.
> `has add agy NAME` saves the Antigravity login you already made with `agy`.

## 📦 Install CLI

GitHub Releases provide the CLI package and a separate agent skill.
Install Bun 1.4.2 or later, then install the CLI package from its release URL.[^bun-add]

```bash
bun add --global --ignore-scripts https://github.com/bunny-holes/ha-switch/releases/download/v0.1.0/ha-switch-0.1.0.tgz
export PATH="$(bun pm bin --global):$PATH"
has -h
has --version
```

The command is `has`; the package name stays `@bunny-holes/ha-switch`.
You also need the native `codex`, `claude`, or `agy` command for the tools you use.
The published v0.1.0 package predates this command surface. Until the next release,
build and install from source using the Development section below.

## ⚡ Five commands

```text
has
has list [TOOL] [--usage] [--json]
has run TOOL [SELECTOR] [--safe] [--isolated] [-- ARGS...]
has switch TOOL [SELECTOR]
has add TOOL NAME
has restore TOOL
```

| You want to | Type |
| --- | --- |
| See every account and the last known usage | `has` |
| Open Codex on the account with the most usage left, in `~/.codex` | `has run codex` |
| Open Claude with whatever `~/.claude` is signed in as | `has run claude` |
| Open a named account in the shared home | `has run claude work -- --resume` |
| Open another account next to it, in this terminal only | `has run claude work --isolated` |
| Change the shared login without opening anything | `has switch codex personal` |
| Go back to the previous selection | `has switch codex -` |
| Refresh live usage | `has list --usage` |
| Register a new account | `has add codex work` |
| Put back the login from before the first switch | `has restore codex` |

`-h` and `--help` always print help. Before a release, run `bun src/bin.ts` in this
repository in place of `has`.

### Dashboard: `has`

With no arguments, `has` prints one screen and exits. It reads your configuration, the
last recorded shared selection, and the last cached usage. It never reads the keychain,
never queries the network, and never waits for input.

```text
$ has
HA Switch 0.1.0 · local dashboard

TOOL    #  NAME      SHARED HOME       5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
codex   1  work      current · 4m ago  74%      in 1h     61%      in 2d     2        fresh · 4m ago
codex   2  personal  —                 0%       in 12m    18%      in 2d     0        limited · 4m ago
claude  1  work      unknown           42%      in 2h     ?        —         ?        stale · 2h ago
agy     1  personal  unknown           ?        —         ?        —         ?        unknown

Shared home is the last checked native login; isolated sessions are separate.
Run:     has run <tool> <name>
Live:    has list --usage
Switch:  has switch <tool> <name>
```

`SHARED HOME` is the account last seen in the tool's own home (`~/.codex`, `~/.claude`,
the Antigravity keyring). `current` carries the time of that check; `—` means the check
found another account; `unknown` means nothing has been checked yet. A login changed by
another app is not detected until the next `has list --usage`, `has switch`, or shared
`has run`.

`0%` and `0` are real values. `?` means unknown. `STATUS` separates `fresh`, `stale`
(older than an hour or past a reset time), `limited`, `query failed`, `signed out`, and
`unknown`. A failed query keeps the last good value and its age.

### List and live usage: `has list`

`has list` shows the same local data per tool with a `SOURCE` block. `--usage` queries
each tool: Codex through its app-server (`account/rateLimits/read`, never a model
request), Claude through its usage endpoint, Antigravity sign-in state only. One failed
row never hides the others; the exit code stays 0 and stderr gets one line per failure
plus a `Next:` command.

```text
$ has list claude --usage
Claude / default

#  NAME      SHARED HOME         5H LEFT  5H RESET  7D LEFT  7D RESET  CREDITS  STATUS
1  work      current · just now  42%      in 2h     63%      in 3d     1        fresh · just now
2  personal  —                   18%      in 1h     51%      in 3d     ?        query failed · 18m ago

SOURCE
1  ~/.config/ha-switch/profiles/claude/work
2  ~/.claude-sample
```

Narrow panes fold the table: the `SOURCE` block goes first, then `7D RESET`, then the
compact layout keeps `#`, `NAME`, `HOME`, `5H`, `RESET`, `7D`, `CR` and prints status
below the table. Long names are shortened with `…`.

### Open a tool: `has run`

| Input | What happens | Home |
| --- | --- | --- |
| `has run codex` | Picks an account by live usage and the pool's `selection` policy, replaces the shared login safely, starts Codex | `~/.codex` |
| `has run codex work` | Validates the named account, replaces the shared login, starts Codex. No usage query | `~/.codex` |
| `has run claude` | Starts Claude on the login already in the shared home. No keychain read | `~/.claude` |
| `has run claude work` | Replaces the shared login, starts Claude | `~/.claude` |
| `has run TOOL work --isolated` | Starts the tool on the account's own source folder. The shared login is untouched | configured source |
| `has run agy [NAME]` | Optionally switches the Antigravity keyring, then starts `agy` | native keyring |

Progress lines go to stderr; the tool's own stdout and exit code pass through unchanged.

```text
$ has run codex
Selecting Codex account by usage policy...
Codex: using work (74% left, resets in 1h).
Starting Codex in shared home...
```

Every run adds the pool's `args` and these approval flags once each, before the
arguments you pass after `--`:

| Tool | Flags added |
| --- | --- |
| Codex | `--dangerously-bypass-approvals-and-sandbox` (an existing `--yolo` counts), `--dangerously-bypass-hook-trust` |
| Claude | `--dangerously-skip-permissions` |

`--safe` omits the pool `args` and those flags, so the tool's own permission settings
apply. Arguments after `--` are always forwarded as written.

`--isolated` runs use `CODEX_HOME` or `CLAUDE_CONFIG_DIR`. They do not copy settings,
history, or plugins from the shared home, and they can run side by side. Antigravity
has no documented isolated login, so `run agy --isolated` is refused.

When a named shared Claude run cannot read the keychain (for example inside a pane
without a graphical security session), `has` writes nothing, starts nothing, and names
the isolated alternative:

```text
$ has run claude work
has: keychain_no_gui_session — 현재 실행 세션은 macOS 승인 창을 띄울 수 없습니다. …
Next: has run claude work --isolated
```

### Change the shared login: `has switch` and `has restore`

```text
$ has switch codex work
Codex: switched the shared home to work.
Open Codex sessions keep their current login.
Previous selection: personal. To go back: has switch codex -

$ has restore codex
Codex: restored the first pre-switch login.
Next: has
```

`switch TOOL -` returns to the previous successful shared selection. `restore TOOL`
returns the login that the shared home held before `has` first replaced it. They are
different: the backup is written once and later switches do not overwrite it. Processes
that already loaded a login keep it until they restart.

Before each switch, `has` writes the refreshed token back to its source, refuses mixed
account identities, re-reads the target right before writing, and replaces files
atomically. Run shared switches one at a time; never during a token refresh.

### Selectors

| Selector | Meaning |
| --- | --- |
| `-` | previous successful shared selection |
| `2` | row number shown by `has` and `has list`, counted per pool |
| `work` | exact name, case-insensitive |
| `wor` | a fragment that matches exactly one name |

Several matches open a numbered picker when both stdin and stdout are terminals.
Enter confirms, `q`, Ctrl-C, or Ctrl-D cancels with exit code 130 and no change. In
pipes, CI, with `--no-input`, or with `--json`, the command stops with
`selector_required` or `account_selector_ambiguous` and lists the candidates instead.

### Register an account: `has add`

```text
$ has add codex work
Opening official Codex login for work...
<official login flow>
Codex: signed in and saved as work.
Run: has run codex work
```

Codex runs `codex login` and Claude runs `claude auth login` with a new source folder
under `~/.config/ha-switch/profiles/<tool>/<name>`. The profile is registered only after
the sign-in is verified: Codex by the account in the new `auth.json`, Claude by
`claude auth status --json` reporting `loggedIn`, the `claude.ai` method, and that same
`configDirectory` (Claude Code 2.1.268 or later). The status output is checked in memory
and never printed. A taken name or an existing source folder is refused before the
sign-in starts. A cancelled or failed sign-in leaves configuration unchanged and the
folder in place for a retry.

`has add agy NAME` saves the Antigravity account that `agy` is currently signed in to.
It does not start a new sign-in.

### Options, exit codes, JSON

| Option | Applies to |
| --- | --- |
| `--pool NAME` | pick one pool when a tool has several |
| `--config-dir DIR` | use another configuration directory |
| `--usage` | `list` only; query live usage |
| `--json` | `has` and `list`; one schemaVersion 1 document on stdout |
| `--isolated`, `--safe` | `run` only |
| `--color auto\|always\|never` | default `auto`: color only on a terminal and when `NO_COLOR` is unset; `--color always` overrides `NO_COLOR` |
| `--no-input` | never open a picker |
| `-h`, `--help`, `-V`, `--version` | help and version |

| Exit code | Meaning |
| --- | --- |
| 0 | success, including lists with some failed usage queries |
| 1 | an operation failed: configuration, sign-in, native files, keychain |
| 2 | wrong command, option, or selector; ambiguous match; missing selector outside a terminal; a retired command |
| 130 | picker or sign-in cancelled |

Errors print `has: CODE — reason` and a `Next:` command on stderr. Unknown exceptions
never reveal their message; set `LOG_LEVEL=debug` for safe diagnostics.

`--json` rows carry `tool`, `pool`, `number`, `name`, `source` (absolute path or
`null`), `current` (`true`, `false`, or `null` when unchecked), `currentCheckedAt`,
`authenticated`, `plan`, `status`, `usage` with ISO reset times, `resetCredits`,
`usageFetchedAt`, `usageAgeSeconds`, and `queryError`. Errors are also one document:
`{"schemaVersion":1,"command":"list","error":{"code","message","next"}}`. Tokens,
account ids, email addresses, and raw responses never appear.

## 🔄 Moving from the old commands

The old top-level shortcuts and flags stop with exit code 2 and print the replacement.
Nothing is read or written.

| Old input | New input |
| --- | --- |
| `has x` | `has run codex` |
| `has c` | `has run claude` |
| `has x -s 2`, `has x --account 2` | `has run codex 2` |
| `has -h c` | `has list claude` (`-h` alone is help) |
| `has -h c -s 2` | `has switch claude 2` |
| `has -s 2`, `has switch 2` | `has switch codex 2` |
| `has -c a personal`, `has save agy personal` | `has add agy personal` |
| `has --list`, `has --list --local` | `has list` |
| `has run TOOL NAME` (source only) | `has run TOOL NAME --isolated` |
| `has restore` | `has restore codex` |
| `has x --dry-run`, `has sync` | removed; test a profile with `--isolated`, switching synchronizes saved logins |

Existing `~/.config/ha-switch/*-pools.json` files work unchanged: labels that are folder
names, `from` paths, `args`, and `selection` policies are all read as before. The
shared home is always the tool's native home; a pool `home` other than `.codex` or
`.claude` only tells `has` to keep a separate pre-switch backup. The retired
`.codex-pkls` home no longer blocks any command.

Shell aliases are a suggestion only; `has` never edits `~/.zshenv`:

```zsh
alias codex-auto='has run codex'
alias claude-current='has run claude'
alias claude-work='has run claude work --isolated --'
```

### Automatic Codex selection

`has run codex` without a selector queries live usage for each saved account, then
applies the pool's `selection` policy. Among priority accounts with at least the
five-hour minimum left, the larger five-hour remainder wins, then the weekly remainder.
Otherwise the fallback account needs more than the weekly floor. Failed queries and
unknown values never qualify. If every query failed the command stops with
`selection_usage_unavailable`; if nothing qualifies it stops with
`no_available_account`. Neither case switches or launches.

```json
{
  "priority": [2, 3],
  "minimumFiveHourRemaining": 10,
  "fallback": 1,
  "minimumFallbackWeeklyRemaining": 20
}
```

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

The last command refuses to replace an existing `has` skill. The skill is a separate
download; installing the CLI does not install the skill.

## 🏁 First use

Register each account with the official sign-in:

```bash
has add codex work
has add claude work
has
```

If Codex or Claude profile folders already exist in your home, `has init` can create
configuration from them without switching anything, and `has import --from DIRECTORY`
copies pool files from an older location. Both are maintenance commands outside the
daily help. `init` writes a `.codex-ha-switch` pool `home`; shared switching still
targets `~/.codex`.

Before the first native Codex switch, the login that `~/.codex` held is archived under
`~/.config/ha-switch/codex-accounts/native/auth.json`, and the native home's own backup
is `~/.codex/auth.json.ha-switch-backup`. Claude keeps saved accounts and its
pre-switch backup in the macOS keychain.

While signed in to an Antigravity account, save it once with `has add agy personal`,
sign in to the next account with `agy`, and save that one too.

## ⚙️ Configuration

The default directory is `~/.config/ha-switch/`. Set `HA_SWITCH_CONFIG_DIR` or pass
`--config-dir` to use another. Row numbers follow account order within each pool.
`has` also keeps `state.json` (last shared selections and check times) and
`usage-cache.json` (last usage values, reset times, and safe error codes) there. Neither
file holds tokens.

<details>
<summary>Pool configuration examples</summary>

`codex-pools.json`:

```json
{
  "default": {
    "home": ".codex",
    "accounts": ["work", "personal"],
    "from": { "work": ".codex-work", "personal": ".codex-personal" },
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
`agy-pools.json` is created by `has add agy NAME`; its `accounts` are the saved labels.

</details>

## 🔐 Data and limits

Codex copies native `auth.json` login data between source folders and the shared home
and queries usage through the installed app-server. Claude and Antigravity use their
native macOS keychain formats. Saved logins and login backups stay in the keychain. No
custom encrypted vault is created. Profile directories are never replaced. A running
agent process can keep the login it loaded; the switched account applies to the next
launch.

Antigravity CLI quotas are not queried yet. Antigravity IDE switching and Gemini CLI are
not included. Claude Console profiles, cloud-provider credentials, and Codex
keyring-only logins are outside this release. Windows and Linux adapters need separate
validation.

The adapters use the native account formats described in the
[Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) and
[Claude Code authentication documentation](https://code.claude.com/docs/en/authentication).
Antigravity's native storage is described in its
[authentication documentation](https://github.com/google-antigravity/antigravity-cli#authentication).

### macOS keychain access

Keychain lock and process security-session access are separate conditions.
`keychain_locked` reports a confirmed locked keychain. Run
`security unlock-keychain ~/Library/Keychains/login.keychain-db` and enter the
password only at its prompt.

`keychain_no_gui_session` reports that the calling macOS security session cannot
show an approval window. Use a normal Mac Terminal, or run that account with
`--isolated`. A Herdr server started in a remote session keeps that session even
after a local client attaches; new panes inherit it. Reloading shell settings or
clearing SSH variables does not change the macOS security session. Do not stop an
existing Herdr server or its agents without the user's explicit instruction.

If native status cannot identify the condition, `has` reports
`keychain_interaction_not_allowed` without claiming the keychain is locked. Denied
access and missing items have separate guidance. Existing access controls are kept.

`has list claude --usage` keeps the account rows when keychain access fails, shows
usage and the shared home as unknown, and prints one recovery line. Switching fails
before any write when its preflight reads are blocked.

## 🛠️ Development

<details>
<summary>Build and validate from source</summary>

Source code is TypeScript. The CLI package contains one executable, both READMEs, package
metadata, and the license. No private profile data or development dependencies are shipped.
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

Tests use synthetic homes, fake binaries, and fake keychains; they never switch a real
login.

</details>

[^bun-add]: [Bun's global and tarball installation documentation](https://bun.sh/docs/pm/cli/add).
[^codex-skills]: [Codex skill directories and invocation](https://learn.chatgpt.com/docs/build-skills).
[^claude-skills]: [Claude Code skill installation and invocation](https://code.claude.com/docs/en/skills).
