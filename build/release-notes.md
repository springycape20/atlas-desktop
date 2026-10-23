ATLAS 0.5.1 includes the current Colab chat workspace, provider connection improvements, and fixes for saved-data migration and model discovery.

- Separate Assistant and Colab workspaces in the same app.
- Saved Colab conversations, drafts, follow-up context, and per-chat model, effort, and folder choices.
- Codex and Claude work through the task and return one final summary to the originating chat.
- Fixed provider buttons opening no visible sign-in window and connection errors hidden behind Settings.
- Claude's **Install and sign in** button installs the missing Claude Code CLI using Anthropic's official installer.
- Fixed upgrades finding the original `%APPDATA%\atlas-local-desktop` data folder so saved settings, conversations, memories, reminders, and encrypted keys migrate to `%LOCALAPPDATA%\ATLAS`.
- Fixed Codex model discovery on a fresh launch by connecting to the app-server before requesting the model catalog.

Download **ATLAS-Setup-0.5.1.exe** below. Windows x64 only. The installer adds Desktop and Start Menu shortcuts and installs under `%LOCALAPPDATA%\Programs\ATLAS`. Launch at sign-in is available in Settings.

Install over an existing ATLAS installation to retain your settings and conversations. The installer is unsigned; Windows may show SmartScreen. See the README for installation and Windows unblock instructions.
