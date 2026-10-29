# Privacy and local data

ATLAS is a free, independent Windows application maintained by the Australian publisher [springycape20](https://github.com/springycape20). The publisher operates no ATLAS inference service and the application contains no publisher telemetry, analytics or crash-upload feature. For private security reports use [GitHub private reporting](https://github.com/springycape20/atlas-desktop/security/advisories/new). Avoid private information in public support issues.

## What leaves your computer

When you send a message, selected prompts, attachments and relevant task/context information go to your chosen AI provider through its installed CLI and your own account. Colab shares relevant task work and handovers between Codex and Claude. Desktop tools may return screen images, clipboard content or file contents to the requesting provider. These can contain confidential information; review what is visible and attached before granting control or sending a request. Each provider's terms, retention settings and charges apply. ATLAS is not affiliated with or endorsed by OpenAI or Anthropic.

Whisper recognition runs on your PC, and Windows speech uses voices available on your system. Bundled Kokoro was removed in 0.8.3. Continuous wake-word and automatic follow-up listening are off until you enable them in Settings. Older default-on settings require renewed opt-in. A manual microphone press records a voice request; recognised text may be sent as a prompt. The wake indicator pauses automatic listening. Consider others nearby and obtain any required permission before recording them. Audio is handled transiently in memory and sent to the local Whisper process for recognition; ATLAS does not intentionally save microphone recordings as history.

Optional ElevenLabs speech sends the spoken-answer text to ElevenLabs using your API key and plan. It is a cloud service, even though other ATLAS records are local. ATLAS uses Windows secure storage for the saved key and does not read Claude sign-in tokens to display usage.

At startup ATLAS checks GitHub for updates and asks installed providers for available models through supported interfaces. Downloads contact GitHub, Hugging Face and runtime/package hosts when the relevant feature is used. Those hosts receive normal network metadata such as an IP address. Custom MCP servers and programs you authorise have their own behaviour and may make other requests; only enable ones you trust. The publisher does not receive those requests through an ATLAS server.

## What stays locally

Development builds after 0.9.0 can preview project images, text and static HTML locally in the chat window. Previewing does not send the file to a provider. HTML previews disable scripts, forms and network requests and use bounded local image/stylesheet reads. **Attach to next message** creates a local attachment copy through the existing flow; sending that message may share it with the selected provider. Project previews do not start a development server or execute project code.

In Project tools, source excerpts are indexed in a bounded in-memory worker cache and are added to provider requests only when enabled for the chat. A basic file-name map can be saved locally. Context exclusions affect ATLAS additions and do not change provider filesystem permissions. Custom workflow templates and batch/task records stay in the current ATLAS data folder; they can contain task text and command names. Parallel batches make multiple provider requests and share subtask work in the combined review.

Optional local-model text chat sends selected text to a user-configured loopback API and never automatically falls back to a cloud provider. That local server may have its own cloud routing, logs and retention; choose an installed local model for offline inference. Optional ElevenLabs speech and GitHub update checks remain separate. ATLAS does not bundle or download additional language models for this feature.

Saved chats, project/global memories, editable task plans, environment recipes, reminders, settings, permissions, copied attachments and task records are principally under `%LOCALAPPDATA%\ATLAS`. Colab history uses Chromium IndexedDB. Some migration copies may remain under `%APPDATA%\atlas-local-desktop`. Project worktrees and Git recovery snapshots can be stored in or alongside your projects. Provider CLIs keep their own history separately.

Conversation and attachment stores are not encrypted by ATLAS. Windows account permissions and any device encryption protect them to their respective limits. Local malware or another process running as you may access them. Saved ElevenLabs keys use Windows-backed encryption; that is not protection from all software running under your account.

ATLAS keeps data until you delete it; uninstalling preserves it for reinstall. Settings → Tools and data → Delete local ATLAS data requests a confirmed restart, then deletes current ATLAS chats, attachments, memories, settings, permission grants, logs and browser storage before stores reopen. It keeps downloaded tool runtimes and prevents automatic reimport of legacy records. Old Kokoro model caches within the current data directory are deleted by this reset. It does **not** delete legacy folders, your project files/worktrees, Git recovery snapshots, exported files, provider histories, or copies already received by providers. Remove those separately if desired. File deletion is not a promise of forensic secure erasure from disks or backups.

Diagnostic logs remain local unless you share them. Export redacted diagnostic log removes recognised credential patterns, but cannot identify every private sentence, path or screenshot. Review exports before sharing; never post raw credentials or chats in public issues. Support messages you choose to send to GitHub or a maintainer are a separate disclosure.

## Choices and limitations

You can type instead of using a microphone, choose local speech, remove a saved ElevenLabs key, revoke screen/shell permissions per chat, stop tasks, export chats, and reset current app records. AI replies can be wrong. A reviewer acceptance or passing test is evidence about the reported review/checks, not a guarantee that an answer is correct. A project worktree and remembered command permission are not an operating-system sandbox. Do not enable provider approval bypass for untrusted work.

This explanation describes the application, not every third-party CLI's internal traffic. There is no blanket waiver of rights that Australian law does not permit to be excluded. The publisher should reassess this statement before adding hosted features, analytics, support uploads or a website with data-collection features. Updated: 28 October 2026.
