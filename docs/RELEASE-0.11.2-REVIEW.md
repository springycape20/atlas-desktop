# ATLAS 0.11.2 technical release review

Prepared 13 November 2026 for the owner's explicit request to publish the reviewed Markdown vault implementation as a patch. This records technical checks and limits, not legal advice or a security certification.

## Scope and boundaries

An optional read-only source for an explicitly selected dedicated local Markdown folder, including Obsidian vaults. The global source starts disabled, and each Chat/Colab chat separately opts in through Context. Preview receipts bind the query, scope, exclusions, selected root and excerpt digest. Changes require another preview. Disabling/removing/changing the source invalidates in-flight reviews and blocks later provider calls in tasks holding its previous context; an already dispatched request may finish.

Vault scanning uses a separate worker path without a retained note cache or project-map/memory changes. File-count, entry-count, depth, individual-note bytes, total bytes, candidates and excerpt budgets are bounded. Private paths, hidden paths, integration-denied paths and symlinks/junctions are excluded. Root identity and file metadata are checked; changed/deleted/unreadable files are not reused. Ordinary note text can contain secrets and model-directed instructions: JSON reference framing and heuristic sensitive-context review do not make that text inert or guarantee complete detection. Existing tool permissions remain in force.

Configuration is local plaintext metadata in a managed record; it enters backups/reset. Vault files are never written by this feature. Sending selected excerpts shares them under existing provider retention rules. Source removal does not erase prior task/provider records or backups. See [setup and limits](PROJECT-TOOLS.md#optional-markdown-vault-including-obsidian) and [privacy](PRIVACY.md).

## Dependencies, advisories and signing

No production or development dependency versions changed; the lockfile changes only the root application version. Existing licence/source inventories, component exclusions, fuses and unsigned-release authorization remain in effect. The release record hashes exact LF lockfile bytes. The unsigned installer does not authenticate a publisher.

The 13 November production audit reports zero high/critical findings and two moderate affected transitive packages: `hono` 4.13.13 and `@hono/node-server` 2.1.5, included by the existing MCP SDK. Five primary GitHub advisories were reviewed:

- GHSA-qv5m-9pm6-hqp3 requires enabled WebSocket upgrade handling. ATLAS uses an ordinary Node HTTP server and POST-only MCP handling, without a WebSocket upgrade handler.
- GHSA-jpvv-r467-5p4w requires a front proxy making path-based access decisions before Hono normalizes the URL. ATLAS binds to `127.0.0.1`, has no proxy, and rejects requests unless the raw URL is exactly `/mcp`, the Host matches and the bearer route token is valid, before the SDK adapter runs.
- GHSA-4m76-xfj5-7975 and GHSA-h7mg-cq63-vhpq concern Hono mount/RegExpRouter middleware coverage. ATLAS does not create a Hono router or mount application; authorization is checked in the Node handler before transport conversion.
- GHSA-3gg2-335m-rxc6 concerns server-rendered `hono/css` interpolation. ATLAS does not use that renderer/helper.

These are usage-based applicability assessments, not claims that the packages are patched or that no other vulnerabilities exist. Dependency scope is unchanged for this feature. Reassess before adding Hono routing, CSS rendering, WebSockets or a proxy.

## Verification evidence

630 unit/integration tests passed in the normal Windows temporary directory. Tests placed within the checkout initially inherited its Git state and caused fixture failures; the isolated rerun passed all tests. New cases cover default/disabled Chat and Colab requests, provider assembly, per-source preview receipts, source invalidation between Colab passes, traversal, junctions, private paths, denied paths, unreadable/deleted/changing notes, replacement roots, scan/read/excerpt bounds and bounded receipt retention.

The dedicated vault Electron suite passed at 1440, 768 and 390 pixels with sample notes, including configuration, opt-in, receipt propagation, separate exclusions and visible scan/budget warnings. Full release-gate, installer and packaged-worker results will be recorded before publication.

Automated review flagged prompt-injection risk. Its proposed metadata-only prompt would remove the requested model-readable notes, so that suggestion was not applied. Instead, vault-enabled provider calls add a static untrusted-reference policy through Codex developer instructions and Claude's appended system prompt, separate from note-controlled data. The local-model adapter already declares reference excerpts untrusted in its system role and exposes no tools. Tests verify those instruction channels. This strengthens hierarchy but is not deterministic protection against model misbehavior; review and existing tool approvals remain essential.

GitHub CI exposed a Windows 8.3 temporary-path alias mismatch that rejected safe notes as linked paths. Selected-root validation now rejects actual symlinks/junctions first, then canonicalizes short aliases before sensitive-path validation and scanning. A real Windows alias regression covers search and persisted-root behavior; the existing junction cases remain enforced.

## Material limitations

- Only ordinary `.md` text is searched; links/embeds are not followed and no Obsidian graph, plugin or metadata functionality is added. Hidden/private/linked paths and UNC roots are unsupported. Bounds can omit relevant notes; incomplete scans are visible.
- Scans repeat on preview and send, which can take seconds on large folders. Reviews expire after source changes, process restart or more than 32 subsequent previews. Saved-task resumption may require a new reviewed request.
- Running tasks use their reviewed task-start context snapshot. Source changes prevent later provider calls but cannot retract requests already dispatched. Disabling the source does not redact previous conversation replies or provider-owned histories.
- The live installed-app upgrade against the 0.11.2 updater feed cannot be completed before publication. Isolated recovery fixtures and packaged startup tests reduce risk without replacing the user's installation; this limitation remains explicit.
