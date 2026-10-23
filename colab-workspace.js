(() => {
  const storageKey = 'atlas.colab.chats.v1';
  let chats = [], selected = '', defaults = {}, catalog = {
    codex: [{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' }, { id: 'gpt-6-astra', name: 'GPT-6 Astra' }, { id: 'gpt-6-sol', name: 'GPT-6 Sol' }, { id: 'gpt-6-luna', name: 'GPT-6 Luna' }],
    claude: [{ id: 'opus', name: 'Claude Opus · latest' }, { id: 'sonnet', name: 'Claude Sonnet · latest' }, { id: 'haiku', name: 'Claude Haiku · latest' }],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    chats = (Array.isArray(saved.chats) ? saved.chats : []).filter(chat => chat && typeof chat.id === 'string' && Array.isArray(chat.messages)).slice(-10);
    for(const chat of chats)if(chat.passLimitVersion!==2){chat.maxRounds=null;chat.passLimitVersion=2;}
    selected = saved.selected;
  } catch {}
  try { defaults = JSON.parse(localStorage.getItem('atlas.colab') || '{}') || {}; } catch {}
  const current = () => chats.find(chat => chat.id === selected);
  function makeChat() {
    const previous = current();
    const chat = { id: crypto.randomUUID(), title: 'New Colab chat', cwd: previous?.cwd || cwd || '', draft: '', messages: [], mode:previous?.mode||'build',roles:previous?.roles||'codex-builds',isolated:previous?.isolated!==false,maxRounds:null,passLimitVersion:2,profileId:previous?.profileId||'',effort: previous?.effort || defaults.effort || 'medium', codexModel: previous?.codexModel || defaults.colabCodexModel || '', claudeModel: previous?.claudeModel || defaults.colabClaudeModel || '', busy: false, status: '' };
    chats.push(chat); selected = chat.id; return chat;
  }
  if (!current()) makeChat();
  const style = document.createElement('style');
  style.textContent = `
    .nav-item[aria-current=page]{background:#193038;color:#b0edf0}.workspace-divider{height:1px;background:#233b43;margin:12px 8px}
    .colab-workspace{min-width:0;display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100vh - 155px);border:1px solid #29414b;border-radius:18px;overflow:hidden;background:#0c171e}
    .colab-chats{padding:18px 12px;border-right:1px solid #243942;background:#0a141a}.colab-chats>button{width:100%;margin-bottom:18px}.colab-chat-list{display:flex;flex-direction:column;gap:6px;max-height:65vh;overflow:auto}.colab-chat-item{border:1px solid transparent;background:transparent;color:#a7bdc5;border-radius:9px;padding:12px 10px;text-align:left;cursor:pointer;overflow:hidden}.colab-chat-item[aria-current=true]{background:#183039;border-color:#34505c;color:#e0f1f3}.colab-chat-item span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.colab-chat-item small{display:block;margin-top:6px;color:#81a5ad;font-size:10px}
    .colab-chat-main{min-width:0;display:flex;flex-direction:column;padding:24px 28px;max-height:calc(100vh - 155px)}.colab-chat-header{display:flex;justify-content:space-between;gap:14px;align-items:center}.colab-chat-header h1{margin:0;font:600 23px Inter,Segoe UI,sans-serif}.colab-chat-header p{font:11px/1.6 Inter,Segoe UI,sans-serif;color:#8faab5;margin:6px 0 0}.colab-config{margin-top:18px;border-bottom:1px solid #253c45;padding-bottom:15px}.colab-config summary{cursor:pointer;color:#a8cdd4;font-size:12px}.colab-config-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.colab-config .field{margin:12px 0 0}.colab-folder-row{display:flex;align-items:center;gap:12px;margin-top:14px}.colab-folder-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px Consolas,monospace;color:#8faab5}.colab-folder-row button{flex:none}
    .colab-transcript{flex:1;min-height:180px;overflow:auto;padding:24px 2px;scroll-behavior:smooth}.colab-empty{padding:40px 8px;text-align:center;color:#8ca8b3;font:13px/1.8 Inter,Segoe UI,sans-serif}.colab-empty strong{display:block;color:#d3e7eb;font-size:22px;font-weight:500;margin-bottom:9px}.colab-message{margin-bottom:22px;font:13px/1.8 Inter,Segoe UI,sans-serif;color:#d1e1e6}.colab-message strong{display:block;margin-bottom:7px;color:#88cad3;font-size:11px}.colab-message p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.colab-message.user{max-width:90%;margin-left:auto;background:#1a3039;padding:12px 16px;border-radius:12px 12px 3px 12px}.colab-message.error{color:#f0c48f}.colab-composer{padding-top:12px;border-top:1px solid #253c45}.colab-composer textarea{display:block;width:100%;min-height:72px;max-height:170px;resize:vertical;border:1px solid #36505a;border-radius:12px;background:#08141b;color:#e0edf0;padding:14px;font:13px/1.6 Inter,Segoe UI,sans-serif}.colab-composer textarea:focus{outline:2px solid #70bfc8;outline-offset:2px}.colab-compose-footer{display:flex;align-items:center;gap:10px;margin-top:12px}.colab-compose-footer [role=status]{flex:1;color:#8faab5;font-size:11px;line-height:1.6}.colab-compose-footer button:disabled{opacity:.5;cursor:wait}
    @media(max-width:1000px){.colab-workspace{grid-template-columns:160px minmax(0,1fr)}.colab-chat-main{padding:20px}.colab-config-grid{grid-template-columns:1fr}.colab-config[open]{max-height:38vh;overflow:auto}}
    @media(max-width:750px){.workspace-nav{flex-wrap:wrap}.workspace-divider{display:none}.colab-workspace{width:100%;display:flex;flex-direction:column;min-height:70vh}.colab-chats{border-right:0;border-bottom:1px solid #243942;padding:12px}.colab-chats>button{width:auto;margin:0 0 10px}.colab-chat-list{flex-direction:row;max-height:75px}.colab-chat-item{min-width:130px;max-width:180px}.colab-chat-main{max-height:none;min-height:65vh;padding:18px}.colab-transcript{max-height:55vh}.colab-chat-header{align-items:flex-start}.colab-chat-header h1{font-size:21px}}
  `;
  style.textContent += '.colab-chat-main{height:calc(100vh - 155px);min-height:0;overflow:hidden}.colab-chat-header,.colab-composer{flex-shrink:0;max-height:42vh;overflow:auto}.colab-transcript{flex:1 1 0;min-height:0}.colab-config{flex-shrink:0;max-height:30vh;overflow:auto}@media(max-width:750px){.colab-chat-main{height:75vh;min-height:0}}';
  style.textContent += '.colab-config[open]{max-height:24vh;flex-shrink:1;min-height:40px}.colab-composer{flex:0 1 auto;min-height:160px;max-height:42vh;overflow:auto}.colab-composer .attachment-bar{margin:3px 0}.colab-composer .attachment-bar p{margin:4px 0}.colab-composer textarea{min-height:60px}.colab-compose-footer{position:sticky;bottom:0;background:#0c171e;padding:6px 0}';
  style.textContent += '.colab-composer{min-height:0;max-height:46vh}.colab-composer textarea{box-sizing:border-box;min-height:48px;height:48px;max-height:180px;resize:none;overflow-y:hidden;padding:12px 14px}.colab-work{margin:12px 0 18px;border:1px solid #28434d;border-radius:10px;padding:10px 12px;color:#92b2bd}.colab-work summary{cursor:pointer;font:12px/1.6 Segoe UI,sans-serif}.colab-work-list{max-height:24vh;overflow:auto;margin-top:8px}.colab-work-step{border-top:1px solid #213840;padding:8px 0;font:11px/1.6 Segoe UI,sans-serif}.colab-work-step pre{font:11px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;color:#bed4dd}.colab-work-step[data-status=failed]{color:#edb88c}.colab-work-note{font:10px/1.5 Segoe UI,sans-serif;color:#7897a3;margin:6px 0 0}';
  style.textContent+='.task-progress pre{font:13px/1.7 Segoe UI,sans-serif;color:#c8d9df}.task-command>summary{color:#91aab4;cursor:pointer}.task-command pre{padding:8px;background:#071118;border-radius:7px}.assistant-task-work{margin:8px 0 16px}.assistant-task-work:empty{display:none}.assistant-task-work .colab-work{margin:0}.assistant-task-work .colab-work-list{max-height:32vh}.colab-work-step.task-progress{border-top:0;padding:6px 0}';
  document.head.append(style);
  const panel = document.createElement('section'); panel.className = 'colab-workspace'; panel.hidden = true; panel.setAttribute('aria-label', 'Colab chat workspace');
  panel.innerHTML = `<aside class="colab-chats" aria-label="Colab conversations"><button class="quiet-button" id="colabNewChat" type="button">＋ New Colab chat</button><div class="colab-chat-list" id="colabChats"></div></aside>
    <div class="colab-chat-main"><header class="colab-chat-header"><div><h1>Colab</h1><p>Codex + Claude · one task, one shared result</p></div><span class="session-chip">PRIVATE COLLABORATION</span></header>
    <details class="colab-config" id="colabConfig"><summary>Models, effort and working folder</summary><div class="colab-config-grid"><label class="field"><span>Codex model</span><select id="colabCodexModel"></select></label><label class="field"><span>Claude model</span><select id="colabClaudeModel"></select></label><label class="field"><span>Shared effort</span><select id="colabEffort"><option value="low">Low · faster</option><option value="medium">Medium · balanced</option><option value="high">High · deeper review</option><option value="xhigh">Extra high</option><option value="max">Maximum</option></select></label></div><div class="colab-folder-row"><button class="quiet-button" type="button" id="colabChooseFolder">Choose folder</button><span id="colabFolder"></span></div></details>
    <div class="colab-transcript" id="colabTranscript" role="log" aria-label="Colab messages" aria-live="polite"></div>
    <form class="colab-composer" id="colabForm"><label class="sr-only" for="colabTask">Message Colab</label><textarea id="colabTask" rows="1" maxlength="20000" aria-label="Message Colab" placeholder="Give Codex and Claude a task, or ask a follow-up…"></textarea><div class="colab-compose-footer"><span id="colabStatus" role="status" aria-live="polite"></span><button class="quiet-button" id="colabStop" type="button" hidden>Stop</button><button class="primary-button" id="colabStart" type="submit">Send to Colab</button></div></form></div>`;
  document.querySelector('.layout').append(panel);
  const search=document.createElement('input');search.id='colabSearch';search.className='history-search';search.placeholder='Search Colab chats…';search.setAttribute('aria-label','Search Colab chats');panel.querySelector('#colabChats').before(search);search.oninput=()=>render();
  const controls=document.createElement('div');controls.className='colab-config-grid';controls.innerHTML='<label class="field">Mode<select id="colabMode"><option value="build">Build and review</option><option value="plan">Plan · read-only</option><option value="debug">Debug</option><option value="compare">Compare approaches · read-only</option></select></label><label class="field">Roles<select id="colabRoles"><option value="codex-builds">Codex builds · Claude reviews</option><option value="claude-builds">Claude builds · Codex reviews</option><option value="proposals">Compare proposals, then build</option></select></label><label class="field">Pass limit (optional)<input id="colabPasses" type="number" min="1" step="1" placeholder="Unlimited"><small>Leave blank for unlimited passes.</small></label><label class="toggle-row"><span>Review edits in an isolated Git worktree</span><input id="colabIsolated" type="checkbox" checked></label>';panel.querySelector('#colabConfig').append(controls);
  const toolbar=document.createElement('div');toolbar.className='colab-chat-actions';toolbar.innerHTML='<button class="quiet-button" id="colabRename" type="button">Rename</button><button class="quiet-button" id="colabPin" type="button">Pin</button><button class="quiet-button" id="colabExport" type="button">Export</button>';panel.querySelector('.colab-chat-header').append(toolbar);
  const recovery=document.createElement('div');recovery.className='colab-recovery';recovery.innerHTML='<span id="colabUsage"></span><button class="quiet-button" id="colabResume" type="button" hidden>Resume saved stages</button><button class="quiet-button" id="colabReview" type="button" hidden>Review changes</button>';panel.querySelector('#colabForm').before(recovery);

  const el = id => panel.querySelector('#' + id);
  // The textarea already has an accessible label; keep the visual surface uncluttered.
  panel.querySelector('.sr-only').hidden = true;
  const assistantButton = document.createElement('button'), colabButton = document.createElement('button'), divider = document.createElement('div');
  for (const [button, label, workspace] of [[assistantButton, 'Assistant', 'assistant'], [colabButton, 'Colab', 'colab']]) {
    button.type = 'button'; button.className = 'nav-item'; button.textContent = label; button.dataset.chatWorkspace = workspace;
    button.onclick = () => select(workspace);
  }
  divider.className = 'workspace-divider'; divider.setAttribute('aria-hidden', 'true');
  workspaceNav.prepend(assistantButton, colabButton, divider);
  function select(workspace) {
    if (workspace === 'colab') { selectWorkspaceView(''); cancelRecording(); stopWakeListener(); stopSpeaking(); }
    document.body.dataset.workspace = workspace;
    document.querySelector('.core').hidden = workspace === 'colab'; panel.hidden = workspace !== 'colab';
    $('#historyOpen').hidden = workspace === 'colab';
    assistantButton.setAttribute('aria-current', workspace === 'assistant' ? 'page' : 'false');
    colabButton.setAttribute('aria-current', workspace === 'colab' ? 'page' : 'false');
    if (workspace === 'colab') { render(); el('colabTask').focus(); }
    else if (settings.wakeWordEnabled) void startWakeListener();
  }
  function save() {
    // Keep local storage bounded, preserving running conversations and the current chat.
    while (chats.length > 10) { const index = chats.findIndex(chat => chat.id !== selected && !chat.busy); if (index < 0) break; chats.splice(index, 1); }
    for (const chat of chats) chat.messages = chat.messages.slice(-24);
    let text = JSON.stringify({ chats, selected });
    while (text.length > 1500000) {
      const old = chats.find(chat => chat.id !== selected && !chat.busy);
      if (old) chats.splice(chats.indexOf(old), 1);
      else if (current().messages.length > 2) current().messages.splice(0, 2);
      else break;
      text = JSON.stringify({ chats, selected });
    }
    try { localStorage.setItem(storageKey, text); } catch { el('colabStatus').textContent = 'Could not save this chat locally. Check available storage.'; }
  }
  function refreshModels() {
    const chat = current();
    for(const [id,value] of [['colabMode',chat.mode||'build'],['colabRoles',chat.roles||'codex-builds'],['colabPasses',chat.maxRounds??'']]){el(id).value=value;el(id).disabled=chat.busy;}el('colabIsolated').checked=chat.isolated!==false;el('colabIsolated').disabled=chat.busy;

    for (const provider of ['codex', 'claude']) {
      const picker = el(provider === 'codex' ? 'colabCodexModel' : 'colabClaudeModel'), chosen = chat[provider + 'Model'] || '';
      const models = new Map([...catalog[provider], ...(settings[provider + 'Models'] || []).map(id => ({ id, name: id })), ...(chosen ? [{ id: chosen, name: chosen }] : [])].map(item => [item.id, item]));
      picker.replaceChildren(new Option('Use model selected in Settings', ''), ...[...models.values()].map(item => new Option(item.name, item.id)));
      picker.value = chosen; picker.disabled = chat.busy;
    }
    el('colabEffort').value = chat.effort || 'medium'; el('colabEffort').disabled = chat.busy;
    el('colabFolder').textContent = chat.cwd || 'Choose a working folder'; el('colabFolder').title = chat.cwd || '';
    el('colabChooseFolder').disabled = chat.busy;
  }
  function sizeComposer(){
    const input=el('colabTask'),limit=Math.max(48,Math.min(180,Math.floor(window.innerHeight*.24)));
    input.style.height='auto';input.style.height=Math.max(48,Math.min(limit,input.scrollHeight))+'px';input.style.overflowY=input.scrollHeight>limit?'auto':'hidden';
  }
  window.addEventListener('resize',sizeComposer);
  function captureActivity(chat,job){
    chat.activityRuns ||= [];let run=chat.activityRuns.find(run=>run.id===job.id);
    if(!run){run={id:job.id,status:job.status,expanded:job.status==='running',events:[]};chat.activityRuns.push(run);}
    if(run.status==='running'&&job.status!=='running')run.expanded=false;
    run.status=job.status;
    if(Array.isArray(job.events)){
      const steps=new Map();for(const event of job.events.slice(-100)){
        const text=String(event.text||'').slice(0,800);if(!text)continue;
        const key=event.id?event.provider+':'+event.id:event.kind+':'+text;
        steps.set(key,{kind:String(event.kind||'activity'),text,provider:event.provider||'',status:event.status||'',id:event.id||key,at:Number(event.at)||job.startedAt||0,...(Number.isInteger(event.exitCode)?{exitCode:event.exitCode}:{})});
      }run.events=[...steps.values()].slice(-60);
    }
    chat.activityRuns=chat.activityRuns.slice(-6);
  }
  function activityView(run){
    const details=document.createElement('details');details.className='colab-work';details.dataset.jobId=run.id;details.open=run.expanded===true;
    const summary=document.createElement('summary'),list=document.createElement('div'),note=document.createElement('p');
    summary.textContent=(run.status==='running'?'Working':run.status==='completed'?'Work completed':run.status==='paused'?'Work paused':run.status==='failed'?'Work interrupted':'Work stopped')+' · '+run.events.length+' reported steps';
    list.className='colab-work-list';list.setAttribute('aria-label','Reported task activity');
    for(const event of run.events){const row=document.createElement('div'),label=document.createElement('div'),text=document.createElement('pre');row.className='colab-work-step';row.dataset.status=event.status;
      label.textContent=[event.provider?.toUpperCase(),event.kind==='command'?'Command':event.kind==='files'?'Files':event.kind==='plan'?'Plan':'Progress',event.status,event.exitCode!==undefined?'exit '+event.exitCode:''].filter(Boolean).join(' · ');
      text.textContent=event.text;
      if(event.kind==='command'){
        const command=document.createElement('details'),heading=document.createElement('summary');command.className='task-command';command.open=(run.openCommands||[]).includes(event.id);
        heading.textContent=[event.status==='running'?'Running command':event.status==='failed'?'Command failed':'Ran command',event.provider?.toUpperCase(),event.exitCode!==undefined?'exit '+event.exitCode:''].filter(Boolean).join(' · ');
        command.append(heading,text);row.append(command);command.addEventListener('toggle',()=>{if(command.isConnected){const opened=new Set(run.openCommands||[]);command.open?opened.add(event.id):opened.delete(event.id);run.openCommands=[...opened];}});
      }else if(event.kind==='progress'){row.classList.add('task-progress');row.append(text);}
      else row.append(label,text);
      list.append(row);
    }
    note.className='colab-work-note';note.textContent='Recent provider-reported actions and progress summaries.';details.append(summary,list,note);
    details.addEventListener('toggle',()=>{if(details.isConnected){run.expanded=details.open;save();}});return details;
  }
  function render() {
    const chat = current(), list = el('colabChats'), transcript = el('colabTranscript');
    list.replaceChildren();
    const query=el('colabSearch').value.toLowerCase();
    for (const item of [...chats].reverse().sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))).filter(chat=>(chat.title+' '+chat.messages.map(m=>m.content).join(' ')).toLowerCase().includes(query))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'colab-chat-item'; button.setAttribute('aria-current', String(item.id === selected));
      const title = document.createElement('span'), detail = document.createElement('small'); title.textContent = (item.pinned?'★ ':'')+item.title; detail.textContent = item.busy ? 'Working…' : item.messages.length ? 'Saved on this computer' : 'New conversation';
      button.append(title, detail); button.onclick = () => { selected = item.id; save(); render(); }; list.append(button);
    }
    const atBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80;
    const activityScroll=new Map([...transcript.querySelectorAll('.colab-work')].map(details=>{const list=details.querySelector('.colab-work-list');return [details.dataset.jobId,{top:list.scrollTop,atBottom:list.scrollHeight-list.scrollTop-list.clientHeight<30}];}));
    transcript.replaceChildren();
    if (!chat.messages.length) {
      const empty = document.createElement('div'); empty.className = 'colab-empty'; const title = document.createElement('strong'); title.textContent = 'Two perspectives. One conversation.';
      empty.append(title, document.createTextNode('Describe your task. Codex works, Claude reviews, and you receive their final summary here.')); transcript.append(empty);
    }
    const shownRuns=new Set();
    for (const message of chat.messages) {
      const run=message.role==='assistant'&&(chat.activityRuns||[]).find(run=>run.id===message.jobId);
      if(run&&!shownRuns.has(run.id)){transcript.append(activityView(run));shownRuns.add(run.id);}
      const article = document.createElement('article'); article.className = 'colab-message ' + (message.error ? 'error' : message.role === 'user' ? 'user' : 'assistant');
      const label = document.createElement('strong'), content = document.createElement('p'); label.textContent = message.role === 'user' ? 'You' : message.error ? 'Could not complete this task' : 'Colab · Codex + Claude'; content.textContent = message.content; article.append(label, content);window.atlasWorkspace?.messageAttachments(article,message.attachments); transcript.append(article);
    }
    for(const run of chat.activityRuns||[])if(!shownRuns.has(run.id))transcript.append(activityView(run));
    for(const details of transcript.querySelectorAll('.colab-work')){const list=details.querySelector('.colab-work-list'),prior=activityScroll.get(details.dataset.jobId);list.scrollTop=!prior||prior.atBottom?list.scrollHeight:prior.top;}
    if (atBottom) transcript.scrollTop = transcript.scrollHeight;
    if(el('colabTask').value!==(chat.draft||''))el('colabTask').value=chat.draft||'';sizeComposer();
    el('colabStart').disabled = chat.busy || chat.preparing; el('colabStop').hidden = !chat.busy; el('colabStop').disabled = !chat.jobId;
    el('colabStatus').textContent = chat.status || 'Only the final summary appears when both models finish.';
    el('colabPin').textContent=chat.pinned?'Unpin':'Pin';
    const job=chat.lastJob;el('colabResume').hidden=chat.busy||!job?.canResume;el('colabReview').hidden=chat.busy||!chat.workspaceId;
    const usage=chat.usage;el('colabUsage').textContent=(job?.budget?'Runtime '+Math.round(job.budget.usedMs/1000)+'s · '+(job.checkpointCount||0)+' saved passes. ':'')+(usage?.reported?usage.inputTokens+' input / '+usage.outputTokens+' output tokens. ':'Usage not reported yet.')+(usage?.costReported?' Provider-reported cost USD '+usage.reportedCostUsd.toFixed(4)+'.':'');
    refreshModels();
    window.dispatchEvent(new Event('atlas-colab-chat-change'));
  }
  el('colabNewChat').onclick = () => { makeChat(); save(); render(); el('colabConfig').open = true; el('colabTask').focus(); };
  el('colabTask').oninput = () => { current().draft = el('colabTask').value; sizeComposer(); save(); };
  el('colabTask').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!current().busy) el('colabForm').requestSubmit(); } };
  for (const [id, key] of [['colabCodexModel', 'codexModel'], ['colabClaudeModel', 'claudeModel'], ['colabEffort', 'effort']]) el(id).onchange = () => { current()[key] = el(id).value; save(); };
  el('colabChooseFolder').onclick = async () => {
    const chat = current();
    try { const folder = await window.atlas.pickFolder(); if (folder && !chat.busy) { chat.cwd = folder; save(); render(); } }
    catch (error) { chat.status = error.message; render(); }
  };
  el('colabForm').onsubmit = async event => {
    event.preventDefault(); const chat = current(), task = el('colabTask').value.trim();
    if (chat.busy || chat.preparing || !task) return;
    if (!chat.cwd) { chat.status = 'Choose a working folder before sending.'; el('colabConfig').open = true; render(); return; }
    if(chat.isolated!==false&&!['plan','compare'].includes(chat.mode)){chat.preparing=true;render();try{const prepared=await window.atlas.prepareProject(chat.cwd);if(!prepared.ready)return;}catch(error){chat.status=error.message;return;}finally{chat.preparing=false;render();}}
    const context = chat.messages.filter(message => !message.error).slice(-12).map(({ role, content }) => ({ role, content }));
    const attached=window.atlasWorkspace?.takeAttachments('colab',chat.id)||{request:{},files:[]};
    chat.messages.push({ role: 'user', content: task, attachments:attached.files }); chat.draft = ''; if(!chat.customTitle)chat.title = chat.messages.find(message => message.role === 'user').content.slice(0, 60);
    chat.busy = true; chat.jobId = ''; chat.status = 'Starting collaboration…'; save(); render();
    try { const result = await window.atlas.collaborate({ task, context, chatId: chat.id, cwd: chat.cwd, codexModel: chat.codexModel, claudeModel: chat.claudeModel, effort: chat.effort,mode:chat.mode||'build',roles:chat.roles||'codex-builds',isolated:chat.isolated!==false,maxRounds:chat.maxRounds??null,...attached.request,profileId:chat.profileId }); chat.jobId = result.id; save(); render(); }
    catch (error) { chat.busy = false; chat.status = 'Task failed. You can retry or send a follow-up.'; chat.messages.push({ role: 'assistant', error: true, content: error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') }); save(); render(); }
  };
  el('colabStop').onclick = async () => {
    const chat = current(); if (!chat.jobId) return;
    try { await window.atlas.jobs({ action: 'stop', id: chat.jobId }); chat.status = 'Stopping collaboration…'; render(); }
    catch (error) { chat.status = error.message; render(); }
  };
  function update(value) {
    const chat = chats.find(chat => chat.id === value.chatId || chat.jobId === value.id);
    if (!chat || chat.finishedJob === value.id || chat.finishedJobs?.includes(value.id)) return;
    chat.jobId = value.id; chat.status = value.limitation||value.status||'Working…';
    if(value.workspaceId)chat.workspaceId=value.workspaceId;if(value.usage)chat.usage=value.usage;
    if (typeof value.result === 'string' || value.error) {
      chat.busy = false; chat.finishedJob = value.id;
      chat.finishedJobs = [...(chat.finishedJobs || []), value.id].slice(-100);
      const run=(chat.activityRuns||[]).find(run=>run.id===value.id);if(run){run.status=value.error?'failed':'completed';run.expanded=false;}
      chat.messages.push({ role: 'assistant', jobId:value.id, content: String(value.result || value.error).slice(0, 30000), ...(value.error ? { error: true } : {}) });
    } else chat.busy = true;
    save(); render();
  }
  function reconcile(jobs) {
    for(const job of [...jobs].sort((a,b)=>(a.startedAt||0)-(b.startedAt||0))){const chat=chats.find(chat=>job.collaboration&&chat.id===job.colabChatId);if(!chat||(chat.lastJob?.startedAt||0)>(job.startedAt||0))continue;captureActivity(chat,job);chat.lastJob={id:job.id,status:job.status,startedAt:job.startedAt,budget:job.budget,checkpointCount:job.checkpoints?.length||0,canResume:Boolean(job.request&&['paused','failed','cancelled'].includes(job.status))};if(job.workspaceId)chat.workspaceId=job.workspaceId;if(job.result?.usage)chat.usage=job.result.usage;}

    for (const job of jobs.filter(job => job.collaboration && !chats.some(chat=>chat.id===job.colabChatId && (chat.lastJob?.startedAt||0)>(job.startedAt||0)))) update({ id: job.id, chatId: job.colabChatId, status: job.statusText, ...(job.status === 'completed' ? { result: job.result?.output || 'Both providers finished.' } : job.status !== 'running' ? { error: job.error || 'Collaboration stopped. Send a follow-up to continue.' } : {}) });
    save(); render();
  }
  window.atlas.onCollaborationStatus(update);
  window.atlas.onJobs(patch => reconcile(patch.upsert || []));
  void window.atlas.jobs().then(jobs => {
    reconcile(jobs);
    for (const chat of chats) if (chat.busy && !jobs.some(job => job.id === chat.jobId && job.status === 'running')) { chat.busy = false; chat.status = 'Previous run is no longer active. Send a follow-up to continue.'; }
    save(); render();
  }).catch(() => { for (const chat of chats) chat.busy = false; render(); });
  for(const [id,key] of [['colabMode','mode'],['colabRoles','roles'],['colabPasses','maxRounds']])el(id).onchange=()=>{current()[key]=key==='mode'||key==='roles'?el(id).value:(el(id).value===''?null:Number(el(id).value));save();};el('colabIsolated').onchange=()=>{current().isolated=el('colabIsolated').checked;save();};
  el('colabRename').onclick=()=>window.atlasWorkspace?.renameColab();
  el('colabPin').onclick=()=>{current().pinned=!current().pinned;save();render();};
  el('colabExport').onclick=()=>void window.atlas.exportChat({title:current().title,markdown:'# '+current().title+'\n\n'+current().messages.map(m=>'## '+(m.role==='user'?'You':'Colab')+'\n\n'+m.content).join('\n\n')}).catch(error=>toast(error.message));
  el('colabResume').onclick=async()=>{const chat=current();if(!chat.lastJob?.canResume)return;try{if(chat.isolated!==false&&!['plan','compare'].includes(chat.mode)&&!(await window.atlas.prepareProject(chat.cwd)).ready)return;}catch(error){chat.status=error.message;render();return;}chat.busy=true;chat.status='Resuming from saved provider stages…';save();render();try{const result=await window.atlas.collaborate({resumeJobId:chat.lastJob.id,maxRounds:chat.maxRounds??null});chat.jobId=result.id;save();render();}catch(error){chat.busy=false;chat.status=error.message;save();render();}};
  el('colabReview').onclick=()=>window.atlasWorkspace?.review(current().workspaceId);
  window.atlasColab = {captureActivity,activityView,refreshMessages:render,setCatalog:value=>{for(const provider of ['codex','claude'])if(value[provider]?.models?.length)catalog[provider]=value[provider].models;refreshModels();},refreshModels,selectAssistant:()=>select('assistant'),current:()=>structuredClone(current()),history:()=>chats.map(chat=>({provider:'colab',id:chat.id,title:chat.title,pinned:chat.pinned,cwd:chat.cwd,turns:chat.messages,updatedAt:chat.messages.length?chat.lastJob?.startedAt||Date.now():0})),selectChat:id=>{if(!chats.some(chat=>chat.id===id))return;selected=id;save();select('colab');},metadata:(id,value)=>{const chat=chats.find(chat=>chat.id===id);if(chat){Object.assign(chat,value);chat.customTitle=true;save();render();}},applyProfile:profile=>{const chat=current();if(chat.busy)throw Error('Finish or stop the current Colab task before switching projects.');Object.assign(chat,{cwd:profile.cwd,profileId:profile.id,codexModel:profile.codexModel,claudeModel:profile.claudeModel,effort:profile.effort});save();render();}};
  select('assistant'); render();
  for (const provider of ['codex', 'claude']) void window.atlas.modelCatalog(provider).then(models => { if (Array.isArray(models) && models.length) { catalog[provider] = models; refreshModels(); } }).catch(() => {});
})();