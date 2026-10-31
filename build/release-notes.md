ATLAS 0.10.3 fixes in-app updates.

**If you are on 0.10.2 or older, download the installer below.** In those versions **Restart and install** fails with an "Invalid package" error, so they cannot update themselves to this release. Declining the recovery copy also cancels the update. Installing over your existing version preserves conversations and settings.

- **Updates:** ATLAS now copies itself correctly for recovery before installing an update, and removes a partial copy if that step fails.
- **Reminders:** a reminder title over 300 characters now gets its own clear message.
- **Packaging:** no new dependencies or publisher telemetry. The existing unsigned-release policy remains in effect, so Windows may show a warning.

Windows x64. Close older ATLAS instances before installing. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.
