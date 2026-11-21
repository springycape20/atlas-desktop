# ATLAS

Official Windows installers, documentation links, and update feed for **ATLAS** (current release: **v0.14.0**).

- **Website:** https://atlasapp.net.co/
- **Latest download (Windows 10/11 x64):** [ATLAS 0.14.0](https://github.com/springycape20/atlas-desktop/releases/latest)
- **Privacy & data handling:** [docs/PRIVACY.md](docs/PRIVACY.md)

## What is ATLAS?

ATLAS is a local Windows desktop workspace for **Codex**, **Claude Code**, optional **Gemini (gy acp)**, and optional **local loopback models** (Ollama, LM Studio, llama.cpp).

- **Live Split-Screen Compare, Second Opinion & Intent Routing:** Compare Codex and Claude side by side in Free core (Compare toggle or /compare [prompt]), run 3-way Trio Compare with Gemini in Pro, cross-check any reply in one click with read-only **Second opinion**, and define safe local intent-based model routing rules in **Settings → Model routing** (manual overrides always win).
- **Unified Assistant, / Slash Commands & In-App Command Editor:** Chat with your AI providers in one workspace, switch providers/models/effort inline, create/edit/preview custom Markdown prompt commands ($ARGUMENTS) right inside ATLAS (/commands) with starter templates (/review, /commit, /explain, /test-plan), and access discovered provider skills.
- **Connections Hub (Shared MCP):** Manage local stdio and remote Streamable HTTP MCP servers in one place (**Tasks → Connect → Connections** or /connections) with Windows DPAPI (safeStorage) encrypted credentials, one-click **MCP Config Import** (Claude Desktop, Cursor, Windsurf), per-tool approval rules (sk / llow-chat / deny with read-only/destructive badges), an in-memory redacted **MCP Call Inspector Drawer**, 8 curated presets, Global/Project scopes, and per-chat active toggles.
- **Auto-Detect Local Models (/local):** Probe standard loopback ports for running Ollama (11434), LM Studio (1234), and llama.cpp (8080) servers on explicit click and switch local models inline via /local or /model.
- **PR / Branch Review Mode & Recurring Local Automations:** Run strictly read-only structured reviews (**Blocker / Warning / Suggestion**) on local Git branches or explicitly loaded GitHub PRs via local gh CLI in **Review Center** (with confirmation-gated comment posting), and schedule opt-in zero-AI-token local Git/project checks (**Scheduled checks**) surfaced directly in **Activity**.
- **Colab & 3-LLM Trio Mode (Pro):** Let models build, check, and review each other’s work in isolated Git worktrees, with automated checks before review, dispute rulings, and 2- or 3-lane Workflow Graphs.
- **Project Context, Onboarding & Privacy Controls:** Live 4-step Activity onboarding checklist, optional read-only Markdown / Obsidian vault references, per-chat context toggles, fresh preview receipts before sending, project editor, interactive PowerShell terminals, Git panel, and sandboxed local previews.
- **My Work & Shared Teamwork (Pro):** Project boards, reusable Board Templates (**Release Checklist**, **Bug & Incident Triage**, **Feature Sprint**), owner board archive/restore/permanent delete, permanent deleted-task purge, protected drafts, account-bound invitations, and 5-second zero-ciphertext revision-ping sync.
- **Optional Local Voice:** Local Whisper speech recognition and Windows speech (spoken replies, wake-word, and follow-up listening all start off on new installations).

## Accounts, Pricing & Licensing

- **ATLAS Account:** Signing in to a free ATLAS account is required to open the desktop workspace.
- **Free Core:** Assistant chat, 2-way Split-Screen Compare, Second Opinion, intent routing rules, / slash commands & editor, Connections Hub (importer, per-tool approvals, Call Inspector), local model auto-detect, PR/Branch review, Scheduled checks, project tools, terminals, Git/diff review, local voice, and read-only Markdown vault context are included free.
- **ATLAS Pro (Optional):** A/month or A/year via Stripe hosted checkout unlocks **Colab** (including 3-LLM Trio Compare & Trio Colab), **My Work**, and **Teamwork / Shared Teamwork**.
- **Bring Your Own AI Accounts:** ATLAS does not bundle AI provider subscriptions; Codex, Claude Code, and Gemini usage remain under your own provider accounts and terms.
- **Source & Licence:** Ongoing development is maintained in a private repository. Previously distributed MIT-covered software retains its MIT permissions; bundled third-party notices accompany every installer.

## Install & Setup

1. Download **ATLAS-Setup-0.14.0.exe** from [Releases](https://github.com/springycape20/atlas-desktop/releases/latest) (Windows 10/11 x64).
2. Run the installer — it installs per-user without admin elevation and lets you **choose any installation folder** (defaulting to %LOCALAPPDATA%\Programs\atlas-local-desktop).
   - *Unsigned installer note:* Windows installers are currently unsigned. If Windows SmartScreen warns you, choose **More info → Run anyway** (only run installers downloaded from this repository’s Releases page).
3. Sign in or create an ATLAS account, then install and sign in to **Codex**, **Claude Code**, and/or optional **Gemini** (gy) CLIs (or connect a local loopback model server). Use **Settings → Provider accounts → Test connections and dependencies** to verify setup.

### Updating

Open **Settings → App updates** to check, download, and install new releases. Both stable (latest.yml) and beta (eta.yml) channels receive 0.14.0.

## Support & Security

- Report ordinary bugs and feature requests in [GitHub Issues](https://github.com/springycape20/atlas-desktop/issues).
- Report security vulnerabilities privately via [GitHub Security Advisories](https://github.com/springycape20/atlas-desktop/security/advisories/new).
- Never post passwords, API keys, chats, or private diagnostics in public issues.

*Independent software built by springycape20. Not affiliated with OpenAI, Anthropic, or Google.*
