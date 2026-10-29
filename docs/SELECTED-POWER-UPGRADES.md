# Selected power upgrades

This development branch implements the 17 selected backlog items. Open the named tools from Tasks or Diagnostics, or search for their names in the command palette. Changes are local until a release is published.

| Backlog | Feature | Where and behaviour |
| --- | --- | --- |
| 1 | Selective changes | Preview an existing text file's diff sections, choose which to keep, then apply the reviewed result. A recovery checkpoint is captured first. Stale previews are refused. |
| 2 | Structured test results | Test results displays TAP, pytest verbose and JUnit results with status filtering and source links. Other output remains in the task report. |
| 3 | Environment preflight | Check fixed tool/version commands. Environment profiles can opt in to checking requirements before model work. Supported tools are Node, npm, Python, Git, Go and Cargo. |
| 4 | Local-record backups | Diagnostics → Backups and recovery exports managed application records plus logical browser/Colab history. Restore checks hashes and retains the current records in a recovery folder. |
| 5 | Storage manager | Inspect category totals and select exact eligible old evidence/checkpoint files for deletion. Active, named and undo checkpoints, attachments, worktrees and recovery backups are preserved. |
| 6 | Interactive PTY terminals | The side dock supports xterm emulation, ANSI colours, interactive input and terminal resizing, with up to six sessions. The text shell remains available. |
| 10 | Services | Save project service commands, start, stop or restart them, inspect bounded logs and explicitly check a loopback readiness URL. Saved services never autostart. |
| 16 | Git panel | Inspect branch, status, recent commits and working/staged diffs; stage, unstage and commit after native confirmation. |
| 23 | Sensitive context review | Provider prompts are scanned for recognised credential/private-key/email patterns. New findings require review before sending. A manual local inspection tool is also available. |
| 26 | Explained context selection | Project search ranks excerpts within a character budget, adds related cached import/test hints, and explains selection and omissions. |
| 28 | Multi-root workspaces | Save up to eight named, non-overlapping project roots and search across them. Explicitly open a root for execution. |
| 30 | Task dependency graph | View task connections and edit prerequisites for queued ordinary tasks. Earlier tasks in the same project are eligible; cycles are refused. |
| 47 | Editor improvements | File tabs now include line numbers, indentation/outdent, automatic newline indentation, go-to-line, JSON formatting and basic syntax/bracket checks. Existing stale-write protection remains. |
| 52 | Document context | Attach PDF/DOCX files, preview extracted text, and select up to 30 PDF pages. Attach reviewed page text separately when only that selection should be sent. |
| 54 | API requests | Save local HTTP request definitions and send them after native approval. Inspect bounded response status, headers, body and duration. Headers are one-time and are not saved. |
| 61 | Integration manifests | Inspect transport, target and declared filesystem/network/execution access. Edit local declarations without granting tool permissions. |
| 75 | Update recovery | Packaged updates first offer to retain the current application and a local-record backup. Recovery stages the saved data and launches the preserved application copy. |

## Boundaries and controls

An interactive PTY session runs with your Windows account permissions. Its initial native confirmation authorises raw keystrokes for the session; there is no per-command approval inside that session. Stop or close it to end that access. Sessions expire after one hour, and the backend retains the latest 64 KiB of output. Commands marked as running block overlapping AI edits; terminal prompt detection is intended for the default Windows PowerShell shell.

Backups are compressed, **not encrypted**. They can contain chats, memories, paths, settings, attachments, integration/API definitions and task output. Keep exported backups private. A backup includes managed root JSON/encrypted records and attachments, changes, task evidence and Colab reports, plus logical ATLAS browser records. It excludes external project files/worktrees, provider-owned histories, downloaded runtimes, logs and browser cache/cookies. Backups are bounded to 256 MiB of managed file data, 20,000 files and 32 MiB per file. Restore requires a restart. This is an application-record backup, not a complete computer backup.

Recovery keeps the newer installation available and launches a preserved local copy of the earlier version. It does not overwrite the installed executable. Making that copy may require substantial disk space. The workflow has fixture coverage; an actual installed-version upgrade/rollback must still be tested before release. Recovery copies remain local until manually removed.

PDF/DOCX extraction is text-only, up to 8 MiB per document and 100,000 extracted characters. Image-only PDFs need OCR, which is not included. DOCX layout, images and tracked-change presentation are not reproduced. Selecting pages creates a new unsent text attachment; remove the original document from the draft to send only the selected text.

Sensitive-data detection is heuristic and can miss private information or flag harmless text. Integration declarations describe intended access; they do not enforce an operating-system sandbox. Services and terminal commands may access files and networks according to their own code and your account permissions. HTTP requests contact the chosen endpoint directly, block redirects, time out after 30 seconds and cap response bodies at 1 MiB. Saved URLs and bodies can contain secrets even though headers are not retained.

Editor checks are basic lexical/JSON checks, not a language server or a substitute for compiler/test results. Selective changes support existing UTF-8 text files within the diff limit, not binary/new/deleted-file merging. The dependency graph renders the first 40 tasks; the task list below it remains editable. All these features operate without publisher analytics or an ATLAS reporting server.

## Validation

`npm test` covers backend behaviour and safety boundaries. `npm run test:files-ui` exercises the panels at 1280, 768 and 640 pixels and checks xterm rendering. `npm run test:pty-ui` runs a real local PowerShell PTY under Electron without provider accounts. `npm run test:restore-ui` verifies browser/IndexedDB restoration before application loading. Packaged update recovery still needs an installed-build acceptance test before release.
