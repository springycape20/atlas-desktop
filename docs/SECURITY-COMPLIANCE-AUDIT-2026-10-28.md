# ATLAS security and compliance audit

This records the original audit findings. See [remediation status](SECURITY-REMEDIATION-2026-10-28.md) for subsequent code changes, tests and remaining release holds.

Date: 28 October 2026. Source reviewed: `81c24261fe9fa0f524f8fd2e8c4e82b60801af3a` on `codex/handover-follow-ups` (ATLAS 0.8.2 plus the three local follow-up commits).

## Decision

**Do not describe this release as legally cleared or security-certified. Resolve the high-priority items below before another public release.** This is an initial source, dependency and primary-source legal review. It cannot guarantee freedom from lawsuits or fines, determine every country's laws, or replace an Australian software/privacy lawyer's advice. An independent penetration test and inspection of the exact release installer remain outstanding.

The publisher confirms they are based in Australia. ATLAS will remain a free public GitHub download, without payment, developer-operated application servers, or developer collection of users' data. A static website might be added later. Foreign target markets, intended age group, sensitive intended uses and publisher legal identity are not confirmed. These assumptions materially affect legal applicability.

Detailed sources and qualifications are in [Australian and international legal research](LEGAL-RESEARCH-2026-10-28.md) and [licensing and provider-terms research](LICENSING-RESEARCH-2026-10-28.md). Legal/contractual risk, engineering weaknesses and voluntary best practice are distinguished below; a missing best practice is not automatically a statutory offence.

## Evidence and tests

- `npm audit --json`: completed successfully; zero reported npm vulnerabilities across 417 dependency entries. This does not cover every native DLL, downloaded model, external CLI/runtime, unpublished vulnerability, or application logic defect.
- Focused existing tests: `node --test tests/desktop-action-policy.test.cjs tests/desktop-permissions.test.cjs tests/powershell-policy.test.cjs tests/integrations.test.cjs tests/chat-import.test.cjs tests/workspace.test.cjs tests/setup-updates.test.cjs` — **86 passed, zero failed, zero skipped**. These use isolated fixtures, including real sleeping PowerShell child processes, without real provider accounts.
- The full suite passed **415 tests** immediately before the audited commit was created in this chat. The focused run above is the fresh audit run; it is not an independent penetration test.
- Read-only source inspection covered Electron window/IPC settings, custom protocol/CSP, approvals, PowerShell policies, MCP gateway, credential handling, persistence/logging, speech services, setup/downloads and release configuration.
- A harmless policy-only probe reproduced S2 below. No deletion or other destructive command was executed.
- The existing local packaged archive embeds **0.8.0**, not the current 0.8.2 source. Its findings are supplementary inventory evidence only. The published 0.8.2 installer was not downloaded, executed, rebuilt, signature-checked or certified.
- No real credentials were read, no authenticated provider requests made, no software installed, and no production configuration changed. This audit adds reports only; it fixes none of the findings.

## Priority findings

