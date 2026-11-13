# Proprietary distribution: dependency review

Research date: 14 November 2026 (Australia/Sydney). Scope: third-party software, models, assets and existing compliance controls in the current ATLAS 0.12.1 checkout. This is technical licensing research, not legal clearance. Ownership of ATLAS contributions, existing MIT grants, commercial provider contracts and the final EULA require separate review.

## Conclusion

**A proprietary licence for future ATLAS application code appears possible from the npm dependency position, subject to preserving third-party rights. The complete Windows installer is not cleared for a proprietary release by this review.** The current production lock contains only permissive licence expressions, and the old Kokoro/eSpeak/sharp chain has been removed. However, the bundled Electron/Chromium runtime carries additional licences, including LGPL material. Its exact corresponding-source and replacement obligations, and any EULA exceptions needed to preserve them, must be checked before a closed-source release.

A dependency does not become proprietary merely because ATLAS does. Apache-2.0 explicitly allows additional terms for an overall derivative work while requiring compliance for the Apache-covered portion. MIT likewise permits sublicensing while retaining its notice condition. [Apache-2.0 section 4](https://apache.org/licenses/LICENSE-2.0.html), [Electron's MIT licence](https://github.com/electron/electron/blob/main/LICENSE).

## Evidence inspected

- Checkout HEAD: `2831c6de7521c905d28fa247a05f4b767b33f757`; root package version 0.12.1.
- `package-lock.json` SHA-256: `ec49af3577c6d8756c7e82c57d6665261e449ce1487bd07f30ba264145d08786`. This matches `legal/release-review.json` and the locally packaged review.
- `package.json`, production-lock entries, installed licence files, `build/prepare-compliance.cjs`, `build/release-policy.cjs`, `build/verify-package.cjs`, `legal/license-sources.json`, and the existing licensing/release research.
- Read-only enumeration of local `dist/win-unpacked/resources/app.asar`: embedded package version 0.12.1, 5,251 paths. The associated compliance inventory also identifies 0.12.1. This is local packaged evidence; the public installer was not independently downloaded for this research.
- `dist/win-unpacked/LICENSE.electron.txt`, `LICENSES.chromium.html`, native resources and the packaged compliance directory. No rebuild or application execution was performed.

## Current npm dependencies

The lock has 135 production entries. The generated/local packaged SBOM contains 125 installed production components; its stated scope is installed npm packages, not a complete inventory of every native runtime component or model. Different installed counts can reflect platform-specific packages, and are not permission to ignore native components.

| Licence expression | Installed SBOM count | Proprietary-distribution implication |
| --- | ---: | --- |
| MIT | 109 | Preserve licence/copyright notices; do not claim exclusive ownership of upstream code. |
| ISC | 9 | Preserve applicable upstream notices. |
| BSD-3-Clause | 3 | Preserve notices/disclaimers and respect the non-endorsement clause. |
| BSD-2-Clause | 1 | Preserve notices/disclaimers. |
| Apache-2.0 | 1 | Preserve licence and applicable NOTICE/attribution material; mark covered modifications; respect patent/trademark provisions. |
| Python-2.0 | 1 | Preserve the applicable licence/acknowledgements and required modification descriptions. |
| BlueOak-1.0.0 | 1 | Pass on its licence text or required link. |

No production-lock expression matched GPL, LGPL, AGPL, MPL, EPL, CDDL, BUSL or SSPL during this review. That is a metadata screening result, not proof that the entire installer is free of copyleft code.

The eight direct runtime dependencies are `@modelcontextprotocol/sdk` 1.32.1, `@xterm/addon-fit` 0.11.0, `@xterm/xterm` 6.0.0, `diff` 9.0.0, `electron-updater` 6.8.11, `node-pty` 1.1.0, `pdfjs-dist` 6.4.299 and `prismjs` 1.30.0. Their declared licences are MIT except PDF.js, which is Apache-2.0. The root licence files were checked alongside generated notice evidence, rather than treating npm labels alone as clearance. [PDF.js licence](https://github.com/mozilla/pdf.js/blob/master/LICENSE), [node-pty licence including Microsoft notices](https://raw.githubusercontent.com/microsoft/node-pty/main/LICENSE), [Prism licence](https://raw.githubusercontent.com/PrismJS/prism/master/LICENSE).

The Python-2.0 entry is `argparse` 2.0.1; its local licence reproduces Python's licence history and terms. Python's official documentation expressly distinguishes GPL compatibility from being GPL-licensed and permits modified distributions without making all changes open source. The Blue Oak entry is `sax` 1.6.1; its installed `LICENSE.md` matches the model licence's permissive grant and notice rule. [Python licensing](https://docs.python.org/3/license.html), [Blue Oak 1.0.0](https://blueoakcouncil.org/license/1.0.0).

## Historical GPL/LGPL findings versus the current release

The 28 October research described an earlier release with `kokoro-js`, phonemizer/eSpeak NG, Transformers, ONNX Runtime and sharp/libvips. That historical research must not be presented as the current dependency list.

`docs/PATCH-RELEASE-REVIEW.md` records their removal in 0.8.3. The current lock no longer includes that chain. Path-boundary checks found none of those packages in the local 0.12.1 ASAR. `build/release-policy.cjs` rejects reintroduction of that chain or GPL-labelled production entries pending renewed review; `build/verify-package.cjs` separately checks the final package and SBOM. A string search for “sharp” without path boundaries is misleading because Prism legitimately contains C#, F# and Q# grammars.

PDF.js's unused Liberation TTF files and `LICENSE_LIBERATION` are explicitly excluded by `package.json` and checked by `build/verify-package.cjs`. The local ASAR had no matching Liberation TTF paths. The installed Liberation licence is GPLv2 with exceptions; its presence in `node_modules` does not mean those font files are shipped. Other PDF rendering resources retain their own notices: the local `LICENSE_JBIG2` and `LICENSE_FOXIT` contain permissive PDFium terms. The compliance builder copies these relevant notices.

Removing a component from a new release does not resolve distribution duties for older installers containing it. eSpeak NG's upstream licence remains GPLv3; any historical corresponding-source issue requires its own assessment. Nothing in this research removes or rewrites older licence obligations. [eSpeak NG licence](https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/COPYING).

## Remaining native-runtime review

Electron 45.0.0 itself is MIT-licensed. The locally packaged Electron notice preserves that grant. It does not replace Chromium's separate component licences. [Electron licence](https://github.com/electron/electron/blob/main/LICENSE).

The local Windows package includes `ffmpeg.dll` (3,097,600 bytes). `LICENSES.chromium.html` includes an FFmpeg section and LGPL material for the Braille Translation Library/liblouis. Some licence files also reproduce optional/GPL compatibility text; a textual occurrence alone does not identify enabled GPL build options. Conversely, a permissive npm inventory cannot certify the native build.

FFmpeg's official guidance says its baseline is LGPL-2.1-or-later, with optional GPL components changing its licensing. It describes exact-source/build-information requirements and EULA considerations. The native build provenance and actual configuration must therefore be verified; this review did not establish a complete corresponding-source delivery arrangement for the exact Electron runtime. [FFmpeg legal guidance](https://ffmpeg.org/legal.html).

LGPL components do not automatically prohibit proprietary application code. Their applicable licence version and integration may require notices, corresponding library source and mechanisms or permissions to replace/relink/debug modified covered libraries. A blanket “no reverse engineering or modification under any circumstances” EULA must not override mandatory third-party rights. The current binary fuses and ASAR integrity also warrant checking for compatibility with any applicable replacement requirement; do not disable these protections without an engineering and legal design review. [GNU licensing FAQ on LGPL and linking](https://www.gnu.org/licenses/gpl-faq.html#LGPLStaticVsDynamic).

This is an unresolved compliance boundary, not a finding that all ATLAS application source must become GPL or that Electron cannot be used commercially. Obtain a version-specific native-runtime review before approving proprietary distribution.

## Speech models, copied code and assets

`Setup-ATLAS.ps1` pins whisper.cpp v1.8.7 and the converted Whisper models to revision `5359861c739e955e79d9a303bcbc70fb988958b1`, with checksums. The configured packaged runtime is restricted to the Whisper server and required ggml/Whisper DLLs, plus `ggml-tiny.en.bin` and `ggml-small.en-q5_1.bin`. The pinned runtime licence is MIT; the pinned model card identifies MIT. Required source notices/model provenance are included by the compliance builder. [Pinned whisper.cpp licence](https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.7/LICENSE), [pinned model card](https://huggingface.co/ggerganov/whisper.cpp/blob/5359861c739e955e79d9a303bcbc70fb988958b1/README.md).

`build/bundle-syntax.cjs` incorporates Prism's licence into generated `syntax-highlight.js`. Preserve it when minifying or obfuscating. The pre-existing generated file was not modified in this research.

Original art/brand provenance remains a separate evidence question. Existing notes explicitly did not establish Beacon artwork rights, Graphify-related provenance or ATLAS trademark clearance. This review found no new documentary grant that closes those questions. Do not infer rights from possession of `assets/beacon.png`, `beacon-working.png`, `app-icon.png` or the build icon, and do not delete notices as an anti-copying measure. The owner should retain creation/source/licence records for artwork and any copied implementation material.

## Existing gates and next steps

The current release record's `technical-review-complete` status and empty `openItems` list are tied to the existing 0.12.1 technical review; they are not proprietary-licensing approval. The release policy contains no rule requiring ATLAS's root licence string to remain MIT, but simply changing that string would not satisfy the requirements above.

Before a proprietary release:

1. Confirm ownership and relicensing authority for ATLAS's own code separately; retain all upstream licence grants and notices.
2. Resolve the exact Electron/Chromium native-source, build-configuration and library-replacement obligations, and preserve third-party EULA carve-outs.
3. Confirm artwork/copied-code provenance and repeat package-level compliance inspection for the proposed release, not just the current source tree.
4. Reassess provider integration contracts for the intended proprietary/commercial model. The October free-local/open-source assumptions are no longer enough to approve a new business model.
5. Update product metadata, licence screens, source/release/download statements and the release review together only after the owner chooses a licensing model and qualified counsel reviews the terms.

No code, package versions, licences, release records, generated notices or published releases were changed by this dependency research.
