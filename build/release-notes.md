ATLAS 0.6.8 improves desktop control, permission prompts and Colab efficiency.

- Permission requests in the chat and approval bubble now offer **Allow**, **Allow once** and **Deny**. Each request explains what Allow remembers: routine desktop control for the chat, or the exact command/tool request for the current task. Allow once covers only that request, including the steps and final screenshot of an approved desktop sequence.
- Remembered computer-control permission is shared by Codex and Claude within the chat and survives app restarts. Revoke it from Run details. System-file changes, previously denied files and commands whose effects cannot be verified still request explicit approval.
- Desktop control keeps its connection alive, supports smoother mouse movement and short sequences, and shows a click-through border reading "Atlas is controlling this PC" while active. Managed PowerShell diagnostics and simple project edits use the approved chat scope; destructive and unrecognized commands still prompt.
- Fixes Windows-MCP startup, Python runtime selection, active-user control compatibility, controller cleanup and local app cache contention.
- Colab uses private temporary Codex sessions so internal stages do not flood the Codex chat list. Existing personal chats are preserved.
- Compact Colab controls and expandable request details leave more room for messages. An in-app workflow graph shows the clients' progress and coordination.
- Colab context preparation, proposal handling and review/check reuse reduce repeated work and unnecessary context while preserving task checks.

Install over your existing version to preserve conversations and settings. Packaged installations can use **Settings > App updates > Check for updates**, then download and restart to install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.
