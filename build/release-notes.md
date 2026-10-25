ATLAS 0.6.10 is a smaller download with security updates and a diagnostic log.

- The installer is about 40 MB smaller, and ATLAS takes about 176 MB less disk space once installed. Speech engine files for other operating systems are no longer included.
- ATLAS keeps a log of startup times and errors. Open it from **Settings > Provider accounts > Open log file** when reporting a problem. It stays small: older entries are moved aside after 1 MB.
- Security updates for the MCP SDK, used by integrations, and for an image library used by the speech engine fix several reported vulnerabilities. App updates also use a newer, patched updater.
- The app window only runs ATLAS's own script files, which blocks a class of script-injection attacks.

Install over your existing version to preserve conversations and settings. Packaged installations can use **Settings > App updates > Check for updates**, then download and restart to install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.
