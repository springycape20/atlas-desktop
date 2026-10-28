# Project tools (next release)

Open **Project tools** in the left navigation. **Context** buttons beside both composers open the same tools for the current chat. These changes are on the development branch and are not part of the published 0.8.3 installer.

## Project knowledge and context

Write a draft message, open Context, enable **Relevant project excerpts**, then choose **Refresh preview**. ATLAS ranks matching source files, shows line references, and extracts basic symbol/import hints. These are navigation aids, not a complete language parser or proof of a dependency relationship. Source comments and excerpts are treated as untrusted reference data.

The index runs in a worker. It uses Git's visible file list where available and a bounded directory walk otherwise. Common credential files, private configuration folders, generated dependencies and paths outside the project are excluded. It examines up to 1,500 eligible text files, skips files over 128 KB, and reads at most 12 MB of changed source per refresh. A limited scan is labelled. It refreshes files when their size or modification/change times differ and removes deleted paths. Up to three projects share an approximately 32 MB source-cache budget; this is an estimate of retained source data, not a cap on total process memory. Source contents stay in memory and the worker closes after two idle minutes.

Context controls can exclude project instructions, saved memories, conversation history, attachments and individual excerpt paths. Choices last for the current chat and app session. The preview shows optional ATLAS additions; provider instructions, provider-managed context and tool reads can add more. The basic Colab path map is separate from opt-in source excerpts. File exclusions apply to ATLAS navigation and excerpts, not filesystem permissions. They cannot prevent a provider from reading a file through its own tools. Restricting an Assistant category starts a fresh provider session; already disclosed material cannot be recalled. A resumed Colab run keeps its saved request and context policy.

## Performance

Performance shows window startup time, main-process memory, running tasks, active workers and up to 40 recent provider/index request durations. Memory excludes the renderer, local model server and provider processes. Measurements stay local and are not uploaded. Provider durations include model/tool work; they do not isolate network time or imply a model-speed improvement. History and index workers release their caches after two idle minutes.

Run `node build/benchmark-local.cjs` for a synthetic 150-file index benchmark. It creates temporary fixtures and uses no provider accounts. One local run measured 246 ms cold and 133–135 ms warm, with zero source rereads on warm searches. Hardware and project shape affect these numbers; they are not whole-app performance guarantees.

## Recovery

Recovery lists saved stopped/finished tasks. Open a task, inspect changed files, or compare two saved Colab stage reports. Stage reports are model-reported evidence. ATLAS seals a file checkpoint after completed Colab stages. Following an unexpected close, running jobs load paused with an explanation; requests are never automatically replayed.

**Preview restore to before task** lists the files before exposing a separate Restore button. Restore checks their current contents, refuses conflicting later edits, preserves Git commits/index state and saves an undo snapshot. An incomplete scan, binary/large content, or a crash during a later stage may prevent automatic restoration. Use Git or inspect the retained worktree in those cases. Restore covers the recorded task files, not every file in the project.

## Workflows

Workflows include starters for bugs, features, security reviews and release preparation. Edit a starter or create a template with a task, mode, acceptance criteria, scope and check commands. Up to 50 custom workflows are saved locally. Applying one fills an unsent Colab draft. Review it and its **Workflow check commands** in Colab settings before sending.

Workflow checks temporarily override project completion checks for that task. Project settings are preserved. These commands execute project code in the task workspace when the task runs. Plan and Compare remain read-only and skip automatic commands.

## Parallel Colab batches

Enter 2–8 independent tasks, the project folder, required integration check commands, and a concurrency limit of 1–3. **Queue batch for review** adds a paused batch. **Start queue** starts eligible items in the queue, including any earlier waiting tasks. Each subtask uses normal Codex/Claude collaboration in a separate worktree. Concurrency limits simultaneous tasks, not total tokens or spend.

The integration item waits for every subtask to finish successfully. ATLAS snapshots their changes into a fresh combined worktree; it does not apply them to the original checkout. A clean merge starts a final Colab build/review pass with the supplied integration checks. Review and accept the combined result when ready. Source tasks that belong to a combined workspace cannot be individually accepted unless that combined workspace is discarded.

Failed subtasks pause new work. Merge conflicts also pause the batch and retain the partial combined checkout and all source workspaces for inspection. They do not automatically run a model to resolve those conflicts. The original project stays unchanged. Removing a batch queue item removes the whole batch from the queue; it does not delete its worktrees. Queues load paused after restart.

## Local models

Use **Local models** to enter a loopback API address and model identifier. **Find server models** queries the server only when clicked. Enable local mode and save to route Assistant text requests there. Saving does not start a model request. Disable it to return to normal provider routing. Colab continues to use Codex and Claude.

The adapter uses the compatible `/v1/models` and `/v1/chat/completions` interfaces documented by [Ollama](https://docs.ollama.com/api/openai-compatibility) and [LM Studio](https://lmstudio.ai/docs/developer/openai-compat). Common base addresses are `http://127.0.0.1:11434/v1` and `http://127.0.0.1:1234/v1`. Only HTTP loopback addresses are accepted; localhost is resolved to the numeric loopback address, credentials/query parameters are rejected, and redirects are refused. This adapter supports servers accepting local requests without an API key. ATLAS does not install a server or download model files.

Local mode supports streamed text chat, earlier conversation text and selected text context. It has no model-driven editing, shell, image understanding or Colab role support, and it does not run project completion commands. Failures are reported without automatically falling back to cloud providers. Stop cancels the request. Output/response size limits reject oversized or incomplete responses.

A loopback server can itself route a model to the cloud. Choose an installed local model and configure that server appropriately for offline inference. Optional ElevenLabs speech, GitHub update checks and other enabled tools have independent network behaviour. Model files, hardware requirements and their licences belong to the chosen server/model distribution; no new model is bundled with ATLAS.
