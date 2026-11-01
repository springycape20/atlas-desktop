ATLAS 0.10.4 stops ATLAS losing saved chats, and stops damaged data blocking start-up or updates.

**If you are on 0.10.2 or older, download the installer below.** In those versions **Restart and install** fails with an "Invalid package" error. Installing over your existing version preserves conversations and settings. If you are on 0.10.3, use **Settings > App updates**. This is the first release that version can update to, so if that fails, use the installer instead.

- **Chats:** ATLAS no longer deletes your first chat when you start the 101st, keeps only the last 80 messages of a chat or cuts saved messages at 12,000 characters. Chats and messages already removed by earlier versions cannot be recovered.
- **Damaged files:** if your chats, memories or reminders file is damaged, ATLAS keeps it, warns you and starts without those records, instead of overwriting it or opening no window.
- **Start-up:** a failed backup restore now reports once and lets ATLAS open. Any other start-up failure now shows an error instead of running with no window.
- **Updates and backups:** backups accept single files over 32 MiB. Over the 256 MiB total, ATLAS asks whether to update without backing up your records rather than refusing to update.
- **Packaging:** no new dependencies or publisher telemetry. The existing unsigned-release policy remains in effect, so Windows may show a warning.

Windows x64. Close older ATLAS instances before installing. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.
