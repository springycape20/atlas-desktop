ATLAS 0.11.1 adds eight improvements for working on local projects beside chat.

- **Guided benchmarks:** create fixed tasks and pinned model configurations with forms; advanced JSON remains available. Running a benchmark still asks for approval and uses provider allowance.
- **Editor actions:** review quick fixes, refactors, import organisation and file moves before applying. Completion supports text edits, additional edits and simple snippet placeholders. An approved installed language server is required for language actions.
- **Saved workspaces:** restore file tabs, the active file, preview locations and terminal layout. Snapshots exclude drafts, terminal output and commands. New shells require approval.
- **Browser recording:** record local preview clicks and form changes into a recipe draft, then review every selector and value. Likely private fields are excluded heuristically; use test data. Saving or running remains explicit.
- **Focused context:** select bounded function/class slices and recent changed lines with existing exclusions and budgets. No measured token-saving percentage is claimed.
- **Visual comparisons:** stabilise animation/font/caret capture conditions and save ignored pixel regions with baselines. Comparisons require matching URL, viewport, scale and scroll position.
- **Long histories:** Assistant uses an atomic metadata index and integrity-checked disk chunks; Colab upgrades to chunked IndexedDB storage. Both timelines mount visible messages with a buffer. Full history remains available; Colab still keeps complete message arrays in memory.
- **Node.js debugger:** approve a JavaScript entry point, add breakpoints, step through code, inspect call stacks and bounded local scopes, and open source files. The initial debugger uses an installed Node.js runtime; it does not evaluate expressions or invoke getters.

**History migration:** retain your pre-update record backup. Older ATLAS versions do not understand the migrated Colab database or the new Assistant index. Use recovery with its saved backup when downgrading. The legacy Assistant file and unreferenced chunks are retained for recovery; they can use additional disk space.

No dependency additions, publisher telemetry or automatic uploads. Debugged project code runs with your account permissions after approval. The installer remains unsigned under the existing owner-authorized policy; Windows may show a warning.

**Updating:** use Settings > App updates or install the download over your current version. Users on 0.10.2 or older must download the installer because those versions' in-app installation fails. Windows x64; close older ATLAS instances before installing. No legal or security certification is claimed.
