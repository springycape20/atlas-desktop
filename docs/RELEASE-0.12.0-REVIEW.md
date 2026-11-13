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

The live installed-app transition to the new public updater feed cannot be exercised before publication. Isolated update/recovery fixtures and packaged worker checks do not replace that live test, and no user installation is replaced during validation.
