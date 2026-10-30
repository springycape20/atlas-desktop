# ATLAS 0.10.1 technical release review

Prepared 30 October 2026 for the requested patch. This records technical evidence and limitations; it is not a legal opinion or a claim of certified security.

## Scope and dependency review

This patch adds the five controls in [Model usage efficiency](TOKEN-EFFICIENCY.md) and the ten additions in [Work sessions](WORK-SESSIONS.md). It adds no npm dependencies, publisher server, statistics collection or automatic uploads. The dependency entries in the lockfile are unchanged from 0.10.0; only root package versions change. The release record hashes the exact canonical LF lockfile bytes. The production audit reported zero vulnerabilities on 30 October 2026.

The 0.10.0 dependency/source inventory and packaging exclusions remain in effect, including the removal of Kokoro/eSpeak/ONNX/sharp, exclusion of optional native canvas and Liberation fallback fonts, and pinned Whisper and node-pty resources. This patch does not introduce a new licensing exception or weaken the public-release gate. Packaged notices now include this version's review through a version-derived filename.

## Data and permissions

Unchanged-reference receipts are in memory and scoped to backend-confirmed sessions. Requests, instructions and memories are not removed. New/unknown/failed sessions and periodic refreshes receive full references. This does not establish a provider cache discount or a measured subscription saving.

One stronger-model repair is optional and off by default. It requires automatic fast-model routing, changed files and an executed nonzero failing check. It excludes manual/project pins, read-only/local work, cancellation and existing repair workflows. A fresh repair receives the current request and saved recent history, and reruns configured checks. Failure does not cause an unbounded retry loop.

Context hashes, requirement notes, trial metadata, bounded checkpoint bytes and check logs stay local. Trial folders are excluded from managed-record backups and must be exported before local-data reset. Export refuses a nonempty destination. No trial code, setup command, provider request or dependency installation runs merely by creating or selecting a trial. Selected preparation commands require native approval. Model handoffs and prepared context create unsent drafts and preserve existing chats. Bug reports require preview and explicit review; raw output is excluded by default and heuristic redaction cannot guarantee anonymity. These boundaries are documented in the privacy and feature guides.

Managed trial storage refuses links outside the ATLAS data directory. Source access uses current private/denied-path guards; generic orphan cleanup protects trial checkpoints. Evidence links are tied to actual check-result digests and invalidated by changed results. Passing a user-linked check does not prove every acceptance criterion.

## Validation

The implementation passed 524 unit/integration tests, formatting and fixture-based Power tools, navigation, Assistant and Colab UI suites before release preparation. Tests cover actual request assembly, session continuity, duplicate-history fallback, exactly one stronger repair, stale context, isolated/binary trial copies, private-path denial, empty-folder export, storage links, evidence invalidation, preparation approval and report review. UI coverage includes explicit Claude handoff, ordered recipe drafts and narrow layouts.

The complete 15-suite Electron regression set passed, including packaged PDF extraction. A rebuilt Windows x64 installer passed package/notices/private-path/fuse/ASAR/updater checks, including the mandatory new runtime files. The updater manifest matched the actual installer byte for byte. CI repeats the required checks before merge/tagging. No real Codex or Claude accounts are used by this validation.

An isolated actual-package recovery test preserved and relaunched 0.10.1, restored saved fixture records before application load and retained the newer fixture records. Provider executables pointed to Windows `where.exe`; no user-profile NSIS installation or real provider account was used. This exercises recovery of fixture records and does not cover every Windows update policy. The source fixture for trial exports canonicalizes temporary paths so Windows short-name aliases do not create a false path mismatch in CI.

The existing owner-authorized unsigned policy remains in effect after SignPath denial. The owner requested this patch push; repository rules require a further post-CI confirmation before merge and publication. Windows signing and legal approval are not claimed.
