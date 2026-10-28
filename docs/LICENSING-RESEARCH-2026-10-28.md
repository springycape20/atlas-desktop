# ATLAS licensing and provider-terms research

Research date: 28 October 2026. Source checkout: `codex/handover-follow-ups`, based on ATLAS 0.8.2. This is a scoped technical and primary-source review, not legal clearance or a guarantee against claims.

The owner clarified that ATLAS will remain a free public GitHub download, with no developer-operated servers or collection of users' files, chats or credentials. A possible future static website is outside the current implementation. Free distribution does not eliminate copyright-license obligations. Any change to hosting, charging, advertising, bundled credentials or data collection requires reassessment.

## Priority findings

### L1 — Remove direct reuse of Claude subscription credentials from the usage widget

**Confirmed implementation; high contractual risk.** `provider-usage.js:103` reads Claude Code's `.credentials.json`; lines 106–112 take its OAuth access token (or `CLAUDE_CODE_OAUTH_TOKEN`) and call `https://api.anthropic.com/api/oauth/usage` directly. This differs materially from launching the unmodified Claude Code binary.

Anthropic's current official documentation prohibits third-party collection, storage or intermediation of Claude.ai credentials/session tokens. The same page expressly permits end users signing into the unmodified Claude Code binary, subject to its product-hosting conditions. Consequently this review does **not** conclude that every local Claude CLI integration is prohibited. The usage-token handling needs removal or express authorization; use an approved CLI surface or link users to their provider's usage page. Confirm the app's CLI hosting arrangement against the Commercial Terms and preserve every native authentication method. [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).

No credentials were opened and no authenticated requests were made during this audit. Evidence is source code only.

### L2 — Resolve the speech dependency's embedded GPL component before treating the whole bundle as MIT-only

