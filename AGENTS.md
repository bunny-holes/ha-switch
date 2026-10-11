

# HA Switch repository

HA Switch lists and switches saved Codex, Claude Code, and Antigravity CLI accounts on macOS.
The source is TypeScript.
The Bun executable is published as `@bunny-holes/ha-switch` and runs with `bunx`.

- Put implementation in `src/` and tests in `tests/`.
- Keep runtime code independent of toolbox, marketplace caches, and author machines.
- Keep configuration under `~/.config/ha-switch/`; put no account data in this repository.
- Read existing implementations and official documentation before changing authentication adapters.
- Use the native credential format of each app. Keep Codex login files and macOS keychain credentials local.
- Back up the current login before replacing it. Validate the selected account before changing native state.
- Preserve native settings, plugins, sessions, MCP credentials, and unrelated keychain fields.
- Keep saved Claude and Antigravity logins in the macOS keychain; do not add a custom encrypted vault.
- Pass secrets through native keychain APIs, never command arguments, environment variables, logs, or temporary files.
- Preserve existing permissions and keychain access controls. Use atomic file replacement.
- Keep source accounts separate from a Codex pool target so switching cannot destroy an account source.
- Recheck affected state before writes; report detected changes instead of overwriting another login.
- Read credentials only for configured profiles. Reuse reads within a command and recheck write participants before changing them.
- Use the native Codex app-server for usage queries. Never start a model request to read account usage.
- Display remaining usage, reset times, and reset credits; distinguish zero, unknown, and query failure.
- Log safe boundary events with `[ha-switch:module:action]`; default to `warn`.
- Never print tokens, raw credential responses, or account identifiers in logs or tests.
- Use invented account labels, fake keychains, and temporary homes in tests.
- Verify live adapters with reversible synthetic credentials; never switch the developer's login during tests.
- Run `bun run format` for formatting and import cleanup, then `bun run check`.
- Keep repository Markdown without front matter. Store native skill metadata in JSON and add it only when building the installable skill.
- Build in a temporary directory and publish only the executable, package metadata, README, and license.
- Keep GitHub visibility private until the owner requests the final public transition.
- Keep other workers' changes. Each worker edits only its assigned files.
