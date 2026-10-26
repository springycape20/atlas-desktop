(() => {
  const storageKey = 'atlas.colab.chats.v1';
  let chats = [],
    selected = '',
    defaults = {},
    catalog = {
      codex: [
        { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
        { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
        { id: 'gpt-6-sol', name: 'GPT-6 Sol' },
        { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
      ],
      claude: [
        { id: 'opus', name: 'Claude Opus · latest' },
        { id: 'sonnet', name: 'Claude Sonnet · latest' },
        { id: 'haiku', name: 'Claude Haiku · latest' },
      ],
    };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    chats = (Array.isArray(saved.chats) ? saved.chats : []).filter(
      (chat) => chat && typeof chat.id === 'string' && Array.isArray(chat.messages),
    );
    for (const chat of chats)
      if (chat.passLimitVersion !== 2) {
        chat.maxRounds = null;
        chat.passLimitVersion = 2;
      }
    selected = saved.selected;
  } catch {}
  try {
    defaults = JSON.parse(localStorage.getItem('atlas.colab') || '{}') || {};
  } catch {}
  let historyReady = false,
    historyWritable = false,
    historyError = '',
    renderedChat = '',
    projectFilter = '',
    wasVisible = false;
  const scrollPositions = new Map(),
    pendingJobs = new Map(),
    pendingUpdates = [];
  const projectKey = (folder) =>
    String(folder || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  const current = () => chats.find((chat) => chat.id === selected);
  function makeChat() {
    const previous = current();
    const chat = {
      id: crypto.randomUUID(),
      title: 'New Colab chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectName: previous?.projectName || '',
      cwd: previous?.cwd || cwd || '',
      draft: '',
      messages: [],
      preset: previous?.preset || 'balanced',
      milestones: previous?.milestones || 'auto',
      rolesExplicit: previous?.rolesExplicit === true,
      adaptiveEffort: previous?.adaptiveEffort === true,
      reuseChecks: previous?.reuseChecks === true,
      tokenWarning: previous?.tokenWarning ?? null,
      brief: { criteria: '', outOfScope: '' },
      mode: previous?.mode || 'build',
      roles: previous?.roles || 'codex-builds',
      isolated: previous?.isolated !== false,
      maxRounds: null,
      passLimitVersion: 2,
      profileId: previous?.profileId || '',
      effort: previous?.effort || defaults.effort || 'medium',
      codexModel: previous?.codexModel || defaults.colabCodexModel || '',
      claudeModel: previous?.claudeModel || defaults.colabClaudeModel || '',
      busy: false,
      status: '',
    };
    chats.push(chat);
    selected = chat.id;
    return chat;
  }
  if (!current()) makeChat();
  const style = document.createElement('style');
  style.textContent = `
    .nav-item[aria-current=page]{background:#193038;color:#b0edf0}.workspace-divider{height:1px;background:#233b43;margin:12px 8px}
    .colab-workspace{min-width:0;display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100vh - 155px);border:1px solid #29414b;border-radius:18px;overflow:hidden;background:#0c171e}
    .colab-chats{padding:18px 12px;border-right:1px solid #243942;background:#0a141a}.colab-chats>button{width:100%;margin-bottom:18px}.colab-chat-list{display:flex;flex-direction:column;gap:6px;max-height:65vh;overflow:auto}.colab-chat-item{border:1px solid transparent;background:transparent;color:#a7bdc5;border-radius:9px;padding:12px 10px;text-align:left;cursor:pointer;overflow:hidden}.colab-chat-item[aria-current=true]{background:#183039;border-color:#34505c;color:#e0f1f3}.colab-chat-item span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.colab-chat-item small{display:block;margin-top:6px;color:#81a5ad;font-size:10px}
    .colab-chat-main{min-width:0;display:flex;flex-direction:column;padding:24px 28px;max-height:calc(100vh - 155px)}.colab-chat-header{display:flex;justify-content:space-between;gap:14px;align-items:center}@media(max-width:1100px){.colab-chat-header>span.session-chip{display:none}}.colab-chat-header h1{margin:0;font:600 23px Inter,Segoe UI,sans-serif}.colab-chat-header p{font:11px/1.6 Inter,Segoe UI,sans-serif;color:#8faab5;margin:6px 0 0}.colab-config{margin-top:18px;border-bottom:1px solid #253c45;padding-bottom:15px}.colab-config summary{cursor:pointer;color:#a8cdd4;font-size:12px}.colab-config-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.colab-config .field{margin:12px 0 0}.colab-folder-row{display:flex;align-items:center;gap:12px;margin-top:14px}.colab-folder-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px Consolas,monospace;color:#8faab5}.colab-folder-row button{flex:none}
    .colab-transcript{flex:1;min-height:180px;overflow:auto;padding:24px 2px;scroll-behavior:smooth}.colab-empty{padding:40px 8px;text-align:center;color:#8ca8b3;font:13px/1.8 Inter,Segoe UI,sans-serif}.colab-empty strong{display:block;color:#d3e7eb;font-size:22px;font-weight:500;margin-bottom:9px}.colab-message{margin-bottom:22px;font:13px/1.8 Inter,Segoe UI,sans-serif;color:#d1e1e6}.colab-message strong{display:block;margin-bottom:7px;color:#88cad3;font-size:11px}.colab-message p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.colab-message.user{max-width:90%;margin-left:auto;background:#1a3039;padding:12px 16px;border-radius:12px 12px 3px 12px}.colab-message.error{color:#f0c48f}.verify-badge{display:inline-block;margin-left:8px;padding:1px 8px;border:1px solid currentColor;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.02em;vertical-align:1px;cursor:help}.verify-badge[data-level=passed]{color:#7fd1a6}.verify-badge[data-level=failed]{color:#f39a8b}.verify-badge[data-level=partial],.verify-badge[data-level=unverified]{color:#f0c48f}.colab-composer{padding-top:12px;border-top:1px solid #253c45}.colab-composer textarea{display:block;width:100%;min-height:72px;max-height:170px;resize:vertical;border:1px solid #36505a;border-radius:12px;background:#08141b;color:#e0edf0;padding:14px;font:13px/1.6 Inter,Segoe UI,sans-serif}.colab-composer textarea:focus{outline:2px solid #70bfc8;outline-offset:2px}.colab-compose-footer{display:flex;align-items:center;gap:10px;margin-top:12px}.colab-compose-footer [role=status]{flex:1;color:#8faab5;font-size:11px;line-height:1.6}.colab-compose-footer button:disabled{opacity:.5;cursor:wait}
    @media(max-width:1000px){.colab-workspace{grid-template-columns:160px minmax(0,1fr)}.colab-chat-main{padding:20px}.colab-config-grid{grid-template-columns:1fr}.colab-config[open]{max-height:38vh;overflow:auto}}
    @media(max-width:750px){.workspace-nav{flex-wrap:wrap}.workspace-divider{display:none}.colab-workspace{width:100%;display:flex;flex-direction:column;min-height:70vh}.colab-chats{border-right:0;border-bottom:1px solid #243942;padding:12px}.colab-chats>button{width:auto;margin:0 0 10px}.colab-chat-list{flex-direction:row;max-height:75px}.colab-chat-item{min-width:130px;max-width:180px}.colab-chat-main{max-height:none;min-height:65vh;padding:18px}.colab-transcript{max-height:55vh}.colab-chat-header{align-items:flex-start}.colab-chat-header h1{font-size:21px}}
  `;
  style.textContent +=
    '.colab-chat-main{height:calc(100vh - 155px);min-height:0;overflow:hidden}.colab-chat-header,.colab-composer{flex-shrink:0;max-height:42vh;overflow:auto}.colab-transcript{flex:1 1 0;min-height:0}.colab-config{flex-shrink:0;max-height:30vh;overflow:auto}@media(max-width:750px){.colab-chat-main{height:75vh;min-height:0}}';
  style.textContent +=
    '.colab-config[open]{max-height:24vh;flex-shrink:1;min-height:40px}.colab-composer{flex:0 1 auto;min-height:160px;max-height:42vh;overflow:auto}.colab-composer .attachment-bar{margin:3px 0}.colab-composer .attachment-bar p{margin:4px 0}.colab-composer textarea{min-height:60px}.colab-compose-footer{position:sticky;bottom:0;background:#0c171e;padding:6px 0}';
  style.textContent +=
    '.colab-composer{min-height:0;max-height:46vh}.colab-composer textarea{box-sizing:border-box;min-height:48px;height:48px;max-height:180px;resize:none;overflow-y:hidden;padding:12px 14px}.colab-work{margin:12px 0 18px;border:1px solid #28434d;border-radius:10px;padding:10px 12px;color:#92b2bd}.colab-work summary{cursor:pointer;font:12px/1.6 Segoe UI,sans-serif}.colab-work-list{max-height:24vh;overflow:auto;margin-top:8px}.colab-work-step{border-top:1px solid #213840;padding:8px 0;font:11px/1.6 Segoe UI,sans-serif}.colab-work-step pre{font:11px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;color:#bed4dd}.colab-work-step[data-status=failed]{color:#edb88c}.colab-work-note{font:10px/1.5 Segoe UI,sans-serif;color:#7897a3;margin:6px 0 0}';
  style.textContent +=
    '.task-progress pre{font:13px/1.7 Segoe UI,sans-serif;color:#c8d9df}.task-command>summary{color:#91aab4;cursor:pointer}.task-command pre{padding:8px;background:#071118;border-radius:7px}.assistant-task-work{margin:8px 0 16px}.assistant-task-work:empty{display:none}.assistant-task-work .colab-work{margin:0}.assistant-task-work .colab-work-list{max-height:32vh}.colab-work-step.task-progress{border-top:0;padding:6px 0}';
  style.textContent +=
    '.colab-chats>#colabProjectFilter{width:100%;min-width:0;margin:0 0 8px;padding:8px;border:1px solid #35505a;border-radius:8px;background:#07141b;color:#c9dfe6;font:11px Segoe UI,sans-serif}.colab-browse{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid #253c45}.colab-browse input{min-width:100px;flex:1;width:100px;border:1px solid #35505a;border-radius:8px;background:#07141b;color:#c9dfe6;padding:7px 9px;font:11px Segoe UI,sans-serif}.colab-browse button{padding:5px 8px;font-size:10px}.colab-browse>span{font:10px Segoe UI,sans-serif;color:#91adb8}.colab-chat-main>.colab-transcript{scroll-behavior:auto;overflow-anchor:none}.colab-message[data-match=true]{outline:1px solid #66b9c5;outline-offset:5px;border-radius:8px}.colab-message-actions{display:flex;gap:8px;margin-top:10px}.colab-message-actions button{padding:4px 8px;font-size:10px}.colab-message-actions [aria-pressed=true]{border-color:#81caca;color:#aff1f3}.colab-message time{font-weight:400;color:#7897a3;margin-left:8px}.colab-compare{width:min(1100px,94vw);max-height:90vh;border:1px solid #35505a;border-radius:14px;background:#0c171e;color:#d6e8ed;padding:0}.colab-compare::backdrop{background:#02080dd9}.colab-compare header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #29414a}.colab-compare h2{font-size:17px;margin:0}.colab-compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;max-height:70vh;overflow:auto}.colab-compare-grid section{min-width:0}.colab-compare-grid h3{font:12px Segoe UI,sans-serif;color:#91adb8}.colab-compare-grid pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 Segoe UI,sans-serif;background:#071118;padding:12px;border-radius:8px}.colab-chat-project{font:10px/1.5 Segoe UI,sans-serif;color:#81a5ad;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:750px){.colab-workspace>.colab-chats{max-height:150px}.colab-chats>#colabProjectFilter{padding:4px;margin-bottom:4px}.colab-compare-grid{grid-template-columns:1fr}.colab-browse{gap:4px;padding:5px 0}.colab-browse input{flex-basis:100px}}';
  style.textContent +=
    '@media(max-width:750px){.colab-workspace>.colab-chats{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr);gap:4px;max-height:110px;padding:6px}.colab-chats>#colabNewChat{grid-column:1;grid-row:1;margin:0;padding:5px 8px;font-size:10px}.colab-chats>#colabProjectFilter{grid-column:2;grid-row:1;margin:0}.colab-chats>#colabSearch{grid-column:1/-1;grid-row:2;margin:0}.colab-chats>.colab-chat-list{grid-column:1/-1;grid-row:3;max-height:32px}.colab-chat-header>div:first-child{min-width:0;flex:1}.colab-chat-header h1{font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.colab-chat-header>span.session-chip{display:none}.colab-chat-header p{font-size:10px}.colab-chat-main>.colab-recovery{font-size:9px;margin:3px 0}.colab-chat-main>.colab-composer{padding-top:6px}.colab-composer textarea{max-height:100px}}@media(max-width:750px) and (max-height:680px){.colab-chat-header p{display:none}.colab-chat-header .colab-chat-actions button{padding:4px 6px;font-size:9px}.colab-chat-main>.colab-recovery{max-height:28px}.colab-compose-footer [role=status]{font-size:9px}.colab-browse button{font-size:9px;padding:4px 5px}}';
  document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'colab-workspace';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Colab chat workspace');
  panel.innerHTML = `<aside class="colab-chats" aria-label="Colab conversations"><button class="quiet-button" id="colabNewChat" type="button">＋ New Colab chat</button><div class="colab-chat-list" id="colabChats"></div></aside>
    <div class="colab-chat-main"><header class="colab-chat-header"><div><h1>Colab</h1><p>Codex + Claude · one task, one shared result</p></div><span class="session-chip">PRIVATE COLLABORATION</span></header>
    <details class="colab-config" id="colabConfig"><summary>Models, effort and working folder</summary><div class="colab-config-grid"><label class="field"><span>Codex model</span><select id="colabCodexModel"></select></label><label class="field"><span>Claude model</span><select id="colabClaudeModel"></select></label><label class="field"><span>Shared effort</span><select id="colabEffort"><option value="low">Low · faster</option><option value="medium">Medium · balanced</option><option value="high">High · deeper review</option><option value="xhigh">Extra high</option><option value="max">Maximum</option></select></label></div><div class="colab-folder-row"><button class="quiet-button" type="button" id="colabChooseFolder">Choose folder</button><span id="colabFolder"></span></div></details>
    <div class="colab-transcript" id="colabTranscript" role="log" aria-label="Colab messages" aria-live="polite"></div>
    <form class="colab-composer" id="colabForm"><label class="sr-only" for="colabTask">Message Colab</label><textarea id="colabTask" rows="1" maxlength="20000" aria-label="Message Colab" placeholder="Give Codex and Claude a task, or ask a follow-up…"></textarea><div class="colab-compose-footer"><span id="colabStatus" role="status" aria-live="polite"></span><button class="quiet-button" id="colabStop" type="button" hidden>Stop</button><button class="primary-button" id="colabStart" type="submit">Send to Colab</button></div></form></div>`;
  document.querySelector('.layout').append(panel);
  const toolsButton = document.createElement('button');
  toolsButton.type = 'button';
  toolsButton.className = 'quiet-button';
  toolsButton.id = 'colabTools';
  toolsButton.textContent = 'Tools';
  toolsButton.title = 'Add, start or stop computer-control and MCP tools';
  toolsButton.onclick = () => window.atlasWorkbench?.open('Tools');
  panel.querySelector('.colab-chat-header').append(toolsButton);
  const search = document.createElement('input');
  search.id = 'colabSearch';
  search.className = 'history-search';
  search.placeholder = 'Search Colab chats…';
  search.setAttribute('aria-label', 'Search Colab chats');
  panel.querySelector('#colabChats').before(search);
  search.oninput = () => render();
  const projectPicker = document.createElement('select');
  projectPicker.id = 'colabProjectFilter';
  projectPicker.setAttribute('aria-label', 'Filter Colab history by project');
  search.before(projectPicker);
  try {
    projectFilter = localStorage.getItem('atlas.colab.project-filter') || '';
  } catch {}
  projectPicker.onchange = () => {
    projectFilter = projectPicker.value;
    try {
      localStorage.setItem('atlas.colab.project-filter', projectFilter);
    } catch {}
    render();
  };
  const browsing = document.createElement('div');
  browsing.className = 'colab-browse';
  browsing.innerHTML =
    '<input id="colabFind" type="search" placeholder="Find in this chat…" aria-label="Find messages in this chat"><span id="colabMatches" role="status"></span><button class="quiet-button" id="colabPreviousMatch" type="button" aria-label="Previous matching message">↑</button><button class="quiet-button" id="colabNextMatch" type="button" aria-label="Next matching message">↓</button><button class="quiet-button" id="colabCompare" type="button" disabled>Compare results (0/2)</button><button class="quiet-button" id="colabLatest" type="button" hidden>Latest ↓</button>';
  panel.querySelector('#colabTranscript').before(browsing);
  const compareDialog = document.createElement('dialog');
  compareDialog.className = 'colab-compare';
  compareDialog.setAttribute('aria-label', 'Compare Colab results');
  compareDialog.innerHTML =
    '<header><h2>Compare results</h2><button class="quiet-button" type="button">Close</button></header><div class="colab-compare-grid"></div>';
  document.body.append(compareDialog);
  compareDialog.querySelector('button').onclick = () => compareDialog.close();
  let matches = [],
    matchIndex = 0;
  const comparisons = new Map(),
    forceLatest = new Set();
  const controls = document.createElement('div');
  controls.className = 'colab-config-grid';
  controls.innerHTML =
    '<label class="field">Mode<select id="colabMode"><option value="build">Build and review</option><option value="plan">Plan · read-only</option><option value="debug">Debug · reproduce, fix, verify</option><option value="compare">Compare approaches · read-only</option></select></label><label class="field">Roles<select id="colabRoles"><option value="auto">Auto · based on efficiency preset</option><option value="codex-builds">Codex builds · Claude reviews</option><option value="claude-builds">Claude builds · Codex reviews</option><option value="proposals">Compare proposals, then build</option></select></label><label class="field">Pass limit (optional)<input id="colabPasses" type="number" min="1" step="1" placeholder="Unlimited"><small>No pass cap. Approving reviews finish the task; stalled reviews pause for attention.</small></label><label class="toggle-row"><span>Review edits in an isolated Git worktree<small id="colabEditingHint"></small></span><input id="colabIsolated" type="checkbox" checked></label>';
  panel.querySelector('#colabConfig').append(controls);
  const efficiencyControls = document.createElement('div');
  efficiencyControls.className = 'colab-config-grid';
  efficiencyControls.innerHTML =
    '<label class="field">Efficiency<select id="colabPreset"><option value="economy">Economy · concise handovers and focused review</option><option value="balanced">Balanced · normal implementation and review</option><option value="thorough">Thorough · independent proposals and deeper review</option></select><small>Presets keep your models and shared effort. Explicit role choices are respected.</small></label><label class="field">Milestones<select id="colabMilestones"><option value="auto">Auto · the builder splits large build tasks</option><option value="on">On · plan milestones before every build task</option><option value="off">Off · always one build</option></select><small>Each milestone is built, checked and reviewed on its own, then a final review checks the whole task. Milestones without a check command are marked unverified.</small></label><label class="field">Token warning (optional)<input id="colabTokenWarning" type="number" min="1" step="1" placeholder="Unlimited"><small>Pauses between stages using reported usage plus rough text estimates. Tool/context overhead may add usage. Resume grants another interval.</small></label><label class="toggle-row"><span>Adapt shared effort for blockers<small>Opt in to raise both providers to High for unresolved blockers; higher manual effort stays unchanged.</small></span><input id="colabAdaptiveEffort" type="checkbox"></label><label class="toggle-row"><span>Reuse unchanged ATLAS checks<small>Opt in only for checks based on local files, not time, network or external state. Reuse needs a complete identical snapshot, commands and environment; incomplete scans always rerun.</small></span><input id="colabReuseChecks" type="checkbox"></label><label class="field">Acceptance criteria (optional)<textarea id="colabCriteria" rows="2" maxlength="4000" placeholder="One required outcome per line"></textarea></label><label class="field">Out of scope (optional)<textarea id="colabOutOfScope" rows="2" maxlength="2000" placeholder="What should stay outside this task?"></textarea></label>';
  panel.querySelector('#colabConfig').append(efficiencyControls);
  const efficiencyView = document.createElement('details');
  efficiencyView.className = 'colab-efficiency';
  const efficiencyTitle = document.createElement('summary'),
    efficiencyBody = document.createElement('div');
  efficiencyTitle.textContent = 'Stage usage and context';
  efficiencyView.append(efficiencyTitle, efficiencyBody);
  panel.querySelector('#colabForm').before(efficiencyView);
  const reportDialog = document.createElement('dialog');
  reportDialog.className = 'workspace-dialog';
  reportDialog.setAttribute('aria-label', 'Saved Colab stage report');
  const reportHeader = document.createElement('header'),
    reportTitle = document.createElement('h2'),
    reportClose = document.createElement('button'),
    reportText = document.createElement('pre');
  reportClose.type = 'button';
  reportClose.textContent = 'Close';
  reportClose.className = 'quiet-button';
  reportHeader.append(reportTitle, reportClose);
  reportDialog.append(reportHeader, reportText);
  document.body.append(reportDialog);
  reportClose.onclick = () => reportDialog.close();
  const efficiencyStyle = document.createElement('style');
  efficiencyStyle.textContent =
    '.colab-efficiency{flex:0 1 auto;min-height:18px;max-height:22vh;overflow:auto;margin:5px 0;font:11px/1.6 Segoe UI,sans-serif;color:#9ab9c5}.colab-efficiency summary{cursor:pointer}.colab-efficiency table{width:100%;text-align:left;border-collapse:collapse}.colab-efficiency td,.colab-efficiency th{padding:3px 6px;border-bottom:1px solid #29414a}.colab-efficiency button{padding:3px 6px;font-size:10px}.colab-config .field textarea{width:100%;max-height:90px;background:#07141b;color:#c9dfe6;border:1px solid #35505a;border-radius:7px;padding:7px}.colab-config small{display:block;font-size:10px;line-height:1.5;color:#90adb8}.colab-config .toggle-row small{max-width:330px}.colab-efficiency+*{min-width:0}';
  document.head.append(efficiencyStyle);
  function renderEfficiency(chat) {
    const usage = chat.usage || {},
      stages = usage.stages || [];
    efficiencyView.hidden = !stages.length;
    efficiencyTitle.textContent =
      'Stage usage · ' +
      (usage.complete ? 'provider reported' : 'partial / estimated') +
      ' · ' +
      (chat.preset || 'balanced');
    efficiencyBody.replaceChildren();
    if (!stages.length) return;
    const note = document.createElement('p');
    note.textContent = usage.estimateScope || 'Estimates cover ATLAS text only, not tool calls or hidden context.';
    efficiencyBody.append(note);
    const table = document.createElement('table'),
      heading = document.createElement('tr');
    for (const name of ['Stage', 'Reported tokens', 'Text estimate for missing usage', 'Report']) {
      const cell = document.createElement('th');
      cell.textContent = name;
      heading.append(cell);
    }
    table.append(heading);
    for (const stage of stages) {
      const row = document.createElement('tr');
      for (const text of [
        stage.provider + ' · ' + stage.phase,
        (stage.inputTokens + stage.outputTokens).toLocaleString() + ' (' + stage.source + ')',
        stage.estimatedMissingTokens.toLocaleString(),
      ]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      const cell = document.createElement('td'),
        button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet-button';
      button.textContent = 'View';
      button.onclick = async () => {
        button.disabled = true;
        try {
          const report = await window.atlas.collabReport({
            id: chat.usageJobId || chat.lastJob?.id,
            index: stage.index,
          });
          reportTitle.textContent = report.provider + ' · ' + report.phase;
          reportText.textContent = report.output;
          reportDialog.showModal();
        } catch (error) {
          toast(error.message);
        } finally {
          button.disabled = false;
        }
      };
      cell.append(button);
      row.append(cell);
      table.append(row);
    }
    efficiencyBody.append(table);
    const size = document.createElement('p');
    size.textContent =
      usage.promptCharacters.toLocaleString() +
      ' ATLAS prompt characters sent; ' +
      usage.legacyPromptCharacters.toLocaleString() +
      ' with the former six-report replay (comparison of prompt text, not total model tokens).';
    efficiencyBody.append(size);
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'colab-chat-actions';
  toolbar.innerHTML =
    '<button class="quiet-button" id="colabRename" type="button">Rename</button><button class="quiet-button" id="colabPin" type="button">Pin</button><button class="quiet-button" id="colabExport" type="button">Export</button>';
  panel.querySelector('.colab-chat-header').append(toolbar);
  const recovery = document.createElement('div');
  recovery.className = 'colab-recovery';
  recovery.innerHTML =
    '<span id="colabUsage"></span><button class="quiet-button" id="colabResume" type="button" hidden>Resume saved stages</button><button class="quiet-button" id="colabReview" type="button" hidden>Review changes</button>';
  panel.querySelector('#colabForm').before(recovery);
  const runDetails = document.createElement('details');
  runDetails.className = 'colab-run-details';
  runDetails.innerHTML = '<summary>Run details</summary><div class="colab-run-details-body"></div>';
  panel.querySelector('#colabForm').before(runDetails);
  runDetails.lastElementChild.append(efficiencyView, recovery);
  // The dispute card waits on the user, so it sits above the message box instead of inside the collapsed Run details.
  const disputeBox = document.createElement('div');
  disputeBox.id = 'colabDispute';
  disputeBox.className = 'colab-dispute';
  disputeBox.setAttribute('role', 'group');
  disputeBox.setAttribute('aria-label', 'Disputed blockers');
  disputeBox.hidden = true;
  panel.querySelector('#colabForm').before(disputeBox);
  style.textContent +=
    '.colab-dispute{flex:0 0 auto;max-height:40vh;overflow:auto;border:1px solid #4a6a74;border-radius:8px;padding:8px;margin:6px 0;font-size:12px}.colab-dispute h4{margin:0 0 4px;font-size:12px}.colab-dispute section{margin:6px 0;padding-top:6px;border-top:1px solid #253c45}.colab-dispute p{margin:3px 0;color:#c9dfe6;overflow-wrap:anywhere}.colab-dispute-choices{display:flex;gap:6px;flex-wrap:wrap}.colab-dispute [aria-pressed=true]{outline:2px solid #6fd3c1}' +
    '.colab-chat-main>.colab-config:not([open]){margin:4px 0;padding-bottom:5px}.colab-chat-main>.colab-browse{padding:5px 0}.colab-run-details{flex:0 0 auto;font:11px/1.5 Segoe UI,sans-serif;color:#91adb7;margin:2px 0;min-height:18px}.colab-run-details>summary{cursor:pointer}.colab-run-details-body{max-height:24vh;overflow:auto;padding:6px 0}.colab-run-details .colab-recovery{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0}.colab-run-details .colab-recovery button{padding:4px 7px;font-size:10px}.colab-chat-main>.colab-composer{position:relative;padding:6px 0 0 35px;max-height:32vh;overflow:visible}.colab-composer .attachment-toolbar{position:absolute;left:0;top:10px}.colab-composer .attachment-project{display:none}.colab-composer textarea{height:40px;min-height:40px;max-height:140px;padding:8px 11px;font-size:12px;border-radius:9px}.colab-composer .colab-compose-footer{margin-top:4px;padding:0;position:static;gap:6px}.colab-compose-footer>button{padding:7px 12px;font-size:11px;min-height:32px}.colab-compose-footer [role=status]{font-size:10px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.colab-composer .attachment-toolbar{gap:6px;margin:0 0 4px}.colab-composer .attachment-add{width:28px;height:28px;min-height:28px;padding:0;font-size:20px;border-radius:8px}.colab-composer .attachment-project{font-size:10px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.colab-composer .attachment-error:empty{display:none}.colab-composer .attachment-chips:empty{display:none}.colab-composer .attachment-bar{margin:0}.colab-work{margin:6px 0 10px;padding:5px 9px}.colab-work-list{max-height:18vh}.colab-work-step{padding:4px 0}.colab-work-note{display:none}';

  const el = (id) => panel.querySelector('#' + id);
  // The textarea already has an accessible label; keep the visual surface uncluttered.
  panel.querySelector('.sr-only').hidden = true;
  const assistantButton = document.createElement('button'),
    colabButton = document.createElement('button'),
    divider = document.createElement('div');
  for (const [button, label, workspace] of [
    [assistantButton, 'Assistant', 'assistant'],
    [colabButton, 'Colab', 'colab'],
  ]) {
    button.type = 'button';
    button.className = 'nav-item';
    button.textContent = label;
    button.dataset.chatWorkspace = workspace;
    button.onclick = () => select(workspace);
  }
  divider.className = 'workspace-divider';
  divider.setAttribute('aria-hidden', 'true');
  workspaceNav.prepend(assistantButton, colabButton, divider);
  function select(workspace) {
    if (workspace === 'colab') {
      selectWorkspaceView('');
      cancelRecording();
      stopWakeListener();
      stopSpeaking();
    }
    if (workspace !== 'colab') wasVisible = false;
    document.body.dataset.workspace = workspace;
    document.querySelector('.core').hidden = workspace === 'colab';
    const assistant = document.querySelector('.assistant-workspace');
    if (assistant) assistant.hidden = workspace === 'colab';
    panel.hidden = workspace !== 'colab';
    $('#historyOpen').hidden = false;
    assistantButton.setAttribute('aria-current', workspace === 'assistant' ? 'page' : 'false');
    colabButton.setAttribute('aria-current', workspace === 'colab' ? 'page' : 'false');
    if (workspace === 'colab') {
      render();
      el('colabTask').focus();
    } else if (settings.wakeWordEnabled) void startWakeListener();
  }
  function save() {
    if (!historyReady || !historyWritable) return;
    void window.atlasColabHistory
      .save({ chats, selected })
      .then(() => {
        if (historyError) {
          historyError = '';
          render();
        }
      })
      .catch((error) => {
        historyError = 'History could not be saved. Export important chats before closing ATLAS. ' + error.message;
        el('colabStatus').textContent = historyError;
      });
  }
  function refreshModels() {
    const chat = current();
    renderEfficiency(chat);
    for (const [id, value] of [
      ['colabPreset', chat.preset || 'balanced'],
      ['colabMilestones', chat.milestones || 'auto'],
      ['colabTokenWarning', chat.tokenWarning ?? ''],
      ['colabCriteria', chat.brief?.criteria || ''],
      ['colabOutOfScope', chat.brief?.outOfScope || ''],
    ]) {
      el(id).value = value;
      el(id).disabled = chat.busy || !historyReady;
    }
    for (const [id, key] of [
      ['colabAdaptiveEffort', 'adaptiveEffort'],
      ['colabReuseChecks', 'reuseChecks'],
    ]) {
      el(id).checked = chat[key] === true;
      el(id).disabled = chat.busy || !historyReady;
    }
    for (const [id, value] of [
      ['colabMode', chat.mode || 'build'],
      ['colabRoles', chat.rolesExplicit === true ? chat.roles || 'codex-builds' : 'auto'],
      ['colabPasses', chat.maxRounds ?? ''],
    ]) {
      el(id).value = value;
      el(id).disabled = chat.busy || !historyReady;
    }
    el('colabEditingHint').textContent =
      chat.isolated === false
        ? 'Direct editing: changes are made in the selected project folder.'
        : 'Uncommitted changes prompt for direct editing before starting.';
    el('colabIsolated').checked = chat.isolated !== false;
    el('colabIsolated').disabled = chat.busy || !historyReady;

    for (const provider of ['codex', 'claude']) {
      const picker = el(provider === 'codex' ? 'colabCodexModel' : 'colabClaudeModel'),
        chosen = chat[provider + 'Model'] || '';
      const models = new Map(
        [
          ...catalog[provider],
          ...(settings[provider + 'Models'] || []).map((id) => ({ id, name: id })),
          ...(chosen ? [{ id: chosen, name: chosen }] : []),
        ].map((item) => [item.id, item]),
      );
      picker.replaceChildren(
        new Option('Use model selected in Settings', ''),
        ...[...models.values()].map((item) => new Option(item.name, item.id)),
      );
      picker.value = chosen;
      picker.disabled = chat.busy || !historyReady;
    }
    el('colabEffort').value = chat.effort || 'medium';
    el('colabEffort').disabled = chat.busy || !historyReady;
    el('colabFolder').textContent = chat.cwd || 'Choose a working folder';
    el('colabFolder').title = chat.cwd || '';
    el('colabChooseFolder').disabled = chat.busy || !historyReady;
  }
  function sizeComposer() {
    const input = el('colabTask'),
      limit = Math.max(40, Math.min(140, Math.floor(window.innerHeight * 0.24)));
    input.style.height = 'auto';
    input.style.height = Math.max(40, Math.min(limit, input.scrollHeight)) + 'px';
    input.style.overflowY = input.scrollHeight > limit ? 'auto' : 'hidden';
  }
  window.addEventListener('resize', sizeComposer);
  function rememberGraph(chat, job) {
    if (!job.graph) return false;
    chat.graphRuns ||= [];
    const id = job.graphRunId || job.id,
      previous = chat.graphRuns.find((run) => run.id === id);
    if (previous) {
      if (job.graph.revision && previous.graph.revision === job.graph.revision) return false;
      previous.graph = job.graph;
    } else chat.graphRuns.push({ id, startedAt: job.startedAt || Date.now(), graph: job.graph });
    chat.graphRuns = chat.graphRuns.slice(-20);
    return true;
  }
  function captureActivity(chat, job) {
    rememberGraph(chat, job);
    chat.activityRuns ||= [];
    let run = chat.activityRuns.find((run) => run.id === job.id);
    if (!run) {
      run = { id: job.id, status: job.status, expanded: job.status === 'running', events: [] };
      chat.activityRuns.push(run);
    }
    if (run.status === 'running' && job.status !== 'running') run.expanded = false;
    run.status = job.status;
    if (Array.isArray(job.events)) {
      const steps = new Map();
      for (const event of job.events.slice(-100)) {
        const text = String(event.text || '').slice(0, 800);
        if (!text) continue;
        const key = event.id ? event.provider + ':' + event.id : event.kind + ':' + text;
        steps.set(key, {
          kind: String(event.kind || 'activity'),
          text,
          provider: event.provider || '',
          status: event.status || '',
          id: event.id || key,
          at: Number(event.at) || job.startedAt || 0,
          ...(Number.isInteger(event.exitCode) ? { exitCode: event.exitCode } : {}),
        });
      }
      run.events = [...steps.values()].slice(-60);
    }
    chat.activityRuns = chat.activityRuns.slice(-6);
  }
  function activityView(run) {
    const details = document.createElement('details');
    details.className = 'colab-work';
    details.dataset.jobId = run.id;
    details.open = run.expanded === true;
    const summary = document.createElement('summary'),
      list = document.createElement('div'),
      note = document.createElement('p');
    summary.textContent =
      (run.status === 'running'
        ? 'Working'
        : run.status === 'completed'
          ? 'Work completed'
          : run.status === 'paused'
            ? 'Work paused'
            : ['needs_attention', 'limit_reached'].includes(run.status)
              ? 'Work needs attention'
              : run.status === 'failed'
                ? 'Work interrupted'
                : 'Work stopped') +
      ' · ' +
      run.events.length +
      ' reported steps';
    list.className = 'colab-work-list';
    list.setAttribute('aria-label', 'Reported task activity');
    for (const event of run.events) {
      const row = document.createElement('div'),
        label = document.createElement('div'),
        text = document.createElement('pre');
      row.className = 'colab-work-step';
      row.dataset.status = event.status;
      label.textContent = [
        event.provider?.toUpperCase(),
        event.kind === 'command'
          ? 'Command'
          : event.kind === 'files'
            ? 'Files'
            : event.kind === 'plan'
              ? 'Plan'
              : 'Progress',
        event.status,
        event.exitCode !== undefined ? 'exit ' + event.exitCode : '',
      ]
        .filter(Boolean)
        .join(' · ');
      text.textContent = event.text;
      if (event.kind === 'command') {
        const command = document.createElement('details'),
          heading = document.createElement('summary');
        command.className = 'task-command';
        command.open = (run.openCommands || []).includes(event.id);
        heading.textContent = [
          event.status === 'running' ? 'Running command' : event.status === 'failed' ? 'Command failed' : 'Ran command',
          event.provider?.toUpperCase(),
          event.exitCode !== undefined ? 'exit ' + event.exitCode : '',
        ]
          .filter(Boolean)
          .join(' · ');
        command.append(heading, text);
        row.append(command);
        command.addEventListener('toggle', () => {
          if (command.isConnected) {
            const opened = new Set(run.openCommands || []);
            command.open ? opened.add(event.id) : opened.delete(event.id);
            run.openCommands = [...opened];
          }
        });
      } else if (event.kind === 'progress') {
        row.classList.add('task-progress');
        row.append(text);
      } else row.append(label, text);
      list.append(row);
    }
    note.className = 'colab-work-note';
    note.textContent = 'Recent provider-reported actions and progress summaries.';
    details.append(summary, list, note);
    details.addEventListener('toggle', () => {
      if (details.isConnected) {
        run.expanded = details.open;
        save();
      }
    });
    return details;
  }
  const messageNodes = new Map(),
    activityNodes = new Map(),
    sidebarNodes = new Map(),
    searchText = new Map();
  const { memo, reconcile: reconcileNodes } = window.atlasChatRender;
  function render() {
    const chat = current(),
      list = el('colabChats'),
      transcript = el('colabTranscript');
    const sidebarTop = list.scrollTop,
      sidebar = [];
    const projects = new Map(
      chats
        .filter((item) => item.cwd)
        .map((item) => [
          projectKey(item.cwd),
          item.projectName ||
            String(item.cwd || '')
              .split(/[\\/]/)
              .filter(Boolean)
              .at(-1) ||
            item.cwd,
        ]),
    );
    projectPicker.replaceChildren(
      new Option('All projects', ''),
      ...Array.from(projects, ([key, label]) => new Option(label + ' · ' + key, key)),
    );
    if (projectFilter && !projects.has(projectFilter)) projectFilter = '';
    projectPicker.value = projectFilter;
    const query = el('colabSearch').value.toLowerCase();
    for (const item of [...chats]
      .reverse()
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .filter(
        (chat) =>
          (!projectFilter || projectKey(chat.cwd) === projectFilter) &&
          (!query ||
            memo(searchText, chat.id, [chat.title, ...chat.messages.map((m) => m.content)], () =>
              (chat.title + ' ' + chat.messages.map((m) => m.content).join(' ')).toLowerCase(),
            ).includes(query)),
      )) {
      sidebar.push(
        memo(
          sidebarNodes,
          item.id,
          [
            item.title,
            item.pinned,
            item.busy,
            item.messages.length,
            item.projectName,
            item.cwd,
            selected,
            historyReady,
          ],
          () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'colab-chat-item';
            button.setAttribute('aria-current', String(item.id === selected));
            const title = document.createElement('span'),
              detail = document.createElement('small');
            title.textContent = (item.pinned ? '★ ' : '') + item.title;
            detail.textContent =
              (item.busy ? 'Working…' : item.messages.length + ' messages') +
              ' · ' +
              (item.projectName ||
                String(item.cwd || '')
                  .split(/[\\/]/)
                  .filter(Boolean)
                  .at(-1) ||
                'No project');
            button.title = item.cwd || 'No project';
            button.append(title, detail);
            button.disabled = !historyReady;
            button.onclick = () => {
              selected = item.id;
              save();
              render();
            };
            return button;
          },
        ),
      );
    }
    reconcileNodes(list, sidebar);
    list.scrollTop = sidebarTop;
    const alive = new Set(chats.map((chat) => chat.id));
    for (const key of sidebarNodes.keys())
      if (!alive.has(key)) {
        sidebarNodes.delete(key);
        searchText.delete(key);
      }
    if (renderedChat && wasVisible && !panel.hidden)
      scrollPositions.set(renderedChat, {
        top: transcript.scrollTop,
        atBottom: transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 60,
      });
    const switched = renderedChat !== chat.id,
      priorScroll = scrollPositions.get(chat.id);
    renderedChat = chat.id;
    wasVisible = !panel.hidden;
    if (switched) {
      messageNodes.clear();
      activityNodes.clear();
    }
    const atBottom = forceLatest.delete(chat.id) || !priorScroll || priorScroll.atBottom;
    if (switched) {
      el('colabFind').value = '';
      matchIndex = 0;
    }
    panel.querySelector('.colab-chat-header h1').textContent = chat.title || 'Colab';
    panel.querySelector('.colab-chat-header h1').title = chat.title || 'Colab';
    panel.querySelector('.colab-chat-header p').textContent =
      'Codex + Claude · ' + (chat.projectName || chat.cwd || 'Choose a project');
    const activityScroll = new Map(
      [...transcript.querySelectorAll('.colab-work')].map((details) => {
        const list = details.querySelector('.colab-work-list');
        return [
          details.dataset.jobId,
          { top: list.scrollTop, atBottom: list.scrollHeight - list.scrollTop - list.clientHeight < 30 },
        ];
      }),
    );
    const transcriptNodes = [],
      place = (node) => transcriptNodes.push(node),
      activity = (run) =>
        memo(
          activityNodes,
          run.id,
          [run, run.status, run.expanded, JSON.stringify(run.events), JSON.stringify(run.openCommands || [])],
          () => activityView(run),
        );
    if (!chat.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'colab-empty';
      const title = document.createElement('strong');
      title.textContent = 'Two perspectives. One conversation.';
      empty.append(
        title,
        document.createTextNode(
          'Describe your task. Codex works, Claude reviews, and you receive their final summary here.',
        ),
      );
      place(empty);
    }
    const shownRuns = new Set();
    for (const [messageIndex, message] of chat.messages.entries()) {
      const run = message.role === 'assistant' && (chat.activityRuns || []).find((run) => run.id === message.jobId);
      if (run && !shownRuns.has(run.id)) {
        place(activity(run));
        shownRuns.add(run.id);
      }
      const cachedArticle = memo(
        messageNodes,
        (message.id || 'legacy') + ':' + messageIndex,
        [
          message.role,
          message.error,
          message.provider,
          message.content,
          message.at,
          JSON.stringify(message.attachments || []),
          JSON.stringify(message.verification || null),
          (comparisons.get(chat.id) || []).includes(message.id),
        ],
        () => {
          const article = document.createElement('article');
          article.dataset.messageId = message.id || '';
          article.className =
            'colab-message ' + (message.error ? 'error' : message.role === 'user' ? 'user' : 'assistant');
          const label = document.createElement('strong'),
            content = document.createElement('p');
          label.textContent =
            message.role === 'user'
              ? 'You'
              : message.error
                ? 'Could not complete this task'
                : message.provider
                  ? message.provider.toUpperCase() + ' · Imported'
                  : 'Colab · Codex + Claude';
          content.textContent = message.content;
          if (message.at && Number.isFinite(new Date(message.at).getTime())) {
            const time = document.createElement('time');
            time.dateTime = new Date(message.at).toISOString();
            time.textContent = new Date(message.at).toLocaleString();
            label.append(time);
          }
          // What ATLAS itself verified; reviewer acceptance alone shows as Unverified.
          if (message.role === 'assistant' && message.verification?.label) {
            const badge = document.createElement('span');
            badge.className = 'verify-badge';
            badge.dataset.level = String(message.verification.level || '');
            badge.textContent = message.verification.label;
            badge.title = message.verification.reason || '';
            badge.tabIndex = 0;
            badge.setAttribute('aria-label', message.verification.label + '. ' + (message.verification.reason || ''));
            label.append(badge);
          }
          article.append(label, content);
          if (message.role === 'assistant' && !message.error) {
            const actions = document.createElement('div'),
              copy = document.createElement('button'),
              compare = document.createElement('button');
            actions.className = 'colab-message-actions';
            copy.type = compare.type = 'button';
            copy.className = compare.className = 'quiet-button';
            copy.textContent = 'Copy result';
            copy.onclick = () =>
              void navigator.clipboard.writeText(message.content).catch((error) => toast(error.message));
            const chosen = comparisons.get(chat.id) || [];
            compare.textContent = chosen.includes(message.id) ? 'Selected for comparison' : 'Compare';
            compare.setAttribute('aria-pressed', String(chosen.includes(message.id)));
            compare.onclick = () => {
              const values = comparisons.get(chat.id) || [];
              comparisons.set(
                chat.id,
                values.includes(message.id)
                  ? values.filter((id) => id !== message.id)
                  : [...values.slice(-1), message.id],
              );
              render();
            };
            actions.append(copy, compare);
            article.append(actions);
          }
          window.atlasWorkspace?.messageAttachments(article, message.attachments);
          return article;
        },
      );
      place(cachedArticle);
    }
    for (const run of chat.activityRuns || []) if (!shownRuns.has(run.id)) place(activity(run));
    reconcileNodes(transcript, transcriptNodes);
    const liveMessages = new Set(chat.messages.map((message, i) => (message.id || 'legacy') + ':' + i)),
      liveRuns = new Set((chat.activityRuns || []).map((run) => run.id));
    for (const key of messageNodes.keys()) if (!liveMessages.has(key)) messageNodes.delete(key);
    for (const key of activityNodes.keys()) if (!liveRuns.has(key)) activityNodes.delete(key);
    for (const details of transcript.querySelectorAll('.colab-work')) {
      const list = details.querySelector('.colab-work-list'),
        prior = activityScroll.get(details.dataset.jobId);
      list.scrollTop = !prior || prior.atBottom ? list.scrollHeight : prior.top;
    }
    if (atBottom) transcript.scrollTop = transcript.scrollHeight;
    else transcript.scrollTop = priorScroll.top;
    refreshFind();
    refreshBrowse();
    if (el('colabTask').value !== (chat.draft || '')) el('colabTask').value = chat.draft || '';
    sizeComposer();
    el('colabStart').disabled = !historyReady || chat.busy || chat.preparing;
    el('colabNewChat').disabled = !historyReady;
    el('colabTask').disabled = !historyReady;
    el('colabStop').hidden = !chat.busy;
    el('colabStop').disabled = !chat.jobId;
    el('colabStatus').textContent =
      historyError ||
      (!historyReady ? 'Loading saved Colab history…' : chat.status) ||
      'Only the final summary appears when both models finish.';
    el('colabPin').textContent = chat.pinned ? 'Unpin' : 'Pin';
    const job = chat.lastJob;
    el('colabResume').hidden = chat.busy || !job?.canResume || Boolean(job?.dispute);
    renderDispute(chat);
    el('colabReview').hidden = chat.busy || !chat.workspaceId;
    const usage = chat.usage;
    el('colabUsage').textContent =
      (job?.budget
        ? 'Runtime ' + Math.round(job.budget.usedMs / 1000) + 's · ' + (job.checkpointCount || 0) + ' saved passes. '
        : '') +
      (usage?.reported
        ? usage.inputTokens +
          ' reported input / ' +
          usage.outputTokens +
          ' reported output' +
          (usage.complete === false ? ' (partial)' : '') +
          ' tokens. '
        : 'Usage not reported yet.') +
      (usage?.costReported ? ' CLI/provider cost estimate USD ' + usage.reportedCostUsd.toFixed(4) + '.' : '');
    refreshModels();
    window.dispatchEvent(new Event('atlas-colab-chat-change'));
  }
  function refreshBrowse() {
    const transcript = el('colabTranscript');
    el('colabLatest').hidden = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 60;
    const chosen = comparisons.get(selected) || [];
    el('colabCompare').textContent = 'Compare results (' + chosen.length + '/2)';
    el('colabCompare').disabled = chosen.length !== 2;
  }
  function refreshFind() {
    const query = el('colabFind').value.trim().toLowerCase();
    matches = [];
    for (const node of el('colabTranscript').querySelectorAll('.colab-message')) {
      const match = Boolean(query && node.querySelector('p').textContent.toLowerCase().includes(query));
      node.dataset.match = String(match);
      if (match) matches.push(node);
    }
    matchIndex = Math.min(matchIndex, Math.max(0, matches.length - 1));
    el('colabMatches').textContent = query
      ? matches.length
        ? matchIndex + 1 + ' / ' + matches.length
        : 'No matches'
      : '';
    el('colabPreviousMatch').disabled = el('colabNextMatch').disabled = !matches.length;
  }
  function showMatch() {
    if (!matches.length) return;
    const transcript = el('colabTranscript');
    transcript.scrollTop +=
      matches[matchIndex].getBoundingClientRect().top - transcript.getBoundingClientRect().top - 12;
    el('colabMatches').textContent = matchIndex + 1 + ' / ' + matches.length;
    refreshBrowse();
  }
  el('colabFind').oninput = () => {
    matchIndex = 0;
    refreshFind();
    showMatch();
  };
  el('colabPreviousMatch').onclick = () => {
    matchIndex = (matchIndex - 1 + matches.length) % matches.length;
    showMatch();
  };
  el('colabNextMatch').onclick = () => {
    matchIndex = (matchIndex + 1) % matches.length;
    showMatch();
  };
  el('colabTranscript').addEventListener('scroll', () => {
    const transcript = el('colabTranscript');
    if (renderedChat && !panel.hidden)
      scrollPositions.set(renderedChat, {
        top: transcript.scrollTop,
        atBottom: transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 60,
      });
    refreshBrowse();
  });
  el('colabLatest').onclick = () => {
    el('colabTranscript').scrollTop = el('colabTranscript').scrollHeight;
    refreshBrowse();
  };
  el('colabCompare').onclick = () => {
    const chosen = comparisons.get(selected) || [],
      grid = compareDialog.querySelector('.colab-compare-grid');
    grid.replaceChildren();
    for (const message of current().messages.filter((message) => chosen.includes(message.id))) {
      const section = document.createElement('section'),
        title = document.createElement('h3'),
        content = document.createElement('pre');
      title.textContent = message.at ? new Date(message.at).toLocaleString() : 'Earlier result';
      content.textContent = message.content;
      section.append(title, content);
      grid.append(section);
    }
    compareDialog.showModal();
  };
  el('colabNewChat').onclick = () => {
    if (!historyReady) return;
    makeChat();
    save();
    render();
    el('colabConfig').open = true;
    el('colabTask').focus();
  };
  el('colabTask').oninput = () => {
    current().draft = el('colabTask').value;
    sizeComposer();
    save();
  };
  el('colabTask').onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!current().busy) el('colabForm').requestSubmit();
    }
  };
  for (const [id, key] of [
    ['colabCodexModel', 'codexModel'],
    ['colabClaudeModel', 'claudeModel'],
    ['colabEffort', 'effort'],
  ])
    el(id).onchange = () => {
      current()[key] = el(id).value;
      save();
    };
  el('colabChooseFolder').onclick = async () => {
    const chat = current();
    try {
      const folder = await window.atlas.pickFolder();
      if (folder && !chat.busy) {
        let target = chat;
        if (chat.messages.length && projectKey(chat.cwd) !== projectKey(folder)) target = makeChat();
        target.cwd = folder;
        target.profileId = '';
        target.projectName = '';
        projectFilter = projectKey(folder);
        save();
        render();
      }
    } catch (error) {
      chat.status = error.message;
      render();
    }
  };
  el('colabForm').onsubmit = async (event) => {
    event.preventDefault();
    const chat = current(),
      task = el('colabTask').value.trim();
    if (!historyReady || chat.busy || chat.preparing || !task) return;
    if (!chat.cwd) {
      chat.status = 'Choose a working folder before sending.';
      el('colabConfig').open = true;
      render();
      return;
    }
    if (chat.isolated !== false && !['plan', 'compare'].includes(chat.mode)) {
      chat.preparing = true;
      render();
      try {
        const prepared = await window.atlas.prepareProject(chat.cwd, {
          workspaceId: chat.workspaceId,
          chatId: chat.id,
        });
        if (!prepared.ready) {
          chat.status =
            'Nothing started. Commit or stash your changes to use isolation, or send again and choose direct editing.';
          return;
        }
        if (prepared.isolated === false) {
          chat.isolated = false;
          save();
        }
      } catch (error) {
        chat.status = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
        el('colabConfig').open = true;
        return;
      } finally {
        chat.preparing = false;
        render();
      }
    }
    const context = window.atlasEfficiency.selectHistory(
      task,
      chat.messages.filter((message) => !message.error),
      chat.preset,
    ).turns;
    const attached = window.atlasWorkspace?.takeAttachments('colab', chat.id) || { request: {}, files: [] };
    forceLatest.add(chat.id);
    chat.updatedAt = Date.now();
    chat.messages.push({
      id: crypto.randomUUID(),
      at: Date.now(),
      role: 'user',
      content: task,
      attachments: attached.files,
    });
    chat.draft = '';
    if (!chat.customTitle) chat.title = chat.messages.find((message) => message.role === 'user').content.slice(0, 60);
    chat.busy = true;
    chat.jobId = '';
    chat.status = 'Starting collaboration…';
    save();
    render();
    try {
      const result = await window.atlas.collaborate({
        task,
        context,
        workspaceId: chat.isolated !== false ? chat.workspaceId || '' : '',
        preset: chat.preset || 'balanced',
        milestones: chat.milestones || 'auto',
        rolesExplicit: chat.rolesExplicit === true,
        adaptiveEffort: chat.adaptiveEffort === true,
        reuseChecks: chat.reuseChecks === true,
        tokenWarning: chat.tokenWarning ?? null,
        brief: chat.brief || {},
        chatId: chat.id,
        cwd: chat.cwd,
        codexModel: chat.codexModel,
        claudeModel: chat.claudeModel,
        effort: chat.effort,
        mode: chat.mode || 'build',
        roles: chat.roles || 'codex-builds',
        isolated: chat.isolated !== false,
        maxRounds: chat.maxRounds ?? null,
        ...attached.request,
        profileId: chat.profileId,
      });
      chat.jobId = result.id;
      save();
      render();
    } catch (error) {
      chat.busy = false;
      chat.status = 'Task failed. You can retry or send a follow-up.';
      chat.messages.push({
        id: crypto.randomUUID(),
        at: Date.now(),
        role: 'assistant',
        error: true,
        content: error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''),
      });
      save();
      render();
    }
  };
  el('colabStop').onclick = async () => {
    const chat = current();
    if (!chat.jobId) return;
    try {
      await window.atlas.jobs({ action: 'stop', id: chat.jobId });
      chat.status = 'Stopping collaboration…';
      render();
    } catch (error) {
      chat.status = error.message;
      render();
    }
  };
  function update(value) {
    if (!historyReady) {
      pendingUpdates.push(value);
      return;
    }
    const chat = chats.find((chat) => chat.id === value.chatId || chat.jobId === value.id);
    if (!chat) return;
    if (value.graph) {
      const changed = rememberGraph(chat, {
        id: value.id,
        graphRunId: value.graphRunId,
        graph: value.graph,
        startedAt: value.startedAt || Date.now(),
      });
      if (value.status === undefined && value.result === undefined && !value.error) {
        if (changed) {
          save();
          window.dispatchEvent(new Event('atlas-colab-chat-change'));
        }
        return;
      }
    }
    if (chat.finishedJob === value.id || chat.finishedJobs?.includes(value.id)) return;
    chat.jobId = value.id;
    chat.status = value.limitation || value.status || 'Working…';
    if (value.workspaceId) chat.workspaceId = value.workspaceId;
    if (value.usage) {
      chat.usage = value.usage;
      chat.usageJobId = value.id;
    }
    if (typeof value.result === 'string' || value.error) {
      chat.busy = false;
      chat.status =
        value.limitation ||
        (value.error
          ? 'Task failed. You can retry or send a follow-up.'
          : 'Task complete. Compare results or send a follow-up.');
      chat.finishedJob = value.id;
      chat.finishedJobs = [...(chat.finishedJobs || []), value.id].slice(-100);
      const run = (chat.activityRuns || []).find((run) => run.id === value.id);
      if (run) {
        run.status = value.outcome || (value.error ? 'failed' : 'completed');
        run.expanded = false;
      }
      chat.updatedAt = Date.now();
      chat.messages.push({
        id: crypto.randomUUID(),
        at: Date.now(),
        role: 'assistant',
        jobId: value.id,
        content: String(value.result || value.error),
        ...(value.error ? { error: true } : {}),
        ...(value.verification?.level ? { verification: value.verification } : {}),
      });
    } else chat.busy = true;
    save();
    render();
  }
  function reconcile(jobs) {
    if (!historyReady) {
      for (const job of jobs) pendingJobs.set(job.id, job);
      return;
    }
    for (const job of [...jobs].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))) {
      const chat = chats.find((chat) => job.collaboration && chat.id === job.colabChatId);
      if (!chat || (chat.lastJob?.startedAt || 0) > (job.startedAt || 0)) continue;
      captureActivity(chat, job);
      chat.lastJob = {
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        budget: job.budget,
        checkpointCount: job.checkpoints?.length || 0,
        canResume: Boolean(
          job.request && ['paused', 'failed', 'cancelled', 'needs_attention', 'limit_reached'].includes(job.status),
        ),
        dispute: job.status === 'needs_attention' ? job.result?.dispute || null : null,
      };
      if (job.workspaceId) chat.workspaceId = job.workspaceId;
      if (job.result?.usage) {
        chat.usage = job.result.usage;
        chat.usageJobId = job.id;
      } else if (job.checkpoints?.length) {
        chat.usage = window.atlasEfficiency.usageSummary(job.checkpoints);
        chat.usageJobId = job.id;
      }
    }

    for (const job of jobs.filter(
      (job) =>
        job.collaboration &&
        !chats.some((chat) => chat.id === job.colabChatId && (chat.lastJob?.startedAt || 0) > (job.startedAt || 0)),
    ))
      update({
        id: job.id,
        chatId: job.colabChatId,
        status: job.statusText,
        ...(job.result && ['completed', 'needs_attention', 'limit_reached'].includes(job.status)
          ? {
              result: job.result.output || 'Both providers finished.',
              outcome: job.result.outcome,
              limitation: job.result.limitation,
            }
          : job.status !== 'running'
            ? { error: job.error || 'Collaboration stopped. Send a follow-up to continue.' }
            : {}),
      });
    save();
    render();
  }
  window.atlas.onCollaborationStatus(update);
  window.atlas.onJobs((patch) => reconcile(patch.upsert || []));
  const ready = window.atlasColabHistory
    .load({ chats, selected })
    .then((saved) => {
      historyWritable = true;
      if (saved.chats.length) {
        chats = saved.chats;
        selected = chats.some((chat) => chat.id === saved.selected) ? saved.selected : chats.at(-1).id;
      }
    })
    .catch((error) => {
      historyError = 'Saved history could not be opened. The existing local backup was kept. ' + error.message;
    })
    .then(async () => {
      for (const chat of chats) {
        chat.rolesExplicit ??= Boolean(chat.roles && chat.roles !== 'codex-builds');
        if (chat.passLimitVersion !== 2) {
          chat.maxRounds = null;
          chat.passLimitVersion = 2;
        }
        for (const message of chat.messages) {
          message.id ||= crypto.randomUUID();
        }
        chat.createdAt ||= chat.messages[0]?.at || chat.lastJob?.startedAt || Date.now();
        chat.updatedAt ||= chat.lastJob?.startedAt || chat.createdAt;
      }
      historyReady = true;
      render();
      try {
        const jobs = await window.atlas.jobs();
        reconcile([...pendingJobs.values(), ...jobs]);
        for (const value of pendingUpdates) update(value);
        for (const chat of chats)
          if (chat.busy && !jobs.some((job) => job.id === chat.jobId && job.status === 'running')) {
            chat.busy = false;
            chat.status = 'Previous run is no longer active. Send a follow-up to continue.';
          }
        for (const chat of chats)
          for (const run of chat.graphRuns || [])
            if (
              ['working', 'preparing'].includes(run.graph.outcome) &&
              !jobs.some((job) => (job.graphRunId || job.id) === run.id && job.status === 'running')
            )
              run.graph = window.atlasColabGraph.terminal(run.graph, 'paused');
        save();
        render();
      } catch {
        for (const chat of chats) chat.busy = false;
        render();
      }
      pendingJobs.clear();
      pendingUpdates.length = 0;
    });
  for (const [id, key] of [
    ['colabMode', 'mode'],
    ['colabRoles', 'roles'],
    ['colabPasses', 'maxRounds'],
  ])
    el(id).onchange = () => {
      current()[key] =
        key === 'mode' || key === 'roles' ? el(id).value : el(id).value === '' ? null : Number(el(id).value);
      if (key === 'roles') {
        current().rolesExplicit = el(id).value !== 'auto';
        if (el(id).value === 'auto') current().roles = 'codex-builds';
      }
      save();
    };
  el('colabIsolated').onchange = () => {
    current().isolated = el('colabIsolated').checked;
    save();
    render();
  };
  for (const [id, key] of [
    ['colabPreset', 'preset'],
    ['colabMilestones', 'milestones'],
    ['colabTokenWarning', 'tokenWarning'],
    ['colabAdaptiveEffort', 'adaptiveEffort'],
    ['colabReuseChecks', 'reuseChecks'],
  ])
    el(id).onchange = () => {
      current()[key] =
        el(id).type === 'checkbox'
          ? el(id).checked
          : key === 'tokenWarning'
            ? el(id).value === ''
              ? null
              : Number(el(id).value)
            : el(id).value;
      save();
    };
  for (const [id, key] of [
    ['colabCriteria', 'criteria'],
    ['colabOutOfScope', 'outOfScope'],
  ])
    el(id).oninput = () => {
      current().brief ||= {};
      current().brief[key] = el(id).value;
      save();
    };
  el('colabRename').onclick = () => window.atlasWorkspace?.renameColab();
  el('colabPin').onclick = () => {
    current().pinned = !current().pinned;
    save();
    render();
  };
  el('colabExport').onclick = () =>
    void window.atlas
      .exportChat({
        title: current().title,
        markdown:
          '# ' +
          current().title +
          '\n\n' +
          current()
            .messages.map((m) => '## ' + (m.role === 'user' ? 'You' : 'Colab') + '\n\n' + m.content)
            .join('\n\n'),
      })
      .catch((error) => toast(error.message));
  el('colabResume').onclick = () => resumeRun();
  async function resumeRun(extra = {}) {
    const chat = current();
    if (!chat.lastJob?.canResume) return;
    try {
      if (!chat.workspaceId && chat.isolated !== false && !['plan', 'compare'].includes(chat.mode)) {
        const prepared = await window.atlas.prepareProject(chat.cwd);
        if (!prepared.ready) {
          chat.status = 'Nothing resumed. Commit or stash your changes, or retry and choose direct editing.';
          render();
          return;
        }
        if (prepared.isolated === false) {
          chat.isolated = false;
          save();
          render();
        }
      }
    } catch (error) {
      chat.status = error.message;
      render();
      return;
    }
    chat.busy = true;
    chat.status = 'Resuming from saved provider stages…';
    save();
    render();
    try {
      const result = await window.atlas.collaborate({
        resumeJobId: chat.lastJob.id,
        isolated: chat.isolated !== false,
        tokenWarning: chat.tokenWarning ?? null,
        maxRounds: chat.maxRounds ?? null,
        ...extra,
      });
      chat.jobId = result.id;
      save();
      render();
    } catch (error) {
      chat.busy = false;
      chat.status = error.message;
      save();
      render();
    }
  }
  // A paused builder–reviewer disagreement: show both sides and resume with the user's ruling.
  const disputeRulings = new Map();
  function renderDispute(chat) {
    const box = el('colabDispute'),
      dispute = !chat.busy && chat.lastJob?.canResume ? chat.lastJob.dispute : null;
    box.hidden = !dispute;
    box.replaceChildren();
    if (!dispute) return;
    const name = (provider) => (provider === 'claude' ? 'Claude' : 'Codex'),
      key = chat.lastJob.id;
    if (disputeRulings.get('job') !== key) {
      disputeRulings.clear();
      disputeRulings.set('job', key);
    }
    const heading = document.createElement('h4');
    heading.textContent =
      name(dispute.builder) + ' and ' + name(dispute.reviewer) + ' disagree. Choose who is right to continue.';
    box.append(heading);
    for (const issue of dispute.issues) {
      const card = document.createElement('section'),
        title = document.createElement('strong'),
        builderSide = document.createElement('p'),
        reviewerSide = document.createElement('p'),
        choices = document.createElement('div');
      title.textContent = issue.id + ': ' + issue.summary;
      builderSide.textContent = name(dispute.builder) + ' (builder): ' + issue.builderReason;
      reviewerSide.textContent = name(dispute.reviewer) + ' (reviewer): ' + issue.reviewerEvidence;
      choices.className = 'colab-dispute-choices';
      for (const [side, label] of [
        ['builder', name(dispute.builder) + ' is right'],
        ['reviewer', name(dispute.reviewer) + ' is right'],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiet-button';
        button.textContent = label;
        button.setAttribute('aria-pressed', String(disputeRulings.get(issue.id) === side));
        button.onclick = () => {
          disputeRulings.set(issue.id, side);
          renderDispute(current());
        };
        choices.append(button);
      }
      card.append(title, builderSide, reviewerSide, choices);
      box.append(card);
    }
    const proceed = document.createElement('button');
    proceed.type = 'button';
    proceed.textContent = 'Continue with these rulings';
    proceed.disabled = !dispute.issues.every((issue) => disputeRulings.has(issue.id));
    proceed.onclick = () =>
      resumeRun({
        rulings: Object.fromEntries(dispute.issues.map((issue) => [issue.id, disputeRulings.get(issue.id)])),
      });
    box.append(proceed);
  }
  el('colabReview').onclick = () => window.atlasWorkspace?.review(current().workspaceId);
  let importQueue = Promise.resolve();
  function importChats(items) {
    const operation = importQueue.then(async () => {
      await ready;
      if (!historyWritable) throw Error('Colab history is unavailable. Retry after reopening ATLAS.');
      if (!Array.isArray(items) || !items.length || items.length > 100)
        throw Error('Select between 1 and 100 conversations.');
      const sourceKey = (chat) => chat.provider + ':' + (chat.sessionId || chat.id),
        existing = new Map(
          chats.filter((chat) => chat.importSource).map((chat) => [sourceKey(chat.importSource), chat]),
        );
      const added = [],
        results = [];
      let skipped = 0;
      for (const item of items) {
        if (!['codex', 'claude'].includes(item.provider) || !Array.isArray(item.turns) || !item.turns.length)
          throw Error('This conversation has no importable messages.');
        const key = sourceKey(item);
        if (existing.has(key)) {
          skipped++;
          results.push(existing.get(key));
          continue;
        }
        const chat = {
          id: crypto.randomUUID(),
          title: item.title || 'Imported chat',
          customTitle: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectName: item.workspaceName || '',
          cwd: item.cwd || '',
          draft: '',
          mode: 'build',
          roles: 'codex-builds',
          isolated: true,
          maxRounds: null,
          passLimitVersion: 2,
          profileId: '',
          effort: defaults.effort || 'medium',
          codexModel: defaults.colabCodexModel || '',
          claudeModel: defaults.colabClaudeModel || '',
          busy: false,
          status: '',
          importSource: {
            provider: item.provider,
            id: item.id,
            sessionId: item.sessionId || '',
            importedAt: Date.now(),
            originalTurnCount: item.originalTurnCount || item.turns.length,
          },
          messages: item.turns.map((turn) => ({
            id: crypto.randomUUID(),
            role: turn.role,
            content: turn.content,
            at: turn.at || item.updatedAt || Date.now(),
            provider: turn.role === 'assistant' ? item.provider : '',
          })),
        };
        existing.set(key, chat);
        added.push(chat);
        results.push(chat);
      }
      // Persist first so a failed import never appears as a successfully saved chat.
      await window.atlasColabHistory.insert(added);
      chats.push(...added);
      render();
      return {
        imported: added.length,
        skipped,
        chats: results.map((chat) => ({
          id: chat.id,
          title: chat.title,
          provider: 'colab',
          turnCount: chat.messages.length,
        })),
      };
    });
    importQueue = operation.catch(() => {});
    return operation;
  }
  window.atlasColab = {
    ready,
    importChats,
    captureActivity,
    activityView,
    refreshMessages: render,
    setCatalog: (value) => {
      for (const provider of ['codex', 'claude'])
        if (value[provider]?.models?.length) catalog[provider] = value[provider].models;
      refreshModels();
    },
    refreshModels,
    selectAssistant: () => select('assistant'),
    current: () => structuredClone(current()),
    graphHistory: () => ({ chatId: current().id, runs: current().graphRuns || [] }),
    history: () =>
      chats.map((chat) => ({
        provider: 'colab',
        id: chat.id,
        title: chat.title,
        pinned: chat.pinned,
        cwd: chat.cwd,
        turns: chat.messages,
        updatedAt: chat.updatedAt || chat.lastJob?.startedAt || chat.createdAt || 0,
      })),
    selectChat: (id) => {
      if (!historyReady) {
        void ready.then(() => window.atlasColab.selectChat(id));
        return;
      }
      const chat = chats.find((chat) => chat.id === id);
      if (!chat) return;
      if (projectFilter && projectFilter !== projectKey(chat.cwd)) projectFilter = projectKey(chat.cwd);
      selected = id;
      save();
      select('colab');
    },
    metadata: (id, value) => {
      const chat = chats.find((chat) => chat.id === id);
      if (chat) {
        Object.assign(chat, value);
        chat.customTitle = true;
        save();
        render();
      }
    },
    applyProfile: (profile) => {
      if (!historyReady) throw Error('Colab history is loading. Try again in a moment.');
      let chat = current();
      if ((chat.messages.length || chat.busy) && projectKey(chat.cwd) !== projectKey(profile.cwd)) {
        const existing = [...chats]
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .find((item) => projectKey(item.cwd) === projectKey(profile.cwd));
        if (existing) {
          selected = existing.id;
          chat = existing;
        } else chat = makeChat();
      }
      projectFilter = projectKey(profile.cwd);
      if (!chat.busy)
        Object.assign(chat, {
          cwd: profile.cwd,
          projectName: profile.name,
          profileId: profile.id,
          codexModel: profile.codexModel,
          claudeModel: profile.claudeModel,
          effort: profile.effort,
        });
      save();
      render();
    },
  };
  select('assistant');
  render();
  for (const provider of ['codex', 'claude'])
    void window.atlas
      .modelCatalog(provider)
      .then((models) => {
        if (Array.isArray(models) && models.length) {
          catalog[provider] = models;
          refreshModels();
        }
      })
      .catch(() => {});
})();
