# ATLAS 0.11.0 technical release review

Prepared 13 November 2026 for the owner-requested release of the accumulated workflow, UI and update improvements. This records technical evidence and limitations, not legal advice or certified security.

## Scope and dependency review

This release includes searchable/compact navigation, long-chat paging, draft-aware editor language intelligence and reviewed text renaming, browser-step construction and conditional waits, worker backups and custom destinations, saved visual baselines, task budgets, guided trial promotion, fixed-case workflow benchmarks and optional automatic update downloads with a launch announcement.

Automatic update downloads and task budgets default off. Installing an update still requires an explicit action, available-work checks and recovery approval. Trial promotion requires reviewed file selection and native approval; benchmark batches require approval before provider work or project checks. No publisher collection or automatic upload service is added.

There are no dependency additions or version changes beyond the root application version in package.json and package-lock.json. On 13 November 2026, npm audit --omit=dev reported zero production vulnerabilities. The existing dependency/source inventory, removal exclusions and owner-authorized unsigned-release decision remain in effect. The release record hashes the exact LF lockfile bytes.

## Validation

Local validation passed: 601 unit/integration tests, all 17 existing release Electron suites, the new packaged-backup-worker check, and the real-main menu audit across 131 surfaces and 145 clicks with zero problems. The menu audit uses throwaway data, blocks provider launches and web traffic, and refuses approvals.

The unsigned Windows x64 installer was freshly built and verified for version, ASAR contents/integrity, binary security fuses, private-path exclusions, notices, the 125-component npm inventory, pinned speech resources and exact updater manifest/installer hashes. PDF extraction and the backup worker were exercised through the built ASAR. The update-recovery fixture copied the real built app.asar as a file. The final release gate reruns these checks against the committed release record before publication.

The portable packaged app reached its Window loaded startup log in a throwaway LOCALAPPDATA/APPDATA environment with Codex and Claude executables set to inert where.exe stubs. No provider tasks were submitted and no user installation was replaced. A first startup-fixture attempt overrode Windows profile identity too broadly and could not resolve Electron's appData path; keeping the real profile identity and isolating app data resolved the fixture setup failure.

The project-file UI fixture initially failed because its saved-baseline action returned a status object instead of the required array. Correcting that fixture response restored the preview error-link assertion; no product behavior was changed for that failure.

## Limits

- Long-chat rendering is bounded paging; complete histories still load into memory.
- Language intelligence uses a fixture-tested installed stdio server. No production server was installed or tested. Completion accepts plain text, and rename supports bounded changes maps, excluding BOM/resource operations.
- Backups are unencrypted record archives, not transactionally consistent whole-project copies. Trial working folders and provider histories are excluded. External backup copies survive local-data reset.
- Promotion supports bounded UTF-8 text files, blocks conflicts and rechecks hashes. Filesystem failure can leave a partial applied set; undo records protect recovery and refuse newer edits. Empty created directories can remain.
- Budgets govern ATLAS invocations and rough outgoing text estimates, not provider-internal tools/retries/output or billed spend. Benchmarks require pinned model IDs; unknown usage/version fields remain unknown. Fixed inputs do not make model behavior deterministic.
- The unsigned installer and checksums do not authenticate a signing publisher. The existing SignPath denial and unsigned policy remain disclosed.
- An installed-app update to this unpublished version cannot be completed through the live GitHub feed yet. No actual user installation will be replaced during pre-release checks. Record the packaged startup/recovery evidence separately and retain this end-to-end limitation.
