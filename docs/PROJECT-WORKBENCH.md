# Project workbench (development)

These changes are available in source after 0.9.0. They are not included in the published 0.9.0 installer.

Use **Attach** in Chat or Colab to open **Live project preview**, **Project health**, **Named checkpoints**, or **Browse project files**. Task tools are also available from **Tasks**; health is available under Settings diagnostics.

## Live preview and visual feedback

Open an HTTP URL on `localhost`, `127.0.0.1`, or `::1` in a separate preview window beside chat. Project JavaScript runs in a sandbox without Node.js, the ATLAS API, device permissions, popups, or downloads. Requests outside the selected origin are blocked, including remote APIs, fonts and images. Same-origin WebSockets are allowed for development reloads.

**Start Vite server** supports an already installed `node_modules/vite/bin/vite.js` inside the selected project and Node.js on PATH. A confirmation names the project before executing its Vite configuration/plugins with your account permissions. It binds to `127.0.0.1:5173` with a strict port; it does not install dependencies. Other frameworks can use a server you start separately. Starting the server and opening its URL are separate actions. Stop the managed server from the controls; quitting ATLAS also stops it.

Server output refreshes in the controls. Recognised source locations are clickable read-only file previews. Unsupported log formats remain visible as text.

Choose **Select element**, click in the preview, then **Attach screenshot and selection to chat**. ATLAS captures the preview and adds a screenshot plus a bounded selector/text description to the original conversation's unsent draft. Page text and selectors are untrusted page-reported material. Review the draft before sending it to a provider. The temporary capture is removed after the attachment copy is created.

## Project files

Search filenames or UTF-8 file contents across the project. Searches are bounded to 2,000 visited entries, 100 matches, and an 8 MiB content budget; individual preview limits still apply. Private and denied paths, escaping links and credential files are excluded. Directory listings are capped at 200 entries, so a limited search may omit matches.

Choose **Keep beside chat for dragging** to make the browser nonmodal. Drag a filename into its original Chat or Colab composer to attach it. Files remain unsent until you send the message. Clicking a file continues to open its read-only preview.

## Completion reports and checkpoints

**Completion report** in a finished task opens its diff, executed checks, environment results and model review reports. Checks that did not run are identified explicitly. **Prepare Colab follow-up draft** creates an unsent debugging task using recorded failures and preserves an existing draft by opening a new chat when necessary.

**Named checkpoints** capture local project text files before a larger change. Name the checkpoint, then review changed files and select the ones to restore. A second confirmation lists the exact paths. Edits made after that review block restoration, and a recovery checkpoint supports undo. Binary/large files and private/excluded paths are not covered; use Git for complete backups. Existing tracker limits are 1,500 files, 512 KiB per text file and 12 MiB total. Checkpoint operations are blocked while ATLAS tasks are active. Deleting a saved checkpoint preserves project files.

## Context, health and accessibility

The context inspector shows optional material, excerpts and exclusions, with an approximate token count at four characters per token. Provider tools, retained sessions and file reads can add more. Provider-managed conversation compaction is not exposed to ATLAS. **Draft a conversation handover request** prepares an unsent request for a model-generated summary; it does not silently summarise or discard history.

**Project health** detects project manifests, tools present on PATH, dependency folder presence, and suggested check commands. It does not execute project scripts, install packages or query online advisories. Presence does not establish that a tool or dependency works; run the project's approved checks for that evidence.

Appearance retains adjustable text size, high contrast and spacing controls. The new **Motion** preference follows the system by default or explicitly reduces animations/transitions. Dialogs retain keyboard focus and Escape support; search fields and actions have accessible labels.
