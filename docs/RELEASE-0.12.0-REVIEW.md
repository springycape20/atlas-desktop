# ATLAS 0.12.0 technical release review

Prepared 14 November 2026 for the owner's request to publish the completed local improvements. This is a technical review, not legal advice, an independent security audit or a certification.

## Scope and boundaries

Activity is the launch page. Project/task navigation, saved workspaces, automatic local draft recovery, task handoffs, search, workflow conversion, setup guidance, the connected editor/terminal/native preview dock, provider allowance reports, bulk cleanup and reviewed Git checkpoints are included. Waiting phrases, copy controls and consistent tool spacing improve the existing Chat and Colab screens. Voice features default off for new installs; saved choices remain intact.

Draft recovery retains at most 30 local drafts, 128,000 characters each and 512,000 total. Read markers are local and bounded. Bulk Undo receipts are in memory for five minutes, refuse later task changes and never hide active work or approvals. Commands, task resumption, provider handoffs and selected-file restoration retain explicit controls. Git checkpoints preserve tracked files in the project; external Git refs are outside ATLAS backups. Bounded snapshots and Git references are not a full backup of every project file.

Optional semantic search requires reviewing task text and approving a local embedding request. Its process-memory vectors exclude vault-note indexing; a user-configured local server can itself route or retain data. Vault discovery still rejects actual links before canonicalizing Windows aliases, remains read-only and separate from project indexing, and retains preview/consent/source-invalidation boundaries. Prompt-injection defenses are not deterministic guarantees.

Claude allowance uses the documented structured `/usage` report through the unmodified installed CLI, with tools, hooks, MCP servers and session persistence disabled. No Claude credentials are read or stored by ATLAS, and no private account endpoint is scraped. Unknown/unsupported reports remain unavailable. Native embedded preview keeps its sandbox, isolated session and origin restrictions; hidden screenshot capture restores view bounds/visibility and releases its inspection connection.

## Dependency review and signing

The production/development dependency versions are unchanged. Only the root package and lock versions change. Existing component exclusions, included notices, speech resource hashes, ASAR integrity and binary fuses remain mandatory. The release record hashes exact LF lock bytes. Distribution remains unsigned under the owner's existing authorization; no authenticated publisher claim is made.

The 14 November production audit reports zero high/critical findings and two moderate affected packages (`hono` 4.13.13 and `@hono/node-server` 2.1.5), comprising seven advisories. The earlier five applicability assessments remain documented in the [0.11.2 review](RELEASE-0.11.2-REVIEW.md). ATLAS's Node handler checks a bearer route token, exact `/mcp` raw URL, Host and method before the SDK transport. It has no Hono router, mount, CSS renderer or WebSocket upgrade endpoint.

Two additional advisories were checked against their primary reports:

- [GHSA-46wx-v44x-9hh2](https://github.com/advisories/GHSA-46wx-v44x-9hh2) concerns Hono CSRF middleware skipping `text/ping`. ATLAS does not use that middleware or cookie-authenticated state-changing Hono routes. Its MCP handler requires a bearer route token, so this reported prerequisite is not used by ATLAS.
- [GHSA-4h7h-rv7c-7m2v](https://github.com/advisories/GHSA-4h7h-rv7c-7m2v) concerns Hono `validator('form')` with multipart requests. ATLAS uses JSON MCP messages and does not invoke that form validator.

These are usage-based applicability assessments, not claims that dependencies are patched or that no other vulnerability exists. Reassess before adding those affected interfaces. No monetization, hosted inference or publisher analytics is introduced.

## Verification

The completed source work passed 662 unit/integration tests and seven targeted Electron suites, including automatic recovery across reload/navigation, exact copy behavior, selected-task bulk cleanup/Undo, reset countdowns, live badges and native preview isolation. The complete release gate runs against the committed version before tagging; final installer hashes and packaged smoke results are recorded after that run. The package verifier explicitly requires all new runtime modules.

The first complete gate passed all 20 Electron suites and installer/package checks, but the menu audit caught eleven legitimate task-screen subscriptions exceeding Electron's default listener threshold. The preload now shares one IPC listener with independently removable subscribers. A focused regression test reproduced the warning before the fix and verifies delivery, unsubscribe and re-subscribe afterward. The full gate is repeated for the corrected commit before tagging.

The first GitHub CI run also exposed an environment-dependent animation test: Windows runners prefer reduced motion, so the correct static state failed the animated-wave assertion. Explicit reduced-motion emulation reproduced the exact failure locally. The test now explicitly selects normal motion for wave/cycling assertions, then reduced motion to verify static letters/spinner and no phrase cycling. No app accessibility preference is overridden.

Automated PR review flagged editor-selected reference text entering an unsent draft. The draft now separates its explanation request from a data-only policy and JSON object containing the path and selected text. A browser regression check preserves hostile end-marker/newline text inside that JSON object and confirms no provider request is sent. This is defense in depth, not deterministic prompt-injection containment; existing preview, user consent and tool permissions remain required.

The motion-corrected CI run then exposed a preview test assuming a 550-pixel viewport on a smaller hosted Windows desktop. A 900 × 600 owner window reproduced the failure locally. Assertions now independently verify clamping to the owner's actual content rectangle and require hidden capture to preserve that exact size, visibility, bounds and debugger cleanup. The revised native preview suite passed locally.

Final local evidence:

- 663 unit/integration tests passed; formatting and production audit passed.
- All 20 Electron UI suites passed. The subsequent reference/motion and constrained-window changes also passed their targeted work-improvements and native-preview suites.
- Menu audit: 143 surfaces, 175 clicks, zero problems, approvals refused.
- Installer build and verification passed, including fuses, ASAR integrity, required runtime files, private-path exclusions, pinned speech resources, notices and updater digest/size.
- All four packaged smoke suites passed: PDF extraction, backup worker, installed-Node debugger and read-only Markdown vault.
- Local installer: 381,469,618 bytes; SHA-256 `141a3d88bf71938146a2acfb98f1a4a7d57f00b08e436cf9f17565146c8d85aa`; SHA-512 `6hvhLOYt49AR0usp23DHQ0FSIZbXsKlD7QQMkDFDo5QhwJXCWQRp6qPnUqhp5cgc1R9NN0T9ZbrzPbrIf+jxNg==`.
- Packaged `preload.js` and `project-editor-ui.js` match current source after line-ending normalization. Local gate logs and focused reproduction logs are retained under ignored `dist/`.

The public tag workflow independently rebuilds the merged commit. Its installer can have a different digest from this local build; the published `latest.yml`, public installer size and digest must agree before publication is reported complete. Final PR CI is required to pass before merge/tagging.

The live installed-app transition to the new public updater feed cannot be exercised before publication. Isolated update/recovery fixtures and packaged worker checks do not replace that live test, and no user installation is replaced during validation.
