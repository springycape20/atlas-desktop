# Dependency source requests — unsent drafts

Prepared 28 October 2026. These are proposed questions for the maintainer to review. Nothing has been posted, emailed or submitted to upstream. Source evidence and unresolved conditions are recorded in `docs/THIRD-PARTY-SOURCE-REVIEW.md`. Replies should be checked against the actual distributed binaries before closing the review.

## Draft for phonemizer / Kokoro maintainers

Subject: Source/build provenance for eSpeak NG embedded in phonemizer 1.2.1

We maintain ATLAS, a free, open-source local Windows application using `kokoro-js` 1.2.1 and `phonemizer` 1.2.1. We want to preserve the correct licences and make the corresponding source available for the actual engine we distribute.

Our locked phonemizer npm tarball has integrity:

```text
sha512-v0KJ4mi2T4Q7eJQ0W15Xd4G9k4kICSXE8bpDeJ8jisL4RyJhNWsweKTOi88QXFc4r4LZlz5jVL5lCHhkpdT71A==
```

The installed `dist/phonemizer.js` has SHA-256 `193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec`. Upstream release commit is `6835144b7ee9043129222549c1ed2f6a27216278`. The worker history starts with compiled JS/data in `23d1602652c482972834f2cad12095372ce883c3`; the wrapper build consumes that precompiled worker.

Could you provide or identify:

1. The exact eSpeak NG C/source-data commit and any patches used to generate that worker and dictionary/data payload?
2. The Emscripten version, bindings/glue source, build commands, compiler options, language selection and data-generation scripts used?
3. The preferred source and build materials for any modifications beyond stock eSpeak NG, including source of the embedded data files?
4. A durable, version-specific source archive and required notices corresponding to these distributed bytes, or a reproducible comparison demonstrating the mapping?
5. The exact Kokoro JS source commit corresponding to the `kokoro-js` 1.2.1 npm package and bundled voice files, and any additional notices that should accompany those files?

The package's Apache licence identifies the wrapper, while upstream eSpeak NG identifies GPL-3.0-or-later for the engine. We are not asking you to provide legal advice; we need factual provenance and build materials for our licence review. We will assess combined-work and source-delivery requirements separately.

## Draft for sharp / sharp-libvips maintainers

Subject: Source/build mapping for @img/sharp-win32-x64 0.35.5

We distribute a free local Windows application and want to document the native libraries accurately. Our installed `@img/sharp-win32-x64` 0.35.5 reports libvips 8.18.7 and the dependency versions listed in `versions.json`. These match sharp-libvips commit `1f01639b2cae66b5e0d59964a387c291c0b0e2cd` and build-win64-mxe tag `v8.18.7` (`ef19ca09af2453d127453d677c849ccb37cf5694`).

Our inspected native fingerprints are:

```text
libvips-42.dll
06dab07cc386748513337a31672b1d5269fbc770a14ff403080575665bf0813f
libvips-cpp-8.18.7.dll
25001dbd05305a0a29119ab49933622c70b4a20ea12ef1d5d20ca40181db53bf
sharp-win32-x64-0.35.5.node
971048779f9c8598df14641dfc03c625885c93f473a788e65ca2deb50d0b083e
```

The upstream Windows packaging script points to `vips-dev-x64-web-8.18.7-static.zip`; its published digest is `a736af61d3b46499760efa606e469cb14e060445b1f6fd36a1fa2e75009e1197`. We downloaded it without execution, verified that digest, and confirmed that its `vips-dev-8.18/bin/libvips-42.dll` matches our installed DLL byte for byte. The archive has no file named `libvips-cpp-8.18.7.dll`, so the C++ DLL and sharp binding still need separate mapping.

Could you confirm:

1. Whether this npm package's libvips DLL bytes come from that archive, and the exact sharp-libvips/build-win64-mxe build commits used?
2. The MXE, compiler, container image digest and build arguments used, plus any patches beyond those pinned in the source trees?
3. Where recipients can obtain the matching preferred source, patches and build/relinking materials for all native components incorporated into the DLLs, including the components elected under LGPLv3 and cairo's MPL terms?
4. Whether there is a version-specific source/notice bundle or recommended redistribution arrangement for these Windows web binaries?

We have preserved the native package's README licence table as well as its Apache licence. We will assess the applicable replacement/relinking and source-distribution obligations independently; a provenance confirmation is not being treated as legal approval.

## Local steps that do not require contacting upstream

- Completed: downloaded and digest-verified the upstream native archive, without execution; its libvips-42.dll matches the workspace. Extend the comparison to the final installer and establish provenance for the C++ DLL and sharp binding.
- Archive the matched source trees, dependency source tarballs, checksums, patches and build instructions, and review all mutable references.
- Build from a fully pinned source/toolchain pipeline if provenance for existing bytes cannot be established. This may replace the precompiled dependency while retaining Kokoro, but requires its own functionality checks and licence review.
- Obtain a decision on GPL combined-work scope and the appropriate source-delivery/relinking arrangement. Neither an upstream reply nor this document grants that decision.
