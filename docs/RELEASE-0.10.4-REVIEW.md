# ATLAS 0.10.4 technical release review

Prepared 1 November 2026 for the requested patch. This records technical evidence and limitations; it is not a legal opinion or a claim of certified security.

## Scope and dependency review

This patch stops ATLAS losing saved chats and stops damaged or oversized records blocking start-up or updates. A damaged chats or assistant file is now moved aside with a warning instead of being overwritten or leaving no window. The limits that deleted the first chat at 101, kept the last 80 messages and cut saved messages at 12,000 characters are removed. A failed restore reports once instead of failing on every launch, and any other start-up failure now shows an error. Backups no longer refuse single files over 32 MiB, and records over the 256 MiB total can update without a data backup after the user approves.

It adds no npm dependencies, publisher server, statistics collection or automatic uploads. Only root package versions change in the lockfile. The release record hashes the exact canonical LF lockfile bytes.

The 0.10.0 dependency/source inventory and packaging exclusions remain in effect. This patch does not introduce a new licensing exception or weaken the public-release gate.

## Validation

`npm run release:check` passed: the release record, 542 unit/integration tests, formatting, the production audit, 17 Electron UI suites with mock or fixture providers, the menu audit and the Windows x64 installer build and verification. The new `test:data-ui` suite starts the real main process on a throwaway profile in six scenarios. All six failed on the 0.10.3 code and pass with the fixes.

The parallel batch integration test recorded as intermittent in the 0.10.3 review was traced. It runs three full Colab jobs that start about 120 git processes, and every process finished, so it was reaching its 45-second limit rather than hanging. Its limit is now 180 seconds, which still catches a hang. It takes 52 to 63 seconds in a full local run, and why that is slower than the 12 to 24 seconds previously recorded was not found.

The published 0.10.3 installer matched its published hash and installed over 0.10.2 on the owner's PC, with the chats file unchanged in size.

## Known limits

The packaged update check has not been run. **Restart and install** can only reach a release once that release is published, and its installer replaces the real installation, so updating 0.10.3 to this release will be its first end-to-end run. Users on 0.10.2 or older must still use the installer, and the app will still offer them this update and then fail, as the release notes explain.

Chats no longer have a count limit, and every save rewrites one file holding all of them. Saving was not measured with very large histories. Chats and messages already trimmed by earlier versions cannot be recovered. A damaged file is kept for manual recovery; ATLAS does not repair it. Warning dialogs were checked through a stub, not visually. No real Codex or Claude account and no production language server were used.

Recovery copies from successful updates are still kept without a limit, and Storage Manager does not list them. Reminders marked Done before they are due still notify, and other bugs found in the same review remain open.

The existing owner-authorized unsigned policy remains in effect after SignPath denial. Windows signing and legal approval are not claimed.
