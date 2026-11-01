# Changelog

## 0.10.5 — 2 November 2026

- Adds chat folders and an archive to Assistant and Colab, with filtering and search that include them.
- Adds automatic backups of your local records, on by default: once a day, keeping the newest seven in the ATLAS data folder. They are compressed, not encrypted. Turn them off in **Backups and recovery**.
- Adds recovery cleanup to **Backups and recovery**, which shows old recovery copies and asks before deleting them. The copy needed to roll back and the newest record backups are kept.
- Adds edit and resend, and branch from a message. Both start a new chat and leave the original unchanged.
- Adds **Memory review**, a page for checking and removing what ATLAS remembers.
- Adds **Report a problem**, which prepares a report for you to read and opens a blank GitHub issue. ATLAS sends nothing itself.
- Adds an optional tray icon and global shortcut under **Settings > Startup**, both off by default. With the tray on, closing the window keeps ATLAS running.

## 0.10.4 — 1 November 2026

- Chats are no longer lost when their file is damaged: ATLAS keeps the damaged file, warns you and starts a new list instead of overwriting it. A file that cannot be read for another reason, such as being locked, is left alone.
- Removes the limits that silently deleted your first chat when you started the 101st, kept only the last 80 messages of a chat and cut saved messages at 12,000 characters.
- ATLAS now opens with a warning when its reminders and memories file is damaged, and explains any other start-up failure instead of running with no window.
- A failed backup restore now reports once and lets ATLAS open, rather than failing on every launch.
- Backups no longer refuse single files over 32 MiB. Records over the 256 MiB total limit no longer block **Restart and install**: ATLAS asks whether to update without backing them up.

## 0.10.3 — 1 November 2026

- Fixes **Restart and install**, which failed with an "Invalid package" error when copying the current version for recovery and so stopped every in-app update. Versions up to 0.10.2 cannot update themselves to this release: download its installer instead.
- Removes a partial recovery copy when preparing it fails, and gives a long reminder title its own error message.
- Adds `npm run release:check`, and a menu audit with sample records (`npm run test:menu-ui`), including a mode that accepts approvals in a throwaway project.

## 0.10.2 — 31 October 2026

- Groups the Tasks menu under Work, Review, Project, Context, Connect and Power tools, and aligns forms across its sections.
- Removes internal IPC prefixes from error messages, stops a reopened section appearing blank, and stops Revoke all reporting a false error.
- Labels Reminders, defaults When to the next hour and explains missing or past values. Preview load failures read clearly, viewport sizes are exact and tool results no longer show raw JSON.
- Adds installed stdio language-server definitions, references and diagnostics with per-project configuration and approval before launch.
- Adds saved browser interaction/assertion recipes, stop-on-failure execution, console error evidence and unsent evidence drafts in the local preview.
- Adds preview screenshot baselines, measured pixel comparisons and renderer/DOM/navigation profiling with matching-scenario baseline deltas.
- Adds Tasks > Power tools with direct access to twelve capabilities, and browser-change, measured-performance and verified-milestone workflow starters.
- Retains existing repair loops, isolated task workspaces, project memory, ranked context, checkpoint recovery, model routing and local-model support. No new packages or publisher collection are added.

## 0.10.1 — 30 October 2026

- Adds isolated project trials with comparison/export, project maps, ordered recipe instructions, context freshness, explicit provider handoffs, a review inbox, acceptance evidence, local solution search, offline preparation and reviewed bug-report export. See the work-session guide for bounds and review steps.

- Adds a request-context budget breakdown with explicit unknown image/session/tool costs, confirmed-session reuse of unchanged Assistant references, and a duplicate-history fallback fix.
- Adds optional one-attempt Fast-to-Strong Assistant repair after executed failing checks on changed files; reruns the configured checks and preserves manual/project model choices.
- Adds editable, revision-reviewed local milestone packets that open fresh unsent chats while retaining source history.
- Adds focused check-failure evidence and bounded local completion-check logs with preview/reveal controls. No dependencies or publisher telemetry added.

## 0.10.0 — 30 October 2026

- Adds interactive PowerShell terminals beside chat, multiple sessions, resizing and ANSI support. Fixes action-row overlap, dock alignment and input jumping below the prompt.
- Adds editable file tabs, line numbers, indentation, go-to-line, JSON formatting/checks, project find/replace, broader preview recipes and diagnostic exports.
- Adds selective diff sections, structured test results, tool-version preflight, task prerequisites and their graph, task comparisons, bounded repair attempts, completion evidence and verified recovery.
- Adds explained project context, static code intelligence, multi-root workspaces, PDF/DOCX text preview and PDF page selection.
- Adds confirmed service commands, a local Git panel, one-time-header HTTP requests, sensitive-context review, integration declarations and permission revocation.
- Adds managed-record backup/restore, reviewed storage cleanup and preserved-version recovery for later updates.
- Removes unreleased statistics and Insights prototypes. No publisher collection service or telemetry ships.
- Adds pinned node-pty, xterm, fit addon and PDF.js dependencies and their licence materials. Windows releases remain unsigned.

See the [README](README.md) and [feature guide](docs/SELECTED-POWER-UPGRADES.md) for locations, permissions and limits.

## 0.9.1 — 29 October 2026

Project image/file previews, live previews and visual feedback, named checkpoints, health checks and dependency maintenance. See the [historical release review](docs/RELEASE-0.9.1-REVIEW.md).