| ID | Priority | Finding | Nature and evidence | Required next action |
| --- | --- | --- | --- | --- |
| S1 | High | Direct reuse of Claude Code OAuth credentials | Confirmed code; contractual compliance concern. `provider-usage.js:103–112` reads the CLI credential file or token environment variable and calls Anthropic's OAuth usage endpoint itself. | Remove that token handling or obtain express authorization. Prefer an approved CLI interface or the provider's usage page. Ordinary unmodified CLI use is a separate question. See L1 in the licensing report. |
| S2 | High | Remembered PowerShell permission does not reliably enforce the promised destructive-command exceptions | Reproduced policy weakness, conditional on a user having granted broad shell access. `powershell-policy.js:321–385` uses text patterns; `integration-service.js:650` tells users deletion and hidden code still ask. Equivalent obfuscated command names evade those patterns. | Fail closed on syntax the policy cannot verify, and make the permission wording accurate. For strong protection, limit automatic execution to a supported subset; arbitrary programs/scripts cannot be made safe by a command-name denylist. Add regression tests before changing it. |
| S3 | High | Copyleft and redistribution obligations are not demonstrated for the final bundle | Dependency inspection identifies embedded eSpeak NG through phonemizer and an LGPL branch in the Windows sharp/libvips package. Speech extra-resource filters include binaries/models without explicit licence notices. | Obtain exact component provenance and legal review of corresponding-source, notices and combined-work/relinking duties. Produce the notices/source-access material and verify them inside the exact installer. This does not establish that all ATLAS code must become GPL. See L2–L4. |
| S4 | Medium | Continuous microphone use is enabled by default | Confirmed defaults at `main.js:306–307,370–371`; trusted app microphone permission is granted by `main.js:237–252`, and startup invokes the listener. Local processing does not eliminate accidental/bystander capture. | Use a deliberate first-run opt-in, clear listening indicator and immediate pause. Explain when recognised text or screen content reaches a provider. Check applicable Australian state/territory recording circumstances. This is a risk-reduction recommendation, not a finding of unlawful recording. |
| S5 | Medium | Publisher authentication for updates remains conditional | `.github/workflows/release.yml:22–23,56–64` permits unsigned releases until signing variables exist; publisher pinning is a separate option. The installed updater source returns without signature validation if no publisher is configured (`node_modules/electron-updater/out/NsisUpdater.js:84–99`). | Complete signing, pin the verified publisher, and fail release verification when expected signature/publisher fields are absent. Test the signed-app/prepackaged-installer flow and migration from unsigned versions. No blanket law requiring Windows Authenticode is asserted. |
| S6 | Medium | Verification and privacy claims need precise limits | README introduction promises a “verified answer”, while the product correctly distinguishes reviewer acceptance from ATLAS-run checks elsewhere. “All files local” can also be misunderstood if repeated without provider disclosures. | Say what was reviewed and which checks actually ran. Clearly distinguish no publisher collection from cloud inference and external requests. Avoid correctness/privacy guarantees the implementation cannot substantiate. |
| S7 | Medium | Local sensitive records have no app-level encryption or complete erasure flow demonstrated | `atomic-store.js` writes plain JSON; `workspace-service.js:246–250` copies attachments locally; Colab uses IndexedDB. `package.json:102` preserves data on uninstall; migration backups and task recovery snapshots also exist. This is not evidence of public exposure. | Document plaintext/local-account access, retention and backups; offer scoped deletion/export controls. Consider optional OS-backed encryption for sensitive stores and test all copies. Do not promise encryption protects data from malware already running as the user. Encryption at rest is not asserted to be universally mandatory for this free app. |
| S8 | Medium | Download/provenance policy is inconsistent | Whisper resources are version/hash pinned and Windows-MCP source is revision/hash pinned, which is good. `voice-worker.cjs:16` selects a mutable model repository without an explicit revision; `integration-service.js:1117` executes the current uv installer fetched over HTTPS. | Record/pin model revisions and notices; use versioned verified runtime installation where supported. Document external installer trust and require deliberate install consent. HTTPS alone does not establish a reproducible dependency. |
| S9 | Low | Further Electron binary hardening is not configured | `package.json:113–117` disables three useful fuses but does not enable embedded ASAR integrity or ASAR-only loading. This is additional defence against app-code tampering, not proof of a remote-code exploit. | Evaluate paired ASAR-integrity/ASAR-only fuses, embed the Windows integrity metadata, and test the packaged app. Review other unused privileges. Validate the binary rather than only the JSON settings. |
| S10 | Low | No repository security-reporting policy or documented ongoing vulnerability programme was found | No `SECURITY.md` or automated advisory check was found in the reviewed repository workflows. GitHub private-reporting settings and account MFA were not inspected. | Publish a private reporting route, supported versions, triage/update procedure and maintenance expectations; enable appropriate dependency monitoring and keep a release component inventory. Do not invite users to post raw logs publicly. |

Priorities describe remediation order for this product. They are not CVSS scores or confirmed legal violations. No unauthenticated remote compromise was demonstrated by this review.

### S2 reproduction and threat model

Calling the actual exported `riskyPowerShell` function with the project directory and no denied paths produced:

