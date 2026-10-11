---
uuid: 01a129d8-4ffd-70c0-a8df-760a6ac79b8e
type: changelog
audience: People checking changes in HA Switch before updating.
goal: Identify available commands and account-switching behavior in each release.
tone: Short English release entries stating observable behavior.
manner: Record shipped functionality without local account or machine details.
---

# Changelog

## Unreleased

## 0.1.0

- Run a standalone TypeScript account switcher with `bunx @bunny-holes/ha-switch`.
- List Codex, Claude Code, and Antigravity CLI accounts on macOS.
- Show available usage, reset times, and reset credits; distinguish unknown values and query failures.
- Back up the current login and switch by account number without replacing profile directories.
- Save Antigravity logins in the macOS keychain and restore the login from before the first switch.
- Import existing pool configuration and saved Claude accounts without removing originals.
- Preserve native settings, plugins, MCP credentials, and session history during account changes.
- Keep source code and runtime packaging independent of toolbox and marketplace installation caches.
