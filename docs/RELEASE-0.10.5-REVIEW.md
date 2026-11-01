# ATLAS 0.10.5 technical release review

Prepared 2 November 2026 for the requested patch. This records technical evidence and limitations; it is not a legal opinion or a claim of certified security.

## Scope and dependency review

This patch adds chat folders and an archive, automatic daily backups, recovery cleanup, edit and resend, branch from a message, Memory review, Report a problem, and an optional tray icon and global shortcut. Scheduled tasks are deliberately left out and remain in an open pull request.

Automatic backups are the only addition on by default. They write up to seven compressed, unencrypted copies of managed records to the ATLAS data folder, and Delete local ATLAS data removes them. The tray and shortcut are off by default. Report a problem opens a blank GitHub issue and sends nothing itself.

It adds no npm dependencies, publisher server, statistics collection or automatic uploads. Only root package versions change in the lockfile. The release record hashes the exact canonical LF lockfile bytes. A moderate Dependabot alert stays open, and the production audit reports nothing at its high threshold.

The 0.10.0 dependency/source inventory and packaging exclusions remain in effect. This patch does not introduce a new licensing exception or weaken the public-release gate.

## Validation

`npm run release:check` passed: the release record, 568 unit/integration tests, formatting, the production audit, 17 Electron UI suites with mock or fixture providers, the menu audit and the Windows x64 installer build and verification.

The packaged 0.10.5 app was started directly, without installing it, on a throwaway data folder with `CODEX_EXECUTABLE` and `CLAUDE_CODE_EXECUTABLE` set to `where.exe`. It opened its window, was still running after 140 seconds and wrote its first automatic backup on schedule. Nothing was clicked in that run, so this shows that the packaged app starts and that the backup timer works, not that the new pages work there.

## Known limits

The packaged update check has not been run. **Restart and install** can only reach a release once that release is published, and its installer replaces the real installation, so updating to this release will be its first end-to-end run. Updating with the tray on has not been tried, and the close handler that keeps ATLAS running is the part most likely to affect it. Users on 0.10.2 or older must still use the installer.

Restoring from an automatic backup has not been run end to end; the restore path itself is tested with manual backups. Creating a backup is synchronous, so a very large data folder pauses the app briefly once a day. Copies use disk space, up to seven times the size of a backup, and turning backups off leaves existing copies in place.

A real tray click and a real global shortcut press were not exercised. The sign-out path with the tray on was not exercised. No real Codex or Claude account and no production language server were used.

The existing owner-authorized unsigned policy remains in effect after SignPath denial. Windows signing and legal approval are not claimed.
