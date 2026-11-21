# ATLAS Privacy & Data Handling

*Updated for ATLAS 0.13.0 — 22 November 2026*

ATLAS is an independent Windows desktop application maintained by [springycape20](https://github.com/springycape20). ATLAS operates no AI inference proxy and contains no publisher telemetry, analytics, or automatic crash-upload feature.

## What Stays on Your PC

- **Local Workspace Records:** Saved chats, unsent drafts, memories, reminders, settings, task plans, project profiles, permissions, and copied attachments are stored locally under `%LOCALAPPDATA%\ATLAS`. Uninstalling keeps this folder so reinstalling restores your workspace.
- **OS-Encrypted Credentials:** Your ATLAS refresh credential (`account-session.enc`), Connections Hub MCP secrets (`connection-secrets.enc`), and optional ElevenLabs API key are encrypted at rest with Windows DPAPI (`safeStorage`) and excluded from local record backups. Secrets stay in the Electron main process and are never returned to renderer code or sent to AI models.
- **Read-Only Markdown / Obsidian Vault:** Optional and disabled by default. ATLAS reads selected notes without modifying files, requires per-chat opt-in, and requires a fresh excerpt preview before sending.
- **Local Backups & Deletion:** Automatic daily backups of non-secret local records are compressed (not encrypted) and kept locally. You can turn them off under **Backups and recovery** or reset local ATLAS records at any time under **Settings → Tools and data → Delete local ATLAS data**.

## What Leaves Your Computer

- **Your Chosen AI Providers:** When you send a message or start a Colab task, your prompt and approved context go directly to **Codex (OpenAI)**, **Claude Code (Anthropic)**, and/or optional **Gemini (Google)** through their installed CLIs under your own accounts and provider terms. Optional local-model chat sends requests only to the localhost endpoint you configure.
- **ATLAS Account & Authentication:** Both Free and Pro require an ATLAS account sign-in verified through Supabase Auth. Authentication emails (verification and recovery codes) are sent via Resend SMTP from `auth.atlasapp.net.co` with open and click tracking disabled. Optional profile fields are encrypted before database storage.
- **Optional Pro Subscriptions (Stripe):** Upgrading to ATLAS Pro (A$10/month or A$90/year) opens Stripe's hosted checkout in your system browser. ATLAS never collects or stores payment card details. Billing records contain no chats, files, notes, or AI-provider tokens.
- **Optional Shared Teamwork (Pro):** Explicitly shared board names, task text, member account IDs, and 24-hour invitation codes are stored on the ATLAS account service using server-managed AES-256-GCM encryption at rest (not end-to-end encrypted from service operators). Local files, chats, and provider credentials are never uploaded automatically.
- **Optional Voice & MCP Connections:** Local Whisper speech recognition and Windows speech run on your PC and start **off** on new installations. Optional ElevenLabs speech sends spoken reply text to ElevenLabs using your own API key. MCP servers you add in Connections Hub communicate only when enabled and approved, according to each server's own behaviour.
- **Update Checks:** At launch, ATLAS checks GitHub Releases (`springycape20/atlas-desktop`) for new versions. Downloads and installation require your action unless you opt in to automatic background downloads in Settings.

## Security & Support

- Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/springycape20/atlas-desktop/security/advisories/new).
- Never post credentials, private prompts, or sensitive project files in public issues.
- Nothing in this notice excludes non-excludable consumer rights under Australian law.
