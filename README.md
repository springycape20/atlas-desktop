# ATLAS desktop assistant

A local Windows desktop interface for Codex and Claude Code, with local speech, conversation memory, reminders, task controls, and provider routing.

## Install on Windows

Currently supported: **Windows x64**. Download **ATLAS-Setup** from the [GitHub Releases](https://github.com/springycape20/atlas-desktop/releases) page and run it. The installer installs ATLAS for your Windows account under `%LOCALAPPDATA%\Programs\ATLAS`, then creates Desktop and Start Menu shortcuts. In Settings, enable **Launch ATLAS when I sign in** to start it automatically after you sign in. Uninstalling keeps your settings and conversations in `%LOCALAPPDATA%\ATLAS`.

If Windows shows SmartScreen, choose **More info**, then **Run anyway**. If Windows marks the downloaded installer as blocked, right-click it, select **Properties**, select **Unblock** on the General tab, and choose **Apply**. Only run installers downloaded from the project's GitHub Releases page.

The installer includes the pinned whisper.cpp Windows CPU runtime and approximately 268 MB of English speech recognition models. Kokoro downloads its voice model on first use, so allow extra time for the first launch. An internet connection is needed for provider requests. Windows speech is available as a fallback.

## Run from source

The source setup below is for contributors or users who want to run ATLAS from a checkout.

Currently supported: **Windows x64**. This repository is source code, not a hosted website or a mobile app.

1. Install Node.js LTS and Git.
2. Sign into GitHub with an account that can access this private repository, then clone it:

   ```powershell
   git clone https://github.com/springycape20/atlas-desktop.git
   cd atlas-desktop
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-ATLAS.ps1
   ```

   Alternatively, download and extract the repository ZIP, then run the setup script from that folder.

3. Install Codex and/or Claude Code using their official installers and sign into your own account. ATLAS normally finds the Codex desktop app's bundled CLI and native, WinGet, or npm Claude Code installations (including npm's `claude.cmd` entry point). Claude Code must be signed in separately if its terminal account is not connected; a Claude Desktop login alone may not sign in the CLI. If your installation differs, set `CODEX_EXECUTABLE` or `CLAUDE_CODE_EXECUTABLE` to the full path before launching. Claude overrides can point to `claude.exe`, npm's `claude.cmd`, or its `cli.js`. ATLAS refreshes saved Windows PATH entries for Claude without requiring a full PC restart. If Connect fails, open Settings → Test connections and dependencies and copy the Claude Code error. In CMD, `where claude` and `claude --version` help identify the installation. Do not share API keys or credential files.
4. Setup creates **ATLAS.lnk** for the folder where you installed ATLAS. Double-click it or **Start-ATLAS.cmd**, choose a working folder, then configure your microphone and voice in Settings. Run setup again after moving the folder so the shortcut is refreshed.

   If Windows blocks a downloaded **ATLAS.lnk**, right-click it, choose **Properties**, select **Unblock** on the **General** tab, then click **Apply**. If SmartScreen appears when you launch it, choose **More info** and **Run anyway**. Only unblock and run files from a source you trust. You can always launch **Start-ATLAS.cmd** from the project folder instead.

Setup downloads Electron, the pinned whisper.cpp v1.8.7 Windows CPU runtime, and approximately 268 MB of English speech recognition models. Kokoro downloads its voice model on first use; allow extra time for that first launch. An internet connection is needed for installation and provider requests. Windows speech is available as a fallback.

## Features

- Persistent Codex app-server connection, streamed replies, and ongoing conversations.
- Claude Code routing, with fallback when a recognized usage limit is reported.
- Assistant and Colab have separate chat workspaces in the same app. Colab saves its own conversations and drafts, with a working folder, provider models, and shared effort for each chat. Follow-ups include recent messages from that Colab conversation.
- Colab runs a task through Codex, Claude review, and a Codex final check, then displays one final summary. Switch chats while a task runs; its result returns to the chat that started it.
- Provider cooldowns persist locally. Settings shows availability, estimated retry times, and **Retry now**. Availability means ATLAS has no active cooldown; it is not a live quota or sign-in check.
- Brief spoken replies by default; full written answers remain on screen. Say **tell me more** or click **Read full answer** for more speech.
- Local Kokoro British voices, Whisper recognition, wake-word and follow-up listening controls.
- Task pause/cancel/resume, saved conversations, local transcript lookup, memories, and reminders.

