# ATLAS 0.12.1 technical release review

Prepared 14 November 2026 for the follow-up update failure reported after the authorized 0.12.0 release. This is a technical review, not legal certification.

## Scope and diagnosis

The installed 0.11.0 app downloaded 0.12.0 but its recovery-preparation IPC failed with `{}` after the owner approved the recovery copy. Settings displayed `[object Object]`. During diagnosis the installed app changed to 0.12.0; the action causing that change was not automated by this work.

A real Electron regression reproduced the message loss: a renderer-side DOMException from history loading arrives in the main process as an object without its message. Browser backup now awaits pending saves, creates its JSON snapshot and serializes failure name/message inside the renderer. The caller receives a normal Error. No failed snapshot is replaced with an empty backup or silently skipped.

The updater retains its downloaded state after failed recovery or installer dispatch and exposes the readable failure in Settings. Retrying still requires an explicit restart/install action and recovery approval. Work is checked again before dispatch. Source checkouts cannot install updates. No signing, tool permission or consent boundary changes.

The original history-read failure's underlying cause was not established: copied IndexedDB, source-app backups, the installed backup worker and a fresh-profile fused packaged app all passed. The patch addresses the confirmed cross-process error transport and retry handling; it does not claim to repair arbitrary damaged histories. Older installed versions that remain blocked may need the published installer opened directly.

## Dependencies and signing

Dependency versions are unchanged from 0.12.0. The [0.12.0 dependency review](RELEASE-0.12.0-REVIEW.md) and its seven-advisory applicability assessment apply. Production audit must remain free of high/critical findings. Exact LF lock bytes are bound by the release record. Distribution remains unsigned under the recorded owner policy; no authenticated publisher or legal certification is claimed.

## Verification

The focused renderer regression failed before the fix with an opaque `{}` and passed afterward. It verifies exact browser data, exclusion of unrelated localStorage, waiting for pending saves, readable DOMException transport, real backup-worker output and recovery-copy integrity, blocked installer dispatch on failure and successful explicit retry. Settings and existing recovery suites passed, as did 21 setup/update tests covering opaque recovery failures and asynchronous installer exceptions.

The full release gate and new installer checks run before tagging. Final evidence is recorded after those checks. CI independently verifies the final PR commit; the public tag workflow rebuilds and verifies the merged commit and public assets.

Disposable profiles use Windows temporary storage. Original user records and the user's running installed app are preserved. A real installed-app upgrade transition is not claimed by the isolated installer-dispatch fixture.
