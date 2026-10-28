> Historical dependency research: Kokoro and the affected production dependencies were removed for 0.8.3 with owner approval. This document remains relevant to earlier releases and any future reintroduction; see PATCH-RELEASE-REVIEW.md for the current patch.

# Third-party source review: Kokoro and native image libraries

Prepared 28 October 2026 for legal review. The owner elected to keep Kokoro. This document records verified component identities, usable source references, and unresolved release conditions. It is not a licence clearance, and copying licence texts alone does not settle GPL combined-work or LGPL replacement/relinking requirements.

## Component evidence

| Distributed component | Version / identity | Licence evidence | Attribution evidence |
| --- | --- | --- | --- |
| `kokoro-js` | Installed 1.2.1 | Installed `LICENSE` and package metadata: Apache-2.0 | Package author hexgrad; contributor Xenova. The installed licence is generic Apache text, not a complete list of component copyright notices. |
| `phonemizer` wrapper | Installed 1.2.1; upstream release commit `6835144b7ee9043129222549c1ed2f6a27216278` | Installed `LICENSE` and package metadata: Apache-2.0 | Package author Xenova. Preserve source headers and additional upstream notices. |
| Embedded eSpeak NG engine/data | Present inside phonemizer's compiled JS; exact original C/data revision **unconfirmed** | eSpeak NG project: GPL-3.0-or-later; wrapper metadata does not replace engine licence | Jonathan Duddington, Reece H. Dunn and other eSpeak NG contributors; exact notices must come from the matching source revision. |
| Kokoro model / ONNX export | `onnx-community/Kokoro-82M-v1.0-ONNX`; snapshot `1939ad2a8e416c0acfeecc08a694d14ef25f2231` | Snapshot model card: Apache-2.0 | hexgrad model project; ONNX Community/Xenova export. Preserve model card and actual accompanying notices; this is provenance, not an invented copyright statement. |
| `sharp` | Installed 0.35.5; upstream release commit `51a990faa26ade5586a4934ac9673c98d8893326` | Apache-2.0 for wrapper/binding source | Upstream README and source headers: Copyright 2013 Lovell Fuller and others. |
| `@img/sharp-win32-x64` | Installed 0.35.5, contains libvips 8.18.7 | Package metadata: `Apache-2.0 AND LGPL-3.0-or-later`; README identifies additional native library licences | Preserve native package README and each matching upstream notice; Lovell's wrapper copyright does not replace native component copyrights. |

Local identity evidence is in `node_modules/kokoro-js/package.json`, `node_modules/phonemizer/package.json`, `node_modules/@img/sharp-win32-x64/package.json`, its `README.md` and `versions.json`, and the repository lockfile. The source links below were fetched from their publishers. No dependency was installed and no model inference or provider account was used.

## Kokoro JavaScript wrapper and phonemizer

The [Kokoro JS package source](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) identifies 1.2.1 and its build script: Rollup, TypeScript, then copying the root licence. The local lockfile fixes the npm tarball/integrity; an exact Git commit tying that tarball to source was not established in this review. Preserve the npm package and integrity, locate the matching source commit, and retain `kokoro.js/` plus root notices before representing the release as source-complete.

