# ATLAS 0.11.1 technical release review

Prepared 13 November 2026 for the owner-requested patch containing the eight approved project-tool improvements. This records technical checks and limits, not legal advice or a security certification.

## Scope

Guided benchmark forms; reviewed editor quick fixes/import organisation/resource edits and richer completion; saved workspaces; opt-in local browser recording; bounded context slices; stable masked visual comparisons; chunked histories and visible-message mounting; and a local Node.js debugger. See [feature boundaries](PROJECT-TOOLS-NEXT.md).

Provider work, shell starts, recording and debugger launches retain explicit controls. Workspace snapshots exclude drafts, terminal output and commands. Recorder private-field detection is heuristic and requires review/test data. Debugger operations are allowlisted, source paths are guarded, getters/evaluation are excluded, and active debug sessions block conflicting tasks/edits.

## Dependencies and signing

No dependencies were added or updated; only the root application version changed in the lockfile. The 13 November production audit reports zero vulnerabilities. Existing licence/source inventories, component exclusions and unsigned-release authorization remain in effect. The release record binds this review to the exact LF lockfile bytes. The unsigned installer does not authenticate a signing publisher.

## Validation evidence

Source validation includes 615 unit/integration tests and the affected Assistant, Colab, editor, preview, power and navigation UI suites. The full menu audit passed 135 surfaces and 155 clicks with zero problems. Tests use local fixtures, block provider accounts where applicable and leave actual user installations unchanged.

Release packaging exposed the initial debugger attempting to use Electron Node mode, which the packaged binary disables. The debugger now resolves an installed Node.js executable (or an explicit absolute Node path), displays that path in the native approval, and preserves all existing fuses. A packaged-ASAR regression first reproduced the wrong executable and now passes; the release workflow and local gate include it.

The full data-safety suite also exposed assertions still reading the retained legacy chat file after migration. Its independent disk reader now verifies chunk hashes and checks the current index. The legacy migration callback preserves the existing damaged-file warning before starting a new index, while keeping the damaged original. Damaged chunks/indexes continue to fail without overwriting records.

New integration checks cover 5,000-message disk paging/search and integrity errors, existing IndexedDB v1 migration with 5,001 preserved messages and a 5,002-message reload after append, reviewed workspace edits/undo/conflicts/file aliases, LSP action resolution, trusted recorder input/private-value exclusion, guided benchmark submission, saved tabs/preview metadata, and actual installed Node inspector stepping and local-variable inspection.

The fresh unsigned Windows x64 installer passed version, ASAR, private-path, binary-fuse, notice/inventory, pinned speech-resource, blockmap and exact updater-hash checks. Packaged PDF extraction, backup-worker archive creation and installed-Node debugger launch/stepping passed through the actual ASAR. A copied packaged 0.11.1 application relaunched against throwaway data, restored saved records before app load and preserved newer fixture records; provider executables were inert where.exe stubs. The committed full release gate repeats these checks before the PR is ready for publication.

## Material limits

- Assistant migration retains its legacy file and unreferenced chunks for recovery; these can consume disk space. Colab still loads complete message arrays into memory. Downgrades require the pre-update backup because older versions do not support the migrated database/index.
- Context boundaries are bounded lexical hints, not a complete parser or semantic search. No provider benchmark or token-saving percentage was measured.
- Language actions depend on an approved installed server. Only fixture servers were exercised; complex snippet transformations and executable server commands are omitted. Filesystem failures can leave partial changes with bounded in-process undo.
- Browser recording excludes likely private fields heuristically; it is not a guarantee that recorded values contain no personal data. Canvas/video/live data may still vary in visual comparisons.
- Debugging initially supports `.js`, `.cjs` and `.mjs` using the selected Node.js runtime. It does not support source maps, TypeScript compilation, attach, Python/browser debugging or arbitrary expression evaluation. Project code has the user's filesystem/network permissions.
- An installed-app upgrade through the live feed cannot be completed before the release is published. Isolated packaged startup/recovery can be tested without replacing the user's installation; retain the live-feed limitation.