**Confirmed component provenance; legal scope requires review.** `package.json` depends on `kokoro-js` 1.2.1. Its installed metadata depends on `phonemizer` ^1.2.1; the installed `phonemizer` 1.2.1 identifies itself as an eSpeak NG converter. Its Apache-2.0 package metadata covers the wrapper, while its upstream source imports the compiled `espeakng.worker.js` and that worker exposes eSpeak NG bindings. The installed compiled distribution includes eSpeak engine/data material. [Phonemizer source](https://raw.githubusercontent.com/xenova/phonemizer.js/main/src/phonemizer.js), [compiled worker source](https://raw.githubusercontent.com/xenova/phonemizer.js/main/src/espeakng.worker.js).

eSpeak NG's own project identifies its license as GPL-3.0-or-later. GPL sections 4–6 address notices, combined works and corresponding source when distributing object code, including free network downloads. A GitHub repository containing ATLAS source alone does not establish that the exact eSpeak source, build scripts and other corresponding material are available to recipients. [eSpeak NG license information](https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/README.md), [GPL text supplied by eSpeak NG](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING).

**Action:** obtain the exact bundled eSpeak revision and reproducible corresponding-source/build materials; include required notices and source-access instructions with releases. Have an open-source licensing specialist decide whether the current direct library integration affects the license of the combined work, or replace/separate it appropriately. This review does not assert that all ATLAS code must automatically become GPL, and changing only `package.json`'s license string would not resolve the issue.

### L3 — Inventory the native image library and provide its LGPL compliance material

**Confirmed distribution branch; compliance not demonstrated.** Installed `node_modules/@img/sharp-win32-x64/package.json` identifies version 0.35.5 as `Apache-2.0 AND LGPL-3.0-or-later`. Its `lib/` directory contains `libvips-42.dll`, `libvips-cpp-8.18.7.dll` and the sharp Node binding. The inspected package's `LICENSE` contains Apache text; it does not itself establish complete LGPL compliance.

The upstream libvips license permits redistribution subject to its conditions, including source/relinking-related requirements for relevant distributions. The exact version and license election must be established from the distributed binaries and dependency build provenance. [libvips license](https://raw.githubusercontent.com/libvips/libvips/master/LICENSE). The installed Windows package specifically declares LGPL-3.0-or-later, so do not substitute an assumption based only on the upstream project's LGPL-2.1 text.

**Action:** inventory all DLL components and versions, preserve copyright/license notices, document access to corresponding library source, and verify the applicable replacement/relinking obligations for the native binding. Obtain licensing advice on the actual packaging rather than assuming a DLL automatically satisfies every condition. This is a license-compliance review item, not a finding that using sharp is forbidden.

### L4 — Build release-level notices for native speech, model and inference components

**Confirmed packaging configuration gap.** `package.json:62` copies speech resources using filters that permit only `whisper-server.exe`, `*.dll` and two `*.bin` model files. The source speech directory is otherwise excluded. No explicit speech license/model-card inclusion or release-level third-party notice manifest was found. `Setup-ATLAS.ps1:21` pins whisper.cpp v1.8.7; lines 29–39 pin the Whisper model repository revision and checksums.

whisper.cpp v1.8.7 is MIT-licensed and requires preservation of its notice. The pinned converted Whisper model repository is identified as MIT. [whisper.cpp v1.8.7 license](https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.7/LICENSE), [pinned Whisper model card](https://huggingface.co/ggerganov/whisper.cpp/blob/5359861c739e955e79d9a303bcbc70fb988958b1/README.md).

`voice-worker.cjs:16` downloads `onnx-community/Kokoro-82M-v1.0-ONNX` without a revision parameter. Its model card declares Apache-2.0. Preserve the applicable model/voice notices and record the exact downloaded revision; licenses of a model, its wrapper and its inference engine must be tracked separately. [Kokoro ONNX model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/blob/main/README.md). Apache section 4 requires the license and applicable notices when redistributing covered work. [Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0).

ONNX Runtime 1.21.0 is MIT-licensed with Microsoft's copyright notice. The inspected local archive contained its package and binaries, but no ONNX Runtime-named LICENSE or ThirdPartyNotices file was found in that package's archived/unpacked paths. A complete notice scan is needed, since notices might be collected elsewhere. [ONNX Runtime v1.21.0 license](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.21.0/LICENSE).

**Action:** generate a versioned component/notice manifest from the final installer, including transitive/native libraries, downloaded model/voice files, and their source/provenance. Add packaged-license checks to release verification. Preserve existing Electron/Chromium and npm notices; a credit sentence in an excluded README is not a substitute for required distributed license text.

## Provider integration checks

### OpenAI Codex

`codex-connection.js:16` launches the user's installed executable with `app-server`. OpenAI documents this interface for rich local integrations. Its authentication section says existing local/open-source applications may continue using app-server authentication, while commercial or hosted services require the appropriate supported integration. The clarified free local/open-source distribution is consistent with that documented category; this is not blanket contractual approval for every feature. Retain the user's native authentication and permissions and reassess if the distribution model changes. [Official OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server#auth-endpoints).

### Anthropic CLI integration

`claude-connection.js:35` launches the user's installed CLI with stream-JSON flags, rather than implementing model inference directly using a scraped token. This should be assessed separately from L1. Verify that the executable remains unmodified, native authentication choices remain available, and billing remains directly between each user and Anthropic. Do not represent ATLAS as endorsed or an official Claude product. The conditions and credential distinction are documented in the [same official legal page](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products).

### ElevenLabs

`main.js:497` calls ElevenLabs using the user's own key; the README describes that feature as optional. Current non-EEA terms distinguish noncommercial free-plan use from commercial use under a paid plan, and require authorized rights to content/voices. Explain those conditions to users and make the cloud text transfer clear. [ElevenLabs terms, updated 9 October 2026](https://elevenlabs.io/terms-of-use).

The OEM terms concern making bundled services available under an underlying agreement and impose additional conditions. A free local application in which every user supplies their own key is not enough evidence to declare it an OEM reseller; obtain clarification before bundling shared credentials, reselling voice usage or operating a hosted offering. [ElevenLabs OEM terms](https://elevenlabs.io/oem-terms).

## Branding and provenance

`README.md:132` says ATLAS is independent and not affiliated with OpenAI or Anthropic. Preserve accurate plain-text compatibility descriptions and avoid suggesting endorsement. This review did not perform an ATLAS trademark clearance search, confirm ownership of the Beacon asset pack, or determine whether any Graphify code/assets were copied rather than independently implemented. Preserve original asset-generation/source records and perform those checks before broader promotion. A package's software license does not necessarily grant brand rights; Apache section 6 is an example. [Apache license](https://www.apache.org/licenses/LICENSE-2.0).

## Artifact inspection and limits

The existing local `dist/win-unpacked/resources/app.asar` was inspected read-only using the installed `@electron/asar` library. Its embedded `package.json` says **0.8.0**, and its file modification time is **2026-10-27T15:32:01.805Z**. It is stale and is **not proof of the contents of current HEAD or the published 0.8.2 installer**. No rebuild, install or release download was performed.

- The archive contains 157 license-related paths, including many npm LICENSE files. The outer application directory has `LICENSE.electron.txt` and `LICENSES.chromium.html`. It would be incorrect to say no third-party licenses are shipped.
- The artifact contains the phonemizer dependency and the native sharp package. No archive paths named NOTICE or COPYING were found. No ONNX Runtime-named license/notice was found in its archived or unpacked package paths.
- A paths-only scan found no `.handover`, `.env`, `.codex`, `.agents`, `.aws` or `.git` entries. This does not establish an exhaustive absence of secrets and does not certify a future package made with broad `**/*` inclusion.
- The local artifact has no speech resource directory; speech inclusion conclusions above concern current packaging configuration, not a claim that those resources were verified in this old build.

Before closing L2–L4, inspect the exact release installer, enumerate its actual licenses/DLLs/model files, and record the binary hashes, corresponding-source locations and reviewed obligations. Existing component metadata is evidence to investigate, not a legal compliance certificate.