The [phonemizer 1.2.1 source commit](https://github.com/xenova/phonemizer.js/tree/6835144b7ee9043129222549c1ed2f6a27216278) is verified. Its [build configuration](https://raw.githubusercontent.com/xenova/phonemizer.js/6835144b7ee9043129222549c1ed2f6a27216278/rollup.config.js) takes `src/phonemizer.js` and emits ESM/CommonJS bundles with commonjs/terser plugins. Its package script runs `rm -rf dist types && rollup -c && tsc`. These are instructions for future controlled source reproduction, not commands run during this review.

That source imports `src/espeakng.worker.js`, which already contains compiled engine code/data. Rebuilding the wrapper therefore does **not** prove availability of the preferred C/data source or the scripts that generated the embedded worker. The wrapper's `package-lock.json`, `rollup.config.js`, `tsconfig.json`, source files, headers and licence should all be retained.

### eSpeak corresponding-source gap

The [official eSpeak NG project](https://github.com/espeak-ng/espeak-ng) declares GPL-3.0-or-later. Its historical [Emscripten build instructions at revision `0dfd1d77dd7f96ef1ea6856c9fa5cfac01599582`](https://raw.githubusercontent.com/espeak-ng/espeak-ng/0dfd1d77dd7f96ef1ea6856c9fa5cfac01599582/emscripten/README.md) describe autotools, library/data compilation, and `emmake make` in `emscripten/`. That revision is a **research lead, not a verified match** to phonemizer's embedded worker. Do not present it as the corresponding source without a provenance/reproduction check.

Still needed:

1. Confirm the exact eSpeak C/data commit, local patches, generated bindings, language/data selection, Emscripten version and build flags used for the shipped worker.
2. Retain the corresponding preferred source and all build/install scripts, not only generated JavaScript or a repository homepage link.
3. Establish an adequate, durable source-delivery arrangement with clear directions next to the release download. Do not assume an unqualified three-year offer is the correct mechanism for every network distribution.
4. Have an open-source lawyer assess whether the direct Kokoro/phonemizer integration forms a covered combined work and what licensing/distribution arrangement is required. A worker thread, separate npm package or an MIT notice does not by itself decide that question.

Relevant primary licence: [eSpeak NG's GPLv3 text, particularly sections 4–6](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING).

## Immutable Kokoro model snapshot

Verified repository snapshot: **`1939ad2a8e416c0acfeecc08a694d14ef25f2231`**. The [snapshot tree](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231) includes `config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/` and `voices/`. The [model card at this snapshot](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/blob/1939ad2a8e416c0acfeecc08a694d14ef25f2231/README.md) declares Apache-2.0.

The q8 file is `onnx/model_quantized.onnx`. Its [publisher's immutable blob page](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/blob/1939ad2a8e416c0acfeecc08a694d14ef25f2231/onnx/model_quantized.onnx) supplies SHA-256 **`fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`**. This hash was read from publisher metadata; the 92.4 MB model was not downloaded or independently hashed here.

Important implementation detail: installed `kokoro-js` 1.2.1's `KokoroTTS.from_pretrained` only forwards dtype/device/progress options. Passing it `revision` alone silently does not pin the underlying transformer loads. The Node implementation loads voices from the installed package's `voices/*.bin`; its browser fallback uses a `resolve/main` URL. A correct pin must cover the actual model/tokenizer loading path and account for voice files separately. Reinspect this behavior if the wrapper version changes.

## Native image libraries and builds

The [sharp 0.35.5 source](https://github.com/lovell/sharp/tree/51a990faa26ade5586a4934ac9673c98d8893326) includes build entrypoint `install/build.js`, native source under `src/`, distribution generation and release CI. Its source-build entrypoint checks for node-addon-api/node-gyp and performs a native rebuild. Native dependency provenance is additionally required; rebuilding the sharp binding alone is insufficient.

The native package's installed `versions.json` reports:

```text
aom 3.15.1; archive 3.8.9; cairo 1.18.6; cgif 0.5.4; exif 0.6.26;
expat 2.8.5; ffi 3.8.0; fontconfig 2.18.3; freetype 2.14.3;
fribidi 1.0.17; glib 2.90.0; harfbuzz 14.5.0; heif 1.23.5;
highway 1.4.0; imagequant 2.4.1; lcms 2.19.1; mozjpeg 0826579;
pango 1.58.2; pixman 0.46.4; png 1.6.58; proxy-libintl 0.5;
rsvg 2.63.2; tiff 4.7.2; uhdr 2.0.2; vips 8.18.7; webp 1.6.0;
xml2 2.15.4; zlib-ng 2.3.3.
```

The native README assigns LGPLv3 to several libraries (including libvips, glib, fribidi, pango, libheif and librsvg) and MPL1.1 to cairo, with additional codec licences. Keep this exact installed README. [Sharp's packaging script](https://raw.githubusercontent.com/lovell/sharp/v0.35.5/npm/from-local-build.js) explicitly appends native third-party licence information to the README; retaining only its Apache `LICENSE` misses that information.

Upstream native build route: [sharp-libvips](https://github.com/lovell/sharp-libvips) post-processes Windows static-web builds from [build-win64-mxe](https://github.com/libvips/build-win64-mxe). A follow-up review matched the installed version table against two immutable source checkpoints:

- [sharp-libvips `1f01639b2cae66b5e0d59964a387c291c0b0e2cd`](https://github.com/lovell/sharp-libvips/commit/1f01639b2cae66b5e0d59964a387c291c0b0e2cd), whose `versions.properties` agrees with every installed entry above.
- [build-win64-mxe `v8.18.7`, commit `ef19ca09af2453d127453d677c849ccb37cf5694`](https://github.com/libvips/build-win64-mxe/tree/ef19ca09af2453d127453d677c849ccb37cf5694), whose README lists the matching Windows web-build component versions and whose `build/vips.mk` pins the libvips source tarball checksum to `5baaead3b0bb20ffdb9e9ff09aa9fda08620923df77b63b436654cb5e0b3bf94`.

The upstream Windows post-processing script downloads `vips-dev-x64-web-8.18.7-static.zip`. [Release metadata](https://api.github.com/repos/libvips/build-win64-mxe/releases/tags/v8.18.7) identifies that asset as 9,398,858 bytes with SHA-256 `a736af61d3b46499760efa606e469cb14e060445b1f6fd36a1fa2e75009e1197`. The archive was subsequently downloaded into the ignored local review folder without installing or executing it. Its SHA-256 matches the published digest. Hashing `vips-dev-8.18/bin/libvips-42.dll` directly inside the ZIP produced `06dab07cc386748513337a31672b1d5269fbc770a14ff403080575665bf0813f`, an exact byte match to the installed DLL. This establishes that DLL-to-release link. The archive contains no file named `libvips-cpp-8.18.7.dll`; that DLL and the sharp binding still need their own build mapping. No native build was reproduced. The release is not marked immutable by GitHub; retain the digest with any archived copy.

Remaining native gap: establish the actual compiler/container/MXE revisions, patches, source archives and options for the binary published in the npm tarball; compare its DLLs to the identified upstream asset or reproduce them. `build.sh` at the tag uses a prebuilt `:latest` container by default, so checking out that tag alone does not pin the build environment. Current default branches have newer versions and are not suitable substitutes for this evidence. Do not include unrelated optional GPL codecs absent from the distributed Windows web build.

### Follow-up on eSpeak source history

The [worker's complete history through phonemizer 1.2.1](https://github.com/xenova/phonemizer.js/commits/6835144b7ee9043129222549c1ed2f6a27216278/src/espeakng.worker.js) was checked. Initial commit [`23d1602652c482972834f2cad12095372ce883c3`](https://github.com/xenova/phonemizer.js/commit/23d1602652c482972834f2cad12095372ce883c3) imports compiled worker/data files. Later changes embed the data, convert to ESM and remove worker messaging; [`609bebed3b0c329d53cea10d56b14afa7a2e184c`](https://github.com/xenova/phonemizer.js/commit/609bebed3b0c329d53cea10d56b14afa7a2e184c) demonstrates the last change. None of the inspected commit messages or build scripts identifies the C/data revision or original Emscripten build recipe. This narrows the missing provenance but does not resolve it. The unsent questions in `docs/DEPENDENCY-SOURCE-REQUESTS.md` describe the evidence needed from upstream.

Legal review must address the applicable LGPL licence election, corresponding native source, modification notices, replacement/relinking rights and any installation information required by the distribution arrangement. Dynamic DLL placement alone is not a compliance conclusion. Preserve the codec-specific terms as well.

## Local binary fingerprints

These fingerprints identify the inspected workspace files, not the future release installer. Regenerate and compare them when packaging.

| File | SHA-256 |
| --- | --- |
| `kokoro-js/dist/kokoro.js` | `31b1db2aa4a7411f55786900f0cbdd0351f1063859b107f9a99699a03b098b7d` |
| `phonemizer/dist/phonemizer.js` | `193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec` |
| `@img/sharp-win32-x64/lib/libvips-42.dll` | `06dab07cc386748513337a31672b1d5269fbc770a14ff403080575665bf0813f` |
| `@img/sharp-win32-x64/lib/libvips-cpp-8.18.7.dll` | `25001dbd05305a0a29119ab49933622c70b4a20ea12ef1d5d20ca40181db53bf` |
| `@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.5.node` | `971048779f9c8598df14641dfc03c625885c93f473a788e65ca2deb50d0b083e` |

Paths in this table are relative to `node_modules/`.

## Release hold conditions

Keep the Kokoro/native-library licence review open until the exact eSpeak source/build mapping, required corresponding-source delivery, combined-work decision, and native-source/replacement conditions are recorded and reviewed. A generated notice directory is useful evidence, but it does not clear those questions. Do not mark the application legally compliant merely because a licence manifest or source-link file exists.

Before publication, inspect the newly built installer, verify the component identities and required notices/source directions actually ship, and retain the installer hashes and the review decision. The earlier local `dist/win-unpacked/resources/app.asar` embedded version 0.8.0 and omitted native-package README files; it is stale evidence, not proof of current packaging or published v0.8.2 contents.
