# ATLAS 0.10.3 technical release review

Prepared 1 November 2026 for the requested patch. This records technical evidence and limitations; it is not a legal opinion or a claim of certified security.

## Scope and dependency review

This patch fixes **Restart and install**, which failed in every version up to 0.10.2 because Electron's fs treats `app.asar` as a folder while the app is copied for recovery. It also removes a partial recovery copy after a failure, gives long reminder titles their own message, and adds release checks and a menu audit. It adds no npm dependencies, publisher server, statistics collection or automatic uploads. Only root package versions change in the lockfile. The release record hashes the exact canonical LF lockfile bytes.

The 0.10.0 dependency/source inventory and packaging exclusions remain in effect. This patch does not introduce a new licensing exception or weaken the public-release gate.

## Validation

`npm run release:check` passed: the release record, 534 unit/integration tests, formatting, the production audit, 16 Electron UI suites with mock or fixture providers, the menu audit and the Windows x64 installer build and verification. The new recovery suite fails on the 0.10.2 code and passes with the fix, including a byte-for-byte copy of a built `app.asar`. The menu audit also passed with approvals accepted in a throwaway project before this release was prepared.

A real update of the installed 0.10.1 found this defect: the live feed offered 0.10.2, the download was accepted, and the recovery copy failed. The published 0.10.2 installer then matched its published hash and installed correctly, and attaching a preview screenshot worked in a visible window of that installed app.

## Known limits

The fixed **Restart and install** has not been run end to end, because no release newer than 0.10.3 exists for it to install. The recovery copy is tested in Electron, not through the packaged update flow. Users on 0.10.2 or older must use the installer, and the app will still offer them this update and then fail, as the release notes explain. No real Codex or Claude account and no production language server were used.

The unit test for parallel batch integration in `tests/colab-jobs.test.cjs` timed out at its 45-second limit in two of about seven local runs while preparing this release, and passed on rerun. It normally takes 12 to 24 seconds and this patch does not change that code, so this appears to be timing under load, but a real intermittent hang has not been ruled out.

The existing owner-authorized unsigned policy remains in effect after SignPath denial. Windows signing and legal approval are not claimed.