```text
Remove-Item example.txt                     -> This command deletes files or data.
& ('Remove' + '-Item') 'example.txt'         -> '' (no additional risk approval)
r`emove-item example.txt                    -> '' (no additional risk approval)
python -c "print(1)"                        -> '' (expected broad-program permission)
```

These strings were passed to the policy function only. They were never executed by PowerShell. The first two obfuscated forms are the finding: native command text is not reliably assessed. The Python example is included to make an existing, explicitly disclosed limitation clear, not to misrepresent intentional arbitrary-program access as a newly discovered exploit.

This is **not** a default unrestricted-shell path. Users must first grant the remembered permission; deny/revoke logic and other gates still matter. The concern is that the exception promises overstate protection after that grant, particularly if an AI is influenced by untrusted repository files, imported messages, screen content or tool output. A prompt telling the AI to be careful is not an enforcement boundary.

## Protections already present

The source implements several important parts of [Electron's official security checklist](https://www.electronjs.org/docs/latest/tutorial/security/): isolated/sandboxed renderer, Node integration disabled, web security enabled, restricted navigation/new windows, trusted-sender checks, a fixed-list custom protocol, and a restrictive script policy. Most reviewed dynamic content is constructed as text rather than inserted as untrusted HTML; this observation is not a complete XSS proof.

Other useful controls:

- MCP HTTP service binds to `127.0.0.1`, checks a per-session bearer token, rejects browser Origin headers/unexpected Host/path/method, bounds body size, and rechecks active task/read-only state (`integration-service.js:884–970`).
- Screen and shell grants are scoped to a saved chat, revocable, and checked around approval/action races. Corrupt grant storage fails closed. Default provider permission bypass is off (`main.js:285`).
- ElevenLabs keys require Windows-backed `safeStorage`; the code fails rather than falling back to plaintext if encryption is unavailable (`main.js:490–494,1455–1462`).
- Whisper runs locally with a random request path and loopback binding; it has bounded queue/timeouts (`whisper-service.js`). This is a private local server, not a developer-operated hosted service.
- Downloads/restarts for app updates require explicit actions and installation is blocked while tasks run (`app-updates.js`). Release verification checks updater hashes, version consistency, and three binary fuses (`build/verify-release.cjs`).
- GitHub workflow actions are pinned to commit hashes; workflows use limited permissions and checkout without persisting credentials. GitHub/SignPath account settings remain unverified.
- Project-map logic excludes common credential paths and labels repository-derived instructions as untrusted (`project-context.js`). Attachments and changes have validation/hash/confinement checks in the reviewed services/tests.

These protections reduce risk; the app still intentionally runs powerful user-authorised providers and desktop tools with the user's operating-system privileges. A Git worktree is an isolation mechanism for project edits, not an OS security sandbox for arbitrary tool processes.

## Data-flow and disclosure inventory

| Data/use | Destination or storage | Audit interpretation |
| --- | --- | --- |
| Saved conversations, memories, reminders, settings, grants, copied attachments and task state | Local app data, JSON/IndexedDB/files, principally `%LOCALAPPDATA%\ATLAS` | No publisher upload identified in these source paths; local copies and backups need clear retention/deletion documentation. |
| Prompts, selected attachments, relevant project context, model/tool output and inter-model handovers | User-selected OpenAI/Anthropic CLI/account, and any integrations/tools the user enables | Free/local installation does not make inference offline. Document provider receipt, inter-model sharing, usage costs and selected-provider settings. |
| Microphone audio | Browser memory and local Whisper service in the reviewed path | Local recognition; recognised text can become a provider prompt. No publisher audio collection identified; exact transient retention was not exhaustively traced under every failure. |
| Screenshots and desktop results | Local action path and the provider requesting them | May contain personal/confidential data. Permission and accurate disclosure are needed before cloud transfer. |
| Optional ElevenLabs spoken-answer text | ElevenLabs API with the user's key | Cloud speech, not local Kokoro/Whisper. Disclose text transmission and the user's own provider terms/costs. |
| App update/model/runtime requests | GitHub, Hugging Face and configured package/runtime hosts | Hosts receive network metadata such as an IP address. This is distinct from the ATLAS publisher operating telemetry. |
| Usage refresh | Codex supported local app-server path; Claude direct OAuth usage request in S1 | Remove/authorise the Claude credential-reuse path. Do not conflate it with model inference through the unmodified CLI. |
| Logs and exported diagnostics | Local log file or wherever the user sends them | `app-log.js:13–28` formats console arguments without a general redactor, although some provider-specific code redacts errors. No actual leaked credential was demonstrated. Provide redacted export/support guidance rather than request raw files in public issues. |

No publisher analytics or crash-upload implementation was identified in the examined source. This is a source review result, not packet-capture proof that all third-party binaries make no additional requests.

## Australian and international applicability

The publisher is Australian and the project is free/non-monetised. The detailed legal report cites official OAIC, ACCC, Australian government, NSW legislation, EU and US sources and explains conditions.

- **Copyright/provider contracts:** applicable licence conditions and provider terms still matter when software is free. Resolve S1/S3 first; the MIT disclaimer does not grant rights to every dependency, model, voice or brand.
- **Australian privacy:** no publisher collection reduces operational exposure. Determine whether the publisher is an APP entity; do not assume that being small or having no server removes every privacy claim. Australia's serious-invasion-of-privacy tort has broader reach than APP coverage, with specific legal elements and defences.
- **Recording:** state/territory listening-device rules depend on circumstances. This review does not establish a universal consent rule or that the current defaults constitute an offence. Deliberate opt-in is the practical design recommendation.
- **Consumer/marketing law:** confirm trade-or-commerce/supply applicability for a genuinely non-commercial project; avoid misleading guarantees regardless. Do not write terms claiming to exclude non-excludable rights.
- **EU:** genuinely non-commercial FOSS is a material CRA scope exclusion. Do not demand CE marking solely because ATLAS has an installer. GDPR requires actual processing/role/territorial analysis; the AI Act has distinct scope and exemptions. A downloadable app's global availability does not settle those questions. See the legal report for current dates and primary sources.
- **US/other countries:** incidental availability is not a completed jurisdiction analysis. No blanket CCPA/COPPA/cookie-banner requirement is asserted for this Australian local-only free project. Reassess if markets, audience or processing change.
- **Future website/support:** a static website still has a hosting provider; logs, contact forms, analytics, cookies or support attachments can change the no-publisher-data assumption. Review its actual configuration before launching it.

The report is not a complete review of all Australian states/territories, all foreign laws, patents/trademark clearance, employment monitoring, medical/financial uses, accessibility obligations in a particular supply, sanctions/export controls, or contractual commitments to customers. No regulated intended use has been established.

## Proposed remediation and release gates

1. Remove/replace Claude token scraping and address S2's fail-open syntax and permission wording. Test both explicit-risk detection and unknown syntax; preserve revocation, chat scoping and pending-approval cancellation.
2. Resolve exact GPL/LGPL obligations with an open-source licensing specialist. Add versioned notices and corresponding-source instructions to the installer. Inventory the actual shipped native/model components, not only top-level npm metadata.
3. Introduce microphone opt-in and verify capture indicators/stop, qualify the README's verification claim, and publish accurate local-storage/provider/retention disclosures. Consider first-run acceptance of concise operational limitations; do not draft a sweeping liability waiver as a substitute for safe behaviour.
4. Complete signing/publisher pinning, harden the package, and add final-artifact checks. Review the transition for existing unsigned installations; do not enable a guessed publisher value and break updates.
5. Establish private reporting and supported-version/update practices. Add ongoing dependency monitoring and a release SBOM/notice inventory. Review logs and local data cleanup controls.
6. Before release, run the unit/UI checks plus negative security tests, inspect the exact installer and its extracted files, check signatures/update refusal on tampered/wrong-publisher packages, and perform an independent security assessment of desktop grants and IPC. Record artifact hashes and any residual risks.
7. Have an Australian software/privacy lawyer review the scope, disclosures, licence remediation and terms. Confirm legal identity, intended audience and foreign marketing before claiming broader compliance.

Steps 1–5 are proposed work, **not changes made by this audit**. A lawyer/third party should be shown this report with the exact proposed release, rather than asked to approve an abstract promise that the app is local or free.

## Technical reference sources

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security/): technical guidance, not legislation.
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) and [ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity): additional packaging protections, including the paired integrity and ASAR-only options.
- [electron-builder v26 code-signing documentation](https://www.electron.build/v26/docs/features/code-signing/) and [v26 updater documentation](https://www.electron.build/v26/docs/features/auto-update/): reference family matching this repository's v26 builder. Exact publisher-verification behaviour was also checked against installed electron-updater 6.8.11 source. No SmartScreen-bypass or universal legal signing claim is made.
- [Provider/licensing sources and detailed evidence](LICENSING-RESEARCH-2026-10-28.md).
- [Official legal sources and conditional applicability](LEGAL-RESEARCH-2026-10-28.md).
