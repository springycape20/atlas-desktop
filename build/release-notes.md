ATLAS 0.10.2 adds Power tools and makes the Tasks menu easier to use.

- **Power tools:** open **Tasks > Power tools** for direct access to twelve project capabilities, with new starters for browser-change checks, measured performance and verified milestones.
- **Code intelligence:** configure a language server you have already installed for definitions, references and diagnostics. It starts only after approval and runs as an ordinary process, not in an operating-system sandbox. Navigation and diagnostics only; ATLAS does not install servers.
- **Browser checks and visual review:** save click, fill and assert steps for the local preview, stop on the first failure, and compare screenshots with measured pixel changes. Browser fill values are stored as plain text, so use fixture data. Screenshot baselines last only for the session.
- **Preview profiling:** measure preview CPU, memory, DOM and navigation against a matching baseline. This covers the preview renderer, not backend processes.
- **Menus:** Tasks sections are grouped under Work, Review, Project, Context, Connect and Power tools, with aligned forms and clearer Reminders.
- **Fixes:** error messages no longer show internal prefixes, reopened sections no longer appear blank, Revoke all no longer reports a false error, preview failures read clearly, viewport sizes are exact and tool results no longer show raw JSON.
- **Packaging:** no new dependencies or publisher telemetry. The existing unsigned-release policy remains in effect.

Install over your existing version to preserve conversations and settings. Packaged installations can use **Settings > App updates > Check for updates**, then download and restart to install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.
