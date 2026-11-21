# ATLAS

Official Windows installers, documentation links, and update feed for **ATLAS** (current release: **v0.13.0**).

- **Website:** https://atlasapp.net.co/
- **Latest download (Windows 10/11 x64):** [ATLAS 0.13.0](https://github.com/springycape20/atlas-desktop/releases/latest)
- **Privacy & data handling:** [docs/PRIVACY.md](docs/PRIVACY.md)

## What is ATLAS?

ATLAS is a local Windows desktop workspace for **Codex**, **Claude Code**, and optional **Gemini (`agy acp`)**.

- **Unified Assistant & `/` Slash Commands:** Chat with your AI providers in one workspace, switch providers/models/effort inline, run workflows, create custom Markdown prompt commands (`.atlas/commands/*.md` and global commands with `$ARGUMENTS`), and access discovered provider skills.
- **Connections Hub (Shared MCP):** Manage local stdio and remote Streamable HTTP MCP servers in one place (**Tasks → Connect → Connections** or `/connections`) with Windows DPAPI (`safeStorage`) encrypted credentials, 8 curated presets, Global/Project scopes, inline Tool Inspector, per-chat active toggles, and read-only Provider-Managed Connector discovery.
- **Colab & 3-LLM Trio Mode (Pro):** Let models build, check, and review each other's work in isolated Git worktrees, with automated checks before review, dispute rulings, and 2- or 3-lane Workflow Graphs.
- **Project Context & Privacy Controls:** Optional read-only Markdown / Obsidian vault references, per-chat context toggles, fresh preview receipts before sending, project editor, interactive PowerShell terminals, Git panel, and sandboxed local previews.
- **My Work & Shared Teamwork (Pro):** Project boards, tasks, discussions, protected drafts, and account-bound board invitations.
- **Optional Local Voice:** Local Whisper speech recognition and Windows speech (spoken replies, wake-word, and follow-up listening all start off on new installations).

## Accounts, Pricing & Licensing

- **ATLAS Account:** Signing in to a free ATLAS account is required to open the desktop workspace.
- **Free Core:** Assistant chat, `/` slash commands, Connections Hub, project tools, terminals, Git/diff review, local voice, and read-only Markdown vault context are included free.
- **ATLAS Pro (Optional):** A$10/month or A$90/year via Stripe hosted checkout unlocks **Colab**, **My Work**, and **Teamwork / Shared Teamwork**.
- **Bring Your Own AI Accounts:** ATLAS does not bundle AI provider subscriptions; Codex, Claude Code, and Gemini usage remain under your own provider accounts and terms.
- **Source & Licence:** Ongoing development is maintained in a private repository. Previously distributed MIT-covered software retains its MIT permissions; bundled third-party notices accompany every installer.

## Install & Setup

1. Download **`ATLAS-Setup-0.13.0.exe`** from [Releases](https://github.com/springycape20/atlas-desktop/releases/latest) (Windows 10/11 x64).
2. Run the installer — it installs per-user without admin elevation and lets you **choose any installation folder** (defaulting to `%LOCALAPPDATA%\Programs\atlas-local-desktop`).
   - *Unsigned installer note:* Windows installers are currently unsigned. If Windows SmartScreen warns you, choose **More info → Run anyway** (only run installers downloaded from this repository's Releases page).
3. Sign in or create an ATLAS account, then install and sign in to **Codex**, **Claude Code**, and/or optional **Gemini** (`agy`) CLIs. Use **Settings → Provider accounts → Test connections and dependencies** to verify setup.

### Updating

Open **Settings → App updates** to check, download, and install new releases. Existing `0.13.0-beta` testers automatically receive `v0.13.0` through the beta transition feed and move onto the stable update channel once updated.

## Support & Security

- Report ordinary bugs and feature requests in [GitHub Issues](https://github.com/springycape20/atlas-desktop/issues).
- Report security vulnerabilities privately via [GitHub Security Advisories](https://github.com/springycape20/atlas-desktop/security/advisories/new).
- Never post passwords, API keys, chats, or private diagnostics in public issues.

*Independent software built by springycape20. Not affiliated with OpenAI, Anthropic, or Google.*
