# ATLAS 0.10.2 technical release review

Prepared 31 October 2026 for the requested patch. This records technical evidence and limitations; it is not a legal opinion or a claim of certified security.

## Scope and dependency review

This patch adds [Power tools](POWER-TOOL-UPGRADES.md), regroups the Tasks menu and fixes the menu errors found in a local audit. It adds no npm dependencies, publisher server, statistics collection or automatic uploads. The dependency entries in the lockfile are unchanged from 0.10.1; only root package versions change. The release record hashes the exact canonical LF lockfile bytes.

The 0.10.0 dependency/source inventory and packaging exclusions remain in effect. This patch does not introduce a new licensing exception or weaken the public-release gate.

## Data and permissions

Language servers are installed by the user, configured per project and started after native approval. They run as ordinary processes, not in an operating-system sandbox. Server requests cannot edit files through the client. Browser recipes require native approval and run against the local preview; fill values are stored as plain text, and the UI warns to use fixture data. Screenshots and profile baselines stay in memory. New records are covered by managed-record backup and local-data reset.

## Validation

All 532 unit/integration tests, formatting and the 15 Electron UI suites passed with mock or fixture providers, including packaged PDF extraction. A rebuilt Windows x64 installer passed the package and release verification scripts. CI repeats the required checks before merge and tagging.

A menu audit drove the real main process against a throwaway profile, with approvals refused and provider CLIs and external network blocked. It opened 54 menu sections and 13 settings pages at normal and narrow sizes and made 173 button clicks, with no main-process or console errors.

## Known limits

No real Codex or Claude account and no production language server were used. The audit covered empty data and refused approvals, so populated lists and approved paths rely on the fixture suites. Attaching a preview screenshot failed with a readable message in the hidden audit window; the fixture suite passes, but this is unconfirmed in a visible packaged window. No packaged-update recovery test was run for this patch; the restore suite ran from source.

The existing owner-authorized unsigned policy remains in effect after SignPath denial. The owner requested this patch push; repository rules require a further post-CI confirmation before merge and publication. Windows signing and legal approval are not claimed.
