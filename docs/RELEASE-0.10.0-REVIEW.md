# ATLAS 0.10.0 technical release review

Prepared 30 October 2026 for the requested public Windows release. This records technical checks, not a legal opinion or a guarantee of safe model output.

## Scope and dependencies

0.10.0 includes the editing/workflow, deeper-workflow and selected-power-upgrade guides linked from the README. Experimental statistics and Insights code was removed before publication. No publisher server, analytics or crash-upload feature is included.

The owner explicitly approved adding `node-pty` 1.1.0, `@xterm/xterm` 6.0.0, `@xterm/addon-fit` 0.11.0 and `pdfjs-dist` 6.4.299, including possible native builds. Their installed package notices declare MIT (terminal packages) and Apache-2.0 (PDF.js). Production transitive components are inventoried from the exact lockfile. The node-pty winpty MIT notice is included separately; native ConPTY copyright terms are included in node-pty's root licence. No removed Kokoro/eSpeak/ONNX/sharp chain is reintroduced. Existing Whisper resource hashes and Electron/Chromium notices remain required. The production audit reported zero vulnerabilities during this preparation.

PDF.js includes additional CMap, ICC, font and WASM notices; these are collected into the packaged notices. The GPL-with-exception Liberation fallback fonts and optional `@napi-rs` canvas renderer are excluded from the application artifact. Installed npm inventory can therefore list optional packages that are not shipped. Packaged PDF text extraction passes without those assets. Text-only extraction can omit content in PDFs without usable text mappings; it is not OCR or a document renderer.

Packaging uses the pinned upstream Windows N-API prebuilds for node-pty and excludes local `build/` output. Automatic native recompilation is disabled; a local rebuild attempt lacked Visual Studio Spectre libraries. The packaged prebuilds pass a real Electron PowerShell spawn/input/resize/stop test. No compiler prerequisites were installed or mitigation flags changed.

## Permissions and data

Interactive PTY sessions authorise raw input for the session after native confirmation. Text-shell submissions retain individual approval. Both run with the user's account permissions. Service starts and HTTP sends require confirmation. Saved HTTP headers are excluded; saved URLs and bodies can contain private data. Integration declarations are informational and do not create an OS sandbox. Sensitive-context scanning is heuristic.

Local-record backups include managed files and logical ATLAS browser/Colab history, are compressed rather than encrypted, and exclude project worktrees, provider histories, downloaded runtimes and browser cookies/cache. Restore verifies content and preserves current managed records. Recovery launches a preserved application copy and stages its saved data; it does not replace the newer installation. Privacy documentation describes these boundaries.

## Validation record

Local validation passed 499 unit tests and the Assistant, Colab, graph, approvals, disputes, Settings, power, navigation, files, preview, release, PTY, PTY-rendering, restore and packaged-PDF Electron suites. Formatting and production audit passed. The Windows x64 installer, updater hashes, package version, private-path exclusions, notices, speech hashes, native PTY files, binary fuses and ASAR hash were verified locally. CI repeats the required checks for the proposed release.

CI exposed Windows short-path aliases in temporary folders. Preview recipes now canonicalize their project root before checking executable containment; a junction-based regression test reproduces the original failure and passes with the fix. The persistent-shell test compares its returned directory to the canonical path, preserving the same behavioural assertion.

An isolated smoke test preserved the actual packaged 0.10.0 application, changed fixture records to simulate a later version, then relaunched the preserved copy and verified that old records were restored before application load and newer records retained in recovery storage. Provider executable overrides pointed to Windows `where.exe`, with no real provider accounts. The hidden fixture was terminated after assertions because it had no visible main-window handle; this is not evidence about graceful shutdown. The test did not install NSIS into the user's real profile, and it cannot cover every update/Windows-policy configuration.

The owner-authorized unsigned policy remains in effect following SignPath denial. The final release still requires passing CI, verified installer/updater assets and the owner's post-CI confirmation. Hashes provide integrity checks, not authenticated publisher signing. Historical legal/source questions remain in the dated research documents.
