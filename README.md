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

3. Install Codex and/or Claude Code using their official installers and sign into your own account. ATLAS normally finds the Codex desktop app's bundled CLI and the npm Claude Code executable. If your installation differs, set `CODEX_EXECUTABLE` and `CLAUDE_CODE_EXECUTABLE` to the full executable paths before launching.
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
- Colab offers **Build and review**, **Plan**, **Debug**, and **Compare approaches**. Plan and Compare use read-only provider settings. Compare asks for independent initial perspectives before synthesis. Passes are unlimited by default: after at least three passes, Colab finishes when both providers report readiness on consecutive reviews. Enter a positive number in the optional pass limit to cap the run; clear it for unlimited. Runtime limits and Stop still apply. Existing saved chats migrate to this unlimited default; optional limits can be set again.
- Editing tasks default to an **isolated Git worktree**. This requires Git, a clean committed checkout, and any project dependencies needed in the new checkout. **Review changes** shows changed files and a diff. Accept creates a commit in the original project only if its checkout is still clean and at the original commit. Changed review content requires refreshing the diff. Discard leaves a local recovery snapshot and checkout. The draft PR button pushes a branch; without an authenticated GitHub CLI it opens a comparison page to finish creating the PR.
- Worktrees isolate file changes; they are not an operating-system security boundary. Provider permissions still apply. Disable isolation explicitly when editing a folder without Git; those changes are made directly.
- Completed Colab passes are saved. After interruption or restart, **Resume saved stages** continues with the next unfinished pass and the same isolated checkout. Partial changes from an interrupted pass remain for the next pass to inspect. Tasks have no runtime cap. The optional provider request timeout in Settings applies to individual requests.
- **Diagnostics** checks CLI discovery, versions, sign-in status, Git, and optional GitHub CLI availability. It does not send a paid model request or prove remaining account quota.
- **History** searches full locally available Assistant, Colab, Codex, and Claude transcripts, with rename, pin, Markdown export, and continuation for Assistant/Colab. Provider transcript names and pins are stored as local ATLAS metadata. Colab retains up to ten chats and the latest 24 messages per chat; export important conversations for longer retention.
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

The main Assistant composer has an Effort selector. It remembers Low, Medium, High, Extra high, or Max for future messages. Project / provider default uses the active project’s effort or the provider’s default. A specific selection overrides the project for that message and is retained when resuming a paused task. Colab keeps its separate shared effort setting.
