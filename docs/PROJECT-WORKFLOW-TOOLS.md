# Project workflow tools

These changes are in development on `codex/project-workflow-tools`. They have not been published in a release. The unreleased statistics client, report exporter, receiver and Insights admin app have been removed. ATLAS does not send publisher statistics.

## Edit files beside chat

Open **Tasks → Project editor → Browse project files**, select a text file and choose **Open in editor**. The same action appears in previews opened from chat. Up to eight tabs remain open beside chat; on smaller windows the editor fills the available screen. Hiding it keeps unsaved edits in memory. The conversation list returns when the editor is hidden.

Use **Save** or Ctrl+S while the editor has focus. **Syntax preview** highlights the current draft without executing it. Reloading or closing a modified tab asks before discarding unsaved work. Closing ATLAS does not persist these drafts.

Only existing UTF-8 text files up to 256 KiB can be edited. Credential files, denied paths and paths outside the selected project are excluded. Saves check the file version immediately before replacement and refuse newer disk edits. Editing is blocked while ATLAS tasks are running. External editors can still race a write; use version control for durable recovery.

## Project-wide find and replace

Use **Tasks → Find and replace**. Enter literal, single-line find text, replacement text, optional case matching, and comma-separated excluded project-relative paths. Excluding `generated` also excludes its descendants. Previewing never writes files.

Review each file’s complete before/after text, then select its checkbox. **Apply selected replacements** writes only those selected files and checks all selected versions first. If an error occurs after some writes, the result names how many files were written and offers undo. Replacement output cannot exceed the editor file limit.

Search is bounded to 2,000 entries, 100 changed files, depth 12 and 4 MiB of text. Directory caps or excluded/unreadable files can omit matches. A limit notice means the operation is partial; narrow the scope and repeat. No regular expression or glob syntax is supported.

**Undo last edit** restores only the files touched by the last editor save or replacement batch. It refuses later disk edits. Recovery data stays in process memory, up to 20 operations for one hour, and disappears on restart. Open editor tabs must be reloaded after undo or replacement.

## Task prerequisites

In **Tasks → Queue**, select **Required tasks** when adding a task. Dependencies must already exist in the same saved project. For example, add a build task, add a test task requiring build, then add a review task requiring test. Configure executed completion checks in the saved project to make a failed check stop the chain; a model saying tests passed is not an executed check.

Required tasks must finish successfully. Isolated Colab changes must also be applied or discarded before dependent work starts. Failures pause the queue; explicitly review and retry the failed task before continuing. Reordering cannot put a prerequisite after its dependent, and dependent tasks must be removed before their prerequisites. Normal provider and command approvals still apply. These are ordinary agent tasks, not a new shell-script runner.

## Permissions and diagnostics

**Tasks → Permissions** and the link under **Settings → Permissions** show remembered screen-control and PowerShell grants by chat identifier. Revoke a single grant or all grants. Actions already completed cannot be undone; future calls are rechecked through the existing permission service.

**Settings → Diagnostics → Diagnostic bundle** prepares a local JSON export. By default it contains the ATLAS version, platform, creation time and failed check statuses/exit codes. Logs and check commands/output are optional and off by default. Chats, task prompts, attachments and account configuration are not added. Known home/project paths and recognised credential formats are redacted from optional text; arbitrary sensitive text may remain. Review the exact preview before exporting or sharing it. Nothing is uploaded automatically.

## More preview frameworks

**Tasks → Live preview** supports installed Vite, Next.js and Python Flask projects. Choose the recipe and loopback port; Flask uses the project’s `.venv` interpreter and a module such as `app` or `app:app`. No packages are installed. A native approval displays the executable and arguments before project code runs. The process runs with your account permissions, while the preview page remains in its separate sandbox.

Next.js receives explicit hostname/port arguments and has its built-in telemetry disabled for this managed process. Flask receives an explicit loopback host/port with debugger, reloader and dotenv loading disabled. Project code and plugins can make their own requests independently of the preview page. Start and open remain separate controls; a process having started does not prove the server is ready.

Recipes follow the official [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next) and [Flask CLI](https://flask.palletsprojects.com/en/stable/cli/) documentation. Other frameworks can still open a server started separately by its local HTTP URL.

## Compare task evidence

Use **Tasks → Task comparison** and choose two finished tasks retained in ATLAS. The columns show status, elapsed time, executed checks, provider-reported token counts when available and current diffs relative to each task’s starting checkpoint. Missing reports show as unavailable; no billing or subscription usage is inferred.

New tasks now preserve completion-time evidence; older tasks without archives retain a clearly labelled live filesystem comparison. See [Deeper project workflows](DEEPER-WORKFLOWS.md) for archive, terminal, repair-loop and verified recovery controls. Large/binary or inaccessible files may lack inline patches. Comparing tasks does not call a provider or run checks again.