## Device data and permissions

GitHub shares the application source. It **does not sync conversations, settings, reminders, local files, or provider logins** between devices. ATLAS data stays in `%LOCALAPPDATA%\ATLAS` on each Windows computer. Existing data from `%APPDATA%\atlas-local-desktop` is moved there on first launch. Provider histories are read from the local provider folders only; signing in does not provide access to all private web chats.

Credentials, downloaded models, dependencies, personal shortcuts, and runtime data are excluded from Git. Setup creates an **ATLAS.lnk** shortcut for each checkout. ElevenLabs is optional and needs your own key; no shared key is included.

Check Settings before use: wake-word listening and automatic follow-up listening are enabled by the current defaults. They can be turned off. Permission bypass is disabled by default; enabling it gives the provider broader computer access. With bypass off, Codex uses the selected sandbox and does not automatically grant approval requests. Interactive requests that ATLAS cannot handle must be completed through the provider app.

Reminders require ATLAS to be running. Cancelling a task does not undo changes it already made. Task routing is based on local rules rather than a guarantee that one provider is best.

## Updating

Install a newer **ATLAS-Setup** from [GitHub Releases](https://github.com/springycape20/atlas-desktop/releases) over the existing installation. Your settings and conversations are preserved. For source checkouts, close ATLAS, run `git pull`, rerun `Setup-ATLAS.ps1` if dependencies have changed, then launch `Start-ATLAS.cmd`.

## Third-party components

Electron, Kokoro, whisper.cpp, their models, and provider CLIs retain their own licenses and terms. The speech runtime is downloaded from the official whisper.cpp GitHub release and its archive checksum is checked. Models are downloaded from their publishers; they are not redistributed in this repository.

This app is independent of OpenAI and Anthropic. Other operating systems and mobile devices have not been adapted or tested.

## Performance and validation

- Whisper starts on the first transcription and retains one model for subsequent requests. Switching Fast/Enhanced replaces that process. The server binds only to loopback on a temporary port with a random request path, and closes when ATLAS exits. Re-run setup if `whisper-server.exe` is missing from an older installation.
- Provider transcript scanning, decompression, parsing, and search run in a worker. Parsed transcripts use a bounded cache refreshed when file size or timestamps change.
- Interrupting speech discards queued Kokoro work and ignores the cancelled result. A synthesis already executing may finish internally; the loaded model and short-reply cache stay available.
- Streamed text is painted once per animation frame. Final answers cancel pending stream paints, and workspace indicators update when state changes instead of polling.
- Task notifications batch changed jobs. The app retains the latest 40 finished jobs plus all running/paused jobs. State saves use queued atomic writes, and shutdown waits for pending saves.
- ATLAS conversation history is cached for the current process. Restart ATLAS after externally editing its conversation file.

Run `npm test` for regression checks covering queued saves, state persistence, history cache invalidation, speech cancellation, job retention/updates, and concurrent history saves. Use the Response timing panel to compare representative voice requests; the first request includes model loading, and results vary by hardware and recognition mode.

## Project workflows

- **Projects** saves a working folder, instructions, preferred models, shared effort and useful commands. Activate a profile in Assistant or Colab. Command buttons copy commands; they do not execute them.
- **Attach files** imports up to eight text/code files or images per message (8 MB each; text limited to 150,000 characters). Drag files onto a composer or use **Paste screenshot**. Click a chip to preview the saved snapshot; remove it to stop including it in later messages. Selected text is sent as context. Images are supplied as local paths for the provider's image/file tools, so image support depends on the selected provider. Attachments remain local until a provider task uses them.
- Colab offers **Build and review**, **Plan**, **Debug**, and **Compare approaches**. Plan and Compare use read-only provider settings. Passes have no default cap, but an approving final review now ends the task immediately: a successful build and review take two passes. Only specific blocking issues in the original task can trigger fixes; optional polish stays in notes. Enter a positive number in the optional pass limit to cap provider calls, including verdict clarifications; clear it for unlimited. Stop remains available.
- Editing tasks default to an **isolated Git worktree**. This requires Git, a clean committed checkout, and any project dependencies needed in the new checkout. **Review changes** shows changed files and a diff. Accept creates a commit in the original project only if its checkout is still clean and at the original commit. Changed review content requires refreshing the diff. Discard leaves a local recovery snapshot and checkout. The draft PR button pushes a branch; without an authenticated GitHub CLI it opens a comparison page to finish creating the PR.
- Worktrees isolate file changes; they are not an operating-system security boundary. Provider permissions still apply. Disable isolation explicitly when editing a folder without Git; those changes are made directly.
- Completed Colab stages save their roles, fixed task criteria, open blockers, next stage, and available workspace fingerprints. **Resume saved stages** continues the interrupted workflow in the same checkout. Changed task scope or roles cannot reuse an old verdict. Changed files after a saved implementation force a new review before acceptance; paused proposal and analysis stages keep their own next stage. Older checkpoints receive a read-only assessment of the existing work. Tasks have no runtime cap. The optional provider request timeout in Settings applies to individual requests.
- **Diagnostics** checks CLI discovery, versions, sign-in status, Git, and optional GitHub CLI availability. It does not send a paid model request or prove remaining account quota.
- **History** searches locally available Assistant, Colab, Codex, and Claude transcripts, with rename, pin, Markdown export, and continuation for Assistant/Colab. Provider transcript names and pins are stored as local ATLAS metadata. Colab's sidebar can filter chats by project folder, and each conversation has a scrollable timeline, timestamps, message search, copy controls, and a Latest button. Select Compare on two results and use Compare results to view them side by side. Your reading position stays in place during live updates and when switching chats. Choosing a different project keeps the previous conversation and reopens or creates a chat for that project.
- **Colab storage** keeps complete saved message text in the app's local IndexedDB storage rather than automatically pruning to ten chats or 24 messages. The existing localStorage history migrates automatically and remains as a backup; messages already deleted by older retention limits cannot be recreated. If storage fails or fills up, ATLAS displays an error instead of deleting older chats. Export important chats for backups. Only recent messages are sent as model context; longer display history does not automatically increase every request's context. Activity details still retain recent reported steps.
- **Import chats** is available in History and Settings → Provider accounts. Scan up to 100 recent chats per local Codex / Claude Code client, preview and select chats, then import them together or choose **Import and continue**. Codex archived sessions are included. You can also choose a Claude `conversations.json` data export or a Codex / Claude Code `.jsonl` / `.jsonl.zst` transcript from disk. Exports must be under 32 MB (up to 1,000 Claude chats). Desktop/web conversations require the exported file; signing in does not fetch private cloud history. Imports copy up to 80 recent text messages, 12,000 characters each; truncated chats are labeled. Images, tool output, private reasoning and subagent transcripts are excluded. Follow-ups start a fresh provider session using recent imported context, leaving the original client conversation intact. Reimporting a chat reuses its existing ATLAS copy; it does not overwrite later ATLAS replies. ATLAS stores up to 100 Assistant chats and refuses imports that would exceed that limit. Missing project folders fall back to your home folder; choose the intended folder before sending a coding follow-up.
- Assistant and Colab have no task runtime limit; Colab has an optional provider-pass limit. Colab displays token counts and costs only when a provider reports them. Partial usage and provider-reported cost are not an account bill or a spending cap.

Profiles, attachment snapshots, review worktrees, and history metadata are stored in the app's local data directory. Discarded worktrees are retained for recovery and can consume disk space. Existing downloaded installers do not gain these features until a new release is built from this branch.

## Setup, model discovery, and app updates (0.6.0)

Diagnostics includes official download links for missing Codex, Claude Code, Git, and GitHub CLI installations. After installing a missing tool, restart ATLAS and run diagnostics again.

Before an isolated Colab task starts, a folder without Git history prompts to create a local repository and initial commit. New repositories include existing project files and append common dependency and credential exclusions to `.gitignore`. This does not upload files. Review private files before accepting. Existing repositories keep their current ignore rules and staged files; commit or stash changes before using an isolated worktree.

Settings now offers discovered models in its dropdowns. ATLAS refreshes both provider catalogues at launch; **Refresh available models** repeats the scan. Codex uses its app-server catalogue and Claude uses CLI initialization without submitting a chat prompt. Cached catalogues remain available offline, with a status explaining a failed refresh. Provider defaults and optional custom IDs are preserved. Updating a provider CLI can expose models that an older CLI does not report.

The Windows installer includes an updater. On launch it checks published GitHub Releases; **Settings → App updates** shows availability, download progress, and **Restart and install**. Updates never restart automatically, and installation is blocked while tasks run. Versions before 0.6.0 require installing the new installer once to gain this feature. Source checkouts check release availability but do not replace their source files automatically.

For maintainers: every updater-enabled release must publish the installer, its `.blockmap`, and `latest.yml` together. The release workflow and package verifier check these files. A local build or pull request does not become an update until that version is published as a GitHub Release. See the [electron-builder v26 update documentation](https://raw.githubusercontent.com/electron-userland/electron-builder/v26.0.12/pages/auto-update.md).

Colab uses a compact composer that grows as you type and shrinks when text is removed. The + menu offers file attachment, clipboard screenshots, and project profiles; Ctrl+V also attaches copied pictures directly in either chat composer, while ordinary text pastes normally. File drop and attachment previews remain available. Photos show compact thumbnails in the draft and beside the sent question. Attachments are cleared from the draft after sending and saved with that message, so later questions do not automatically resend them. While a task runs, an expandable activity panel shows recent provider-reported commands, exit statuses, file changes, plans, and brief progress summaries. It collapses when the task completes or stops and can be reopened later. Private reasoning and raw tool output are not displayed in this panel.


Assistant and Colab display live provider progress summaries, plans, and expandable command steps in the conversation. Work logs collapse when a task finishes and can be reopened. Windows shows taskbar activity while tasks run, alerts on completion or failure, and flashes the ATLAS taskbar icon when the app is in the background. Click a notification to open the relevant chat. Private reasoning and raw tool output are excluded from the work log.

The main Assistant composer has an Effort button that opens a five-step slider with a live label and a reset-to-default button. It remembers Low, Medium, High, Extra high, or Max for future messages. Project / provider default uses the active project’s effort or the provider’s default. A specific selection overrides the project for that message and is retained when resuming a paused task. Colab keeps its separate shared effort setting.

Bottom-left usage circles show Claude in orange and Codex in green. Hover for remaining allowance; click for session/weekly limits, reset times, and plan details. Each circle reflects the lowest remaining main session/weekly allowance and empties at 0%. Readings refresh at launch, while the app is active, after tasks, and on demand; Codex also supplies live limit updates. Missing limits appear unavailable, and failed refreshes mark previous readings as stale. API-only accounts may not expose subscription limits.

**Open app** opens the provider’s official usage page in your default browser. Codex uses its [App Server account rate limits](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt). Claude reads the usage endpoint with your existing Claude Code sign-in, only in the main process; credentials are never sent to the renderer or saved in usage data. No inference request is sent to check these limits.

New code tasks capture a local before-task snapshot. A bottom-of-screen bubble shows added/removed lines and changed-file counts for the current Assistant or Colab task. Click it to open a movable, resizable change editor with a file list, line-numbered diff, and Edit tab. Both views use syntax colors for keywords, strings, comments, numbers, and functions, with the language detected from the filename. Highlighting works offline for Python, JavaScript/TypeScript, HTML/CSS, JSON, shell scripts, and other common languages. Files over 120,000 characters or 4,000 lines, unsupported languages, and slow or complex highlighting fall back to plain text. Ctrl+S saves explicit edits after agents stop working in that folder; stale files must be reloaded before saving. Isolated Colab edits stay in the worktree until you review and apply them.

Snapshots preserve pre-existing edits and Git staging, and remain local for resumed tasks. Git ignores, common generated folders, credential directories, and common secret files are excluded. Snapshots are bounded to 1,500 files and 12 MB, with inline editing up to 512 KB per text file. Binary, large, linked, or complex changes may not have inline line counts; partial previews are labeled. The editor is available for tasks started after this feature is installed.

## Workbench

Open **Workbench** in the sidebar for the following workflows:

- **Queue** saves Assistant and Colab tasks against project profiles, runs them one at a time, and supports reordering, removal, retries, and an optional pause between tasks. Start the queue explicitly. Pausing stops the next task; stop the current task using Tasks. Failures and failed completion checks pause the queue. Restarting ATLAS always leaves the queue paused, with interrupted entries marked for review. Colab queue entries use isolated worktrees: review and accept each task's changes before a later task should build on them.
- **Plugins** detects provider-installed plugins without duplicating their installation. It also lists Codex skills, connector availability, and MCP authentication status when the provider exposes them. Claude plugins can be enabled or disabled through its CLI; changes affect the shared provider configuration. Supported Codex MCP connections offer a sign-in link. Start a new chat after changing plugins. Installed does not guarantee callable: desktop-only plugins, account restrictions, unsupported connection forms, and provider policies can still require the original app. Codex plugin installation and enablement remain managed in Codex.
- **Project setup** inspects a folder for Node.js, Python, Rust, Go, and CMake project files. It suggests dependency commands and checks, saves project instructions, and optionally creates an initial local Git snapshot after confirmation. Dependency commands are copied for review rather than installed automatically. Suggested Python checks assume pytest is available; edit the commands to suit the project. No files are uploaded.
- **Search** searches saved ATLAS messages and attachment names, locally available provider transcripts, Colab chats, and retained task commands/file activity. Results open task details or transcript previews. Search is limited by local history retention; it cannot retrieve private web conversations absent from this PC.
- **Checkpoints** previews the files a task changed and can restore their pre-task working contents. It preserves earlier edits, unrelated later files, Git commits, and the Git index. Later changes to a task file block restoration, and unsupported binary/large originals require Git recovery. A recovery snapshot is saved before restore; **Undo this restore** reverses it. Isolated tasks restore within their own checkout, and accepted/discarded worktrees cannot be edited here. These restore points apply to new tasks with completed snapshots, including stopped/failed runs. Snapshots are bounded and are not a replacement for full project backups.
- **Approvals** shows live Codex command/file/access requests, provider questions, Claude tool permission requests, and supported plugin connection confirmations. A bottom-right badge appears when a request needs attention. Answers apply only to that request; stopping the task dismisses pending requests. ATLAS uses Codex's on-request policy and Claude's streaming permission channel. Existing provider allow rules and ATLAS's explicit permission-bypass setting still determine which actions prompt. Unsupported structured MCP forms are declined; complete those connections in the provider app.

Colab's **Roles** menu offers **Codex builds · Claude reviews**, **Claude builds · Codex reviews**, or **Compare proposals, then build**. Reviewers use read-only settings and send only evidenced blockers back to the builder. Proposal mode starts with two independent read-only proposals, then a builder selects/implements an approach and a reviewer verifies it (four successful passes). Compare mode similarly uses two independent analyses, synthesis, and final review. The final summary includes the builder's deliverable and reviewer feedback, rather than replacing it with a critique.

Colab no longer waits for consecutive READY markers from both models or runs another builder pass after approval. Structured verdicts distinguish ready, required changes, and blocked work. A missing or malformed verdict gets one read-only clarification from the same provider; a second failure stops for attention. Fix/review cycles must reduce the best-so-far open blocker count: exchanging regressions or repeating unresolved work for two cycles pauses the task instead of looping. A known unchanged workspace followed by another failing review also pauses; analysis-only revisions use blocker progress rather than unchanged files. Complete tracked-workspace fingerprints guard against changes during read-only review; these checks are unavailable for partial snapshots. Optional improvements cannot silently expand the fix list, and later new issues need explicit regression evidence. Needs-attention and pass-limit outcomes remain incomplete, preserve the work and saved stages, pause a running queue, and send an attention notification. They never claim successful completion or run automatic completion checks. Resume explicitly after reviewing the reason, or send a follow-up to change the task.

Project profiles now include **Completion checks** and an opt-in **Run completion checks after tasks** setting. These commands execute in the actual task folder (including isolated worktrees), with output and real exit codes saved in task details. Checks have a two-minute timeout per command, can be stopped with the task, and report passed, failed, cancelled, timed out, or not checked. Configure dependencies inside isolated worktrees before relying on their checks. Read-only Colab Plan/Compare modes skip automatic commands. Check results appear in task activity and Workbench; a provider's claim that tests passed is kept separate from ATLAS's own recorded checks.
