# ATLAS desktop assistant

A local Windows desktop interface for Codex and Claude Code, with local speech, conversation memory, reminders, task controls, and provider routing.

## Set up on another computer

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
4. Double-click **Start-ATLAS.cmd**, choose a working folder, then configure your microphone and voice in Settings.

Setup downloads Electron, the pinned whisper.cpp v1.8.7 Windows CPU runtime, and approximately 268 MB of English speech recognition models. Kokoro downloads its voice model on first use; allow extra time for that first launch. An internet connection is needed for installation and provider requests. Windows speech is available as a fallback.

## Features

- Persistent Codex app-server connection, streamed replies, and ongoing conversations.
- Claude Code routing, with fallback when a recognized usage limit is reported.
- Provider cooldowns persist locally. Settings shows availability, estimated retry times, and **Retry now**. Availability means ATLAS has no active cooldown; it is not a live quota or sign-in check.
- Brief spoken replies by default; full written answers remain on screen. Say **tell me more** or click **Read full answer** for more speech.
- Local Kokoro British voices, Whisper recognition, wake-word and follow-up listening controls.
- Task pause/cancel/resume, saved conversations, local transcript lookup, memories, and reminders.

## Device data and permissions

GitHub shares the application source. It **does not sync conversations, settings, reminders, local files, or provider logins** between devices. ATLAS data stays in `%APPDATA%\atlas-local-desktop` on each Windows computer. Provider histories are read from the local provider folders only; signing in does not provide access to all private web chats.

Credentials, downloaded models, dependencies, desktop shortcuts, and runtime data are excluded from Git. ElevenLabs is optional and needs your own key; no shared key is included.

Check Settings before use: wake-word listening and automatic follow-up listening are enabled by the current defaults. They can be turned off. Permission bypass is disabled by default; enabling it gives the provider broader computer access. With bypass off, Codex uses the selected sandbox and does not automatically grant approval requests. Interactive requests that ATLAS cannot handle must be completed through the provider app.

Reminders require ATLAS to be running. Cancelling a task does not undo changes it already made. Task routing is based on local rules rather than a guarantee that one provider is best.

## Updating

Close ATLAS, run `git pull`, then rerun `Setup-ATLAS.ps1` if dependencies have changed. Launch `Start-ATLAS.cmd` again. Local settings and history are kept outside the repository.

## Third-party components

Electron, Kokoro, whisper.cpp, their models, and provider CLIs retain their own licenses and terms. The speech runtime is downloaded from the official whisper.cpp GitHub release and its archive checksum is checked. Models are downloaded from their publishers; they are not redistributed in this repository.

This app is independent of OpenAI and Anthropic. Other operating systems and mobile devices have not been adapted or tested.
