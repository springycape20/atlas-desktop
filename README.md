# ATLAS

**A local Windows desktop assistant for Codex and Claude Code.** Chat with either model in one app, talk to it with local speech, or hand a task to **Colab**, where Codex and Claude build, check and review each other's work before you see a single, verified answer.

[![Latest release](https://img.shields.io/github/v/release/springycape20/atlas-desktop?label=download)](https://github.com/springycape20/atlas-desktop/releases/latest)
![Windows x64](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-blue)
[![CI](https://github.com/springycape20/atlas-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/springycape20/atlas-desktop/actions/workflows/ci.yml)

![The ATLAS Assistant with a saved conversation](docs/images/assistant.png)

## What you can do

- **Chat with Codex and Claude in one place.** ATLAS routes each message to the right provider, streams the reply, and keeps a searchable history of your conversations. You can also import existing Codex and Claude Code chats.
- **Talk to it.** Local Whisper speech recognition, local Kokoro voices, a wake word, and short spoken replies with the full answer on screen. Your speech is processed on your PC.
- **Let two models work together in Colab.** One builds and the other reviews. Your project's checks run automatically, and the task only finishes when the reviewer accepts the work.
- **Keep your work organised.** Project profiles, file and screenshot attachments, memories, reminders, and a task list.
- **Control your PC, with permission.** Optional Windows computer control through the open-source [Windows-MCP](https://github.com/CursorTouch/Windows-MCP) server. ATLAS asks before each kind of action and shows a border while it is in control.

## Colab: Codex and Claude, working together

![A finished Colab debug task](docs/images/colab-debug.png)

Pick a **mode** for each task:

| Mode | What happens |
|---|---|
| **Build and review** | One model implements the task, ATLAS runs your project's checks, and the other model reviews against the task's acceptance criteria. Blockers go back to the builder until the reviewer accepts. |
| **Debug · reproduce, fix, verify** | The reviewer first reproduces the bug, ideally as a failing test, without fixing it. The builder then fixes the root cause, and the reviewer confirms the reproduction now passes. If the bug can't be reproduced, Colab stops and says what was tried. |
| **Plan** | A read-only plan, reviewed before you change anything. |
| **Compare approaches** | Both models propose independently, then the proposals are combined into one comparison. Read-only. |

**Checks run before review.** As soon as the builder finishes, ATLAS runs your configured checks (for example `npm test`). Failures go straight back to the builder instead of using up a review pass.

**When they disagree, you decide.** If the builder thinks a requested change isn't needed, it has to explain why, and the reviewer has to answer with evidence. If they still disagree, Colab pauses and shows both sides:

![Colab asking you to settle a disagreement between Codex and Claude](docs/images/colab-dispute.png)

Your choice is final for the rest of the task.

**See how the work happened.** **Workflow graph** shows each step, what it changed, the checks that ran, and how one step led to the next:

![The Colab workflow graph for a debug task](docs/images/colab-graph.png)

Also in Colab:
- **Isolated workspaces.** Editing tasks run in a separate Git worktree by default. **Review changes** shows the diff before anything is committed to your project.
- **Effort and cost controls.** Economy, Balanced and Thorough presets, an optional pass limit, and an optional token warning.
- **Resumable runs.** Stopped or paused tasks continue from their saved stages.

## Install

1. Download **ATLAS-Setup-*version*.exe** from the [latest release](https://github.com/springycape20/atlas-desktop/releases/latest) (about 440 MB, Windows 10/11 x64) and run it.
2. Install and sign in to **Codex** and/or **Claude Code** with their official installers. Colab needs both. In ATLAS, **Settings → Provider accounts → Test connections and dependencies** checks that they're found and signed in.
3. Choose a working folder, then set up your microphone and voice in **Settings**.

ATLAS installs for your Windows account in `%LOCALAPPDATA%\Programs\atlas-local-desktop`, with Desktop and Start Menu shortcuts. The installer includes the speech-recognition runtime and English models. The Kokoro voice model downloads the first time ATLAS speaks.

**If Windows warns about the installer:** the installer isn't code-signed yet, so Windows may warn about it.
- **SmartScreen:** choose **More info**, then **Run anyway**.
- **Smart App Control** may block a new release outright until Windows has seen enough downloads of it.
- **Only run installers from this repository's [Releases](https://github.com/springycape20/atlas-desktop/releases) page.**

### Updating

ATLAS checks for new releases when it starts. Open **Settings → App updates**, download the update, then choose **Restart and install**. Updates never install while a task is running, and your settings and conversations are kept.

## Your data and privacy

- **Stays on your PC:** conversations, memories, reminders, settings and Colab history are stored in `%LOCALAPPDATA%\ATLAS`. They are not synced between devices.
- **Sent to your providers:** your prompts and the files you attach go to Codex and/or Claude through your own accounts, under their terms. ATLAS has no server of its own.
- **Voice is local:** speech recognition and the Kokoro voices run on your PC. ElevenLabs voices are optional and need your own API key.
- **Check Settings:** wake-word and automatic follow-up listening are on by default, and you can turn them off. Computer control is off until you allow it for a chat.
- **Uninstalling** keeps your data in `%LOCALAPPDATA%\ATLAS`, so a reinstall picks up where you left off.

## Troubleshooting

- **Something went wrong or was slow:** open **Settings → Provider accounts → Show log file**. The log (`%LOCALAPPDATA%\ATLAS\logs\atlas.log`) records startup timing, errors and how the app closed. Include the relevant lines when you report a problem.
- **Codex or Claude isn't found:** run **Test connections and dependencies** in Settings. If your install is somewhere unusual, set `CODEX_EXECUTABLE` or `CLAUDE_CODE_EXECUTABLE` to its full path. A Claude Desktop sign-in alone doesn't sign in the Claude Code CLI.
- **A Colab task paused:** read the message above the message box. It says whether the task needs a decision, hit a pass limit, or found a blocker it couldn't resolve. Most paused tasks can continue with **Resume saved stages** in Run details.

## Development

ATLAS is an Electron app written in plain JavaScript.

```powershell
git clone https://github.com/springycape20/atlas-desktop.git
cd atlas-desktop
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-ATLAS.ps1
```

Setup installs dependencies, downloads the speech runtime and models (checksum-verified), and creates an **ATLAS.lnk** shortcut. Then start the app with `npm start` or **Start-ATLAS.cmd**. You need Node.js 22 LTS and Git.

| Command | What it does |
|---|---|
| `npm test` | Unit tests |
| `npm run test:colab-ui`, `test:assistant-ui`, `test:graph-ui`, `test:approvals-ui`, `test:dispute-ui` | Electron UI checks |
| `npm run format` / `npm run format:check` | Prettier formatting |
| `npm run dist:win` | Build the Windows installer into `dist/` |
| `npx electron build/capture-screenshots.cjs` | Re-capture the README screenshots with demo data |

**CI** runs formatting, unit tests and the UI checks on every push and pull request, and `main` requires them to pass. **Releases** are built by pushing a `vX.Y.Z` tag that matches `package.json`. The release workflow builds the installer, verifies the packaged app (including the security fuses in `ATLAS.exe`), and publishes the installer, its blockmap and `latest.yml` for the in-app updater.

For detailed behaviour, limits and design notes, see the [technical reference](docs/TECHNICAL.md).

## Credits

ATLAS uses Electron, [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Kokoro](https://github.com/hexgrad/kokoro) via kokoro-js, and Windows-MCP, each under its own license. The Colab workflow graph is inspired by [Graphify](https://github.com/Graphify-Labs/graphify). ATLAS is an independent project, not affiliated with OpenAI or Anthropic.
