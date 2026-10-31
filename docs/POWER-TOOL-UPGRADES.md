# Power tools (0.10.2)

Open **Tasks > Power tools** for the twelve capabilities below. This update fills the language-server, browser-testing, visual-comparison and preview-profiling gaps and connects the existing workflow tools. These additions are not in the older 0.10.1 installer.

| Capability | Where to use it | Behavior and limits |
| --- | --- | --- |
| 1. Language intelligence | Power tools > Language intelligence | Definitions, references and diagnostics from a user-configured installed stdio language server. No package installation or server auto-discovery. |
| 2. Verification and repair | Power tools > Verification and repair | Existing completion checks and bounded repair loops rerun recorded checks, stop after success or limits, and request approval before provider repair work. |
| 3. Isolated tasks | Power tools > Isolated tasks | Existing parallel Colab batches use separate Git worktrees and a combined integration workspace. Review before applying changes to the original project. |
| 4. Project knowledge | Power tools > Project knowledge | Existing editable, exact-project memories preserve decisions and commands. Tasks > Context freshness compares captured source receipts with current files. A changed file is a review signal, not automatic proof a memory is wrong. |
| 5. Context selection | Power tools > Context selection | Existing bounded source index, import/test hints, exclusion controls and estimated request-text budget. Static relationships can miss dynamic code; provider tool reads add context independently. |
| 6. Browser checks | Power tools > Browser checks | New saved declarative interaction/assertion recipes against the sandboxed local preview. Native approval precedes execution; the first failure stops later steps. |
| 7. Resume a task | Power tools > Resume a task | Existing stopped-task recovery and verified Colab stage checkpoints. Nothing replays automatically. Changed or incomplete checkpoints can prevent resumption. |
| 8. Model routing | Power tools > Model routing | Existing opt-in fast/strong routing and one-attempt check-driven escalation. Manual choices, project pins and local mode retain their protections. No guaranteed subscription savings. |
| 9. Visual change review | Power tools > Visual change review | New baseline/current images, changed-pixel percentage and changed bounding box at a matching page and image size. Baseline lives in the current preview session. |
| 10. Task recipes | Power tools > Task recipes | Existing editable workflows plus new browser-change, measured-performance and verified-milestone starters. Applying a workflow prepares an unsent draft. |
| 11. Local models | Power tools > Local models | Existing loopback compatible server connection and local hardware check. Text chat only; this adapter has no editing tools, shell, image understanding or Colab roles. |
| 12. Project profiling | Power tools > Project profiling | New preview renderer CPU/working-set samples, JS heap when available, DOM count and navigation timings. Same-page/viewport baseline deltas show measured differences. |

## Language-server setup

Choose the project conversation first. Enter the absolute path of an installed server executable, an arguments JSON array and its language ID. On Windows the executable must be an `.exe`; a JavaScript server can use an installed `node.exe` with the server script path and `--stdio` in its arguments. Use the arguments documented by that server. ATLAS does not bundle, install or download a language server.

Save the configuration, then enter a project-relative filename and line/column, starting at 1. Choose **Go to definition**, **Find references** or **Refresh diagnostics**. Starting the process asks for approval. Click a returned location to open the existing project-file preview. Up to 200 allowed project locations are shown; external/private/denied locations are omitted. Files are bounded to 256 KB and valid UTF-8. One server/project is active at a time, with up to ten open document snapshots and a two-minute idle shutdown.

The client uses the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) over stdio with UTF-16 positions, full document open notifications, definition/reference requests and push or supported pull diagnostics. It does not implement completion, rename, code actions, incremental edits or server-driven file changes. No diagnostic report yet is shown distinctly from a received empty report; allow the server time to analyze, then refresh.

An approved language server is an ordinary local program with your account permissions. ATLAS path filtering controls what its UI sends and displays; it does not sandbox that program's independent file/network access. Configuration is local in `language-servers.json` and saving it runs nothing.

## Browser recipes

Open a local preview before running a recipe. Browser steps are a JSON array, for example:

```json
[
  { "action": "fill", "selector": "#search", "value": "sample project" },
  { "action": "click", "selector": "button[type=submit]" },
  { "action": "wait", "ms": 250 },
  { "action": "assert-visible", "selector": "#results" },
  { "action": "assert-text", "selector": "#results", "value": "sample project" },
  { "action": "assert-path", "value": "/search?q=sample" }
]
```

Selectors use the page's CSS selectors. `assert-text` checks contained text; `assert-path` checks the exact pathname and query. Visibility checks element dimensions and common CSS hiding properties; they do not prove accessibility or lack of occlusion. Click/fill use DOM events, not operating-system input. File uploads, arbitrary JavaScript, browser extensions and automatic test discovery are unsupported.

Up to 30 steps run with waits limited to five seconds each and a one-minute total budget checked between steps. Add a wait step when the page needs time to navigate or update asynchronously. An unresponsive script times out after five seconds and closes its preview. Browser console warnings/errors are bounded to the latest 40 entries. Opening a new preview resets current-run evidence. Cross-origin requests, downloads and device permissions remain blocked by the preview sandbox. The local development server itself retains its ordinary process permissions.

Name and save a recipe to reuse it for this canonical project folder. Up to 50 recipes are stored across projects in `browser-check-recipes.json`. Saving never executes steps. Fill values are plaintext: use test data, not passwords. A same-name save replaces that project's recipe; Delete removes it. **Add browser evidence to draft** appends reviewed local results to the original conversation's unsent draft. Sending the draft shares the included results with its chosen provider.

## Screenshots and measurements

Choose a 390, 768 or 1280 px preview width. The actual viewport is reported because the operating system can constrain window sizes. Capture a visual baseline before editing. Compare after the page stabilizes, at the same URL and screenshot dimensions. Baseline/current images stay in preview memory until a new preview opens or ATLAS closes. They are not uploaded automatically or retained across restarts.

The comparison counts pixels with a channel difference greater than 16/255 and reports their bounding rectangle. Animation, caret blinking, font rendering and dynamic content can change pixels without a defect. Review the screenshots and project diff together; the percentage is not a quality score or semantic visual test.

Profile baseline/current comparisons require the same full URL and viewport. DOM count, JS heap and completed navigation timings have deltas; missing values remain unavailable rather than zero. Renderer CPU and working-set values come from Electron's process metrics and can include shared resources. Navigation timings describe the last page load; a sample does not rerun a benchmark. Repeat the same user scenario before and after a change and use the measured-performance recipe to preserve your method. These measurements do not profile arbitrary backend processes or diagnose a bottleneck automatically.

## Data and release status

No new dependency, publisher telemetry, server or model request is added by these controls. Language-server configuration and browser recipes join managed local backups and are removed by the existing local-data reset; exported backups remain separate. Screenshots, browser errors and profile baselines stay in preview memory unless explicitly attached/copied. Third-party servers and approved project programs have their own behavior.

This is a local development change, not a published release or an installer update. See the existing [project tools](PROJECT-TOOLS.md), [work sessions](WORK-SESSIONS.md) and [token efficiency](TOKEN-EFFICIENCY.md) guides for the previously available capabilities.
