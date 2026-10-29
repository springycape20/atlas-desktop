# Deeper project workflows

These features are in local development on `codex/deeper-workflows`, not in a published release. They use existing local project/task storage and do not add publisher statistics or automatic uploads.

## Project intelligence

Open **Tasks → Project intelligence** and enter a project-relative file, a symbol name, or both. Results show definitions, lexical references, resolved local imports, reverse import relationships and likely related tests. Click a result to preview its source. When project excerpts are enabled in a chat’s context, search results now also include relationship hints for the highest-ranked file.

This is static analysis built on the existing bounded local index, not a full language server or type checker. JavaScript/TypeScript local imports and common Python module paths are recognised. References ignore common strings and comments. Aliases, dynamic module resolution, template interpolation and runtime-generated calls can be missed. Test associations use imports and filenames. Treat these as navigation hints, then inspect the code and run checks.

The index retains its limits of 1,500 candidate files, 128,000 bytes per file, 12 MB read per refresh and a 32 MiB in-memory cache. Private/excluded paths remain excluded; the intelligence view also applies denied project-relative paths. Reverse impact traversal is capped at four import steps and approximately 100 affected files; definitions/references/test lists are capped. These views do not run code or query a provider.

## Project terminal

Open **Tasks → Terminal**, enter a command and a time limit (10–3,600 seconds), then choose **Run command**. A native approval names the folder, command and limit before execution. Commands run with your operating-system account permissions, so they may write files, access accounts or use the network. A project working directory is not an operating-system sandbox.

Live text output, PID, state and exit code appear in the view. The output buffer retains the latest 64 KiB. **Send input** writes a line to the existing process’s standard input and has its own approval. **Stop process** aborts the owned command/process tree through the same command runner used for checks. Closing the terminal view does not stop a command; quitting ATLAS aborts it.

This is a pipe-based command terminal, not a PTY terminal emulator. Full-screen programs, cursor-based interfaces and some password/PowerShell prompts may require an external terminal. Input and output are literal text, never rendered HTML. Up to 20 command sessions remain in memory until exit. ATLAS tasks and repair loops are blocked from overlapping with a managed terminal command; external processes are outside this coordination.

## Bounded repair loops

Open **Tasks → Repair loops** and choose a retained finished task with failing executed checks. Select up to eight recorded check commands, 1–3 repair attempts and a total limit of 30–1,800 seconds. A native approval lists the exact commands and limits and explains that provider usage may be incurred. The commands must come from that task’s recorded checks; arbitrary new command strings are rejected.

ATLAS saves a pre-loop file checkpoint, runs the checks, asks the configured Assistant provider for a narrow repair when they fail, and reruns the selected checks. A loop stops on passing checks, attempt exhaustion, an abnormal check result, provider failure, cancellation or timeout. Each repair is an ordinary saved Assistant task with the selected check commands bound as its completion verification; the loop reuses that executed result rather than running unrelated profile checks. Existing provider tool permissions still apply. Total runtime includes provider work and checks; each individual check is also capped at two minutes. Approval waits in provider calls can consume the loop’s remaining time.

Only checks with successful exit statuses establish that the loop passed; model text does not establish success. Provider output and command logs are labelled untrusted reference material. **Stop this loop** aborts the current check or provider task. Completed attempts retain their normal task history/evidence; the loop’s live progress list itself is session-local. Nothing automatically restarts after a crash. Changes are preserved for review, not automatically applied, discarded or rolled back. If the original task used an active isolated workspace, repair happens in that same workspace.

## Completion-time evidence archives

New tasks capture their final bounded diff, executed checks, status, elapsed time and provider-reported usage into local `task-evidence` storage during finalisation. Archives are written once per task identifier. Later project edits, rechecking a task or removing a worktree do not rewrite the archive. Missing archives are not backfilled from a later filesystem state.

**Tasks → Saved task evidence** lists the archives, opens their full contents and can delete them explicitly. Task comparison prefers these archives, even after the active task list has pruned a job. Older tasks without an archive use a clearly labelled live comparison. Archive failures remain visible on the saved job as `evidenceError`; they do not make an otherwise completed task fail.

Archives inherit checkpoint scan limits and exclusions. Individual patches over 256 KiB or patches beyond a total 4 MiB budget are omitted and the diff marked limited. Binary/large files may lack patches. SHA-256 detects accidental changes to a saved record; it is not a digital signature or proof against someone who can rewrite the record and hash. Archives may contain source, task titles and check output. They stay local, have no automatic expiry, and should be reviewed before sharing or deleted when no longer needed. Basic local metadata is stored separately for listing without reading every patch. No archive is sent to the publisher.

## Verified recovery

New code tasks record a file checkpoint at task start; Colab refreshes it after each completed stage. **Tasks → Recovery → Verify saved checkpoint** compares tracked file contents/modes with the recorded stage and describes what remains. New tasks with a checkpoint cannot resume if the snapshot is incomplete or current files differ. This check also runs immediately before the existing Resume action.

If a normally stopped task has later partial changes, **Preview restore to last saved stage** lists the paths before restoring them. Restore refuses edits made after the stopped-state snapshot or preview and creates a recovery backup. Denied paths are checked again before reading/restoring checkpoint files. Managed worktrees inside ATLAS’s data folder are now correctly included in project snapshots; unrelated app data remains excluded.

A hard crash can leave an unsealed partial stage. ATLAS will not silently bless that state for restoration or replay. Review it and recover with Git or a new task when an exact safe restore cannot be established. Older tasks without the new checkpoint are labelled unverified and keep their previous resume behaviour. Verification covers the tracked, bounded file state, not external services, installed packages or provider memory. Completed stages are reused by existing Colab recovery; an interrupted stage or Assistant request may need to run again. Nothing resumes automatically.
