ATLAS 0.6.5 adds Workbench, task queues, checkpoint recovery, provider approvals, and project tools, alongside usage indicators and a floating code change editor.

- Open **Workbench** for a persistent task queue with reordering, retries, and optional pauses between tasks. Queues pause after restarting the app and when a task or its configured checks fail.
- Discover existing Codex and Claude plugins, Codex skills and connectors, and supported MCP sign-in flows. Claude plugins can be enabled or disabled through the provider's shared configuration. Desktop-only plugins and unsupported connection forms still require the provider app.
- Review task checkpoints and restore pre-task working files, with checks that protect later edits and a recovery snapshot to undo the restore. Binary or large originals require Git recovery; Git commits and staging are preserved.
- Answer supported Codex command/file/access requests, Claude tool permissions, and provider questions inside ATLAS. A badge appears when input is needed. Existing provider allow rules and the explicit permission-bypass setting still apply.
- Choose Colab roles: Codex builds and Claude reviews, the reverse, or independent proposals followed by implementation and review. Reviewer passes use read-only settings.
- Set up project profiles with detected project types, suggested dependency commands, optional local Git initialization, and opt-in completion checks. Check output and real exit codes are saved in task details. Stopping during checks now preserves cancelled status.
- Search saved chats, attachment names, locally available provider transcripts, and retained task commands/file activity across projects.
- Bottom-left Claude and Codex usage circles show available account limits, detailed reset information, and links to the providers' usage pages. Unavailable or stale readings are clearly marked.
- A bottom-of-screen change bubble shows added/removed lines and opens a movable, resizable editor with file diffs and explicit text saves. Fixed the editor script's initialization error.
- The effort popup now uses a smaller ATLAS design with a slim teal slider and text Reset control.
- Fixed Windows path aliases in snapshot exclusions and suppressed PowerShell startup progress noise in completion checks.
- Includes the photo previews, Ctrl+V screenshots, live task activity, Windows completion alerts, and unlimited runtime defaults from earlier releases.

Install over your existing version to preserve settings and conversations, or use Settings → App updates → Check for updates, then Download and Restart and install. Windows x64.
