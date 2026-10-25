ATLAS 0.6.11 fixes the log button, keeps the Windows Apps list accurate and closes a security gap.

- **Settings > Provider accounts > Show log file** now opens File Explorer with the log selected. Previously, "Open log file" could show Windows' "How do you want to open this file?" picker on PCs with no app set up for .log files.
- The log also records when ATLAS quits, and when its window or a helper process stops unexpectedly, so an unexpected close can be explained.
- The Windows Apps list could keep showing an older version after updating from inside ATLAS. ATLAS now corrects its own entry when it starts.
- ATLAS.exe no longer runs other programs' scripts as Node.js, so it can't be used to start code under ATLAS's name.
- Desktop control cleanup retries once if Windows is slow to report its running processes, instead of failing.

Install over your existing version to preserve conversations and settings. Packaged installations can use **Settings > App updates > Check for updates**, then download and restart to install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.
