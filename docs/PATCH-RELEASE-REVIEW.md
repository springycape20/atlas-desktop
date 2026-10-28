# ATLAS 0.8.3 technical release review

Prepared 28 October 2026 for the owner's requested free public patch. This is a technical risk-reduction review, not a lawyer's opinion, global compliance certification or assurance against claims and fines.

## Dependency scope

The owner authorized removing Kokoro for this patch. `kokoro-js`, phonemizer's embedded eSpeak, Transformers, ONNX Runtime and sharp/libvips are removed from production dependencies and the packaged app. Existing Kokoro settings migrate to Windows speech; optional ElevenLabs remains. The release check rejects these removed packages and any new GPL/LGPL production-lock entry pending renewed review. Package inspection also checks their absence. Historical research in `THIRD-PARTY-SOURCE-REVIEW.md` is retained as evidence for any future reintroduction, not as a current component list.

The remaining npm production dependency licences are inventoried from the exact lockfile, with installed licence/notice texts copied into the package. `lazy-val` 1.0.5 declares MIT and names Vladimir Krivosheev but supplies no separate licence/copyright file in either its package or matching source revision; a supplemental notice preserves that metadata and standard MIT terms without inventing a copyright year. Whisper runtime/model notices are pinned by source hash. Electron's own licence and Chromium third-party notices ship alongside its executable. Preserve all of these materials when redistributing. The inventory covers npm packages; it does not claim exhaustive analysis of every native system component or third-party service.

Removing components in a new release does not retroactively settle obligations for older published installers containing them. Their exact-source research remains available; do not describe those earlier releases as cleared. Any future source request or remediation of historical distribution needs its own review.

## Disclosures and controls

Privacy documentation describes provider traffic, local plaintext records, microphone consent, third-party tools, retention and deletion limits. Claude usage no longer reads sign-in credentials. Continuous microphone features require opt-in, remembered shell permission is stricter, common secrets are redacted from diagnostics, and local reset requires native confirmation. AI review results and tests are not guarantees of correctness. No publisher telemetry or hosted inference service has been added.

## Signing decision

SignPath denied the application because the project has no active users, as reported by the owner. On 28 October 2026 the owner explicitly approved allowing an unsigned patch under the release gate while retaining dependency-removal, notices, hashes and test checks. There is no signing certificate or authenticated publisher claim. Windows may warn about the unsigned download. Installer hashes and the GitHub release feed provide integrity checks but do not replace publisher authentication. Future signed releases must pin and verify the actual publisher and test the update transition.

## Review record

`legal/release-review.json` binds the technical review to the exact dependency lock. It records technical verification and the owner's unsigned-release decision; it must not be presented as a lawyer's approval. Final artifact verification checks version, removed dependencies, notices, private-path exclusions, speech model hashes, binary fuses, ASAR integrity and updater hashes. Tests use fixtures and isolated data, without real provider accounts. Record actual passing checks and final artifacts before marking this review complete.

The Australian applicability research remains in `LEGAL-RESEARCH-2026-10-28.md`. Reassess it before adding monetization, servers, analytics or new collection. An Australian software/privacy lawyer can review remaining fact-specific questions and historical distribution obligations.

## Verification completed locally

422 unit tests passed, with no failures or skips. All seven Electron fixture suites passed: Assistant, Settings, release screens, Colab, graph, approvals and disputes. The production advisory scan reported zero vulnerabilities on 28 October 2026. A Windows x64 unsigned NSIS installer was built; package inspection verified the removed dependency chain is absent, current notices and inventory are present, only the required Whisper server/DLLs ship, and model hashes, binary fuses, ASAR integrity and updater hashes pass. Release CI repeats these checks for the published build. These checks do not constitute independent penetration testing or a legal opinion.
