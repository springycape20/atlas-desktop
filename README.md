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
- Colab runs a task through Codex, Claude review, and a Codex final check, with selectable models and shared effort.
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
