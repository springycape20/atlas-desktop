ATLAS 0.6.7 adds a cleaner sidebar and computer-control integrations for Codex and Claude.

- Matching folder, history, diagnostics and workbench icons align the bottom four sidebar entries with the existing navigation.
- Colab > Tools manages local stdio and streamable HTTP MCP integrations. Colab can request to add integrations, start them, inspect tool schemas and call tools with your approval.
- The Windows control preset installs its runtime into ATLAS data, starts on demand and stays running until stopped or ATLAS exits. It bypasses broken uv Python minor-version shortcuts and recovers from the first-install junction error. Read-only reviewers cannot control apps; desktop actions run one at a time and always require ATLAS approval.
- Codex and Claude provider connections stay warm across messages while preserving separate chat context. Colab follow-ups reuse their active isolated worktree.
- Colab returns concise, task-appropriate answers without exposing internal completion protocol or appending repetitive reviews. Economy/Balanced/Thorough presets, optional task criteria, token warnings and verified-check reuse reduce unnecessary repeated context.
- Full local Codex/Claude chat imports offer Assistant or Colab as the destination, with native chat/workspace names, searchable history and result comparisons.
- Dirty project folders offer explicit direct editing; broad parent folders are blocked during Git setup. Includes Claude connection diagnostics and offline code syntax highlighting.

Install over your existing version to preserve conversations and settings. Packaged installations can use Settings > App updates > Check for updates, Download, then Restart and install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate open-source Windows-MCP integration; it does not reuse the private runtime of another desktop chat.
