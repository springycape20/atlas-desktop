(() => {
  const api=window.atlas;if(!api?.taskQueue)return;
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const modal=el('dialog',undefined,'workspace-dialog productivity-dialog');modal.setAttribute('aria-label','ATLAS workbench');
  const header=el('header'),title=el('h2','Workbench'),tabs=el('nav',undefined,'workspace-actions'),body=el('div',undefined,'workspace-dialog-body'),status=el('footer');status.setAttribute('role','status');header.append(title);modal.append(header,tabs,body,status);document.body.append(modal);
  let page='Queue',generation=0,queueState,pending=[],jobRows=[];
  function button(text,action,parent=body){const node=el('button',text,'quiet-button');node.type='button';node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){status.textContent=error.message;}finally{node.disabled=false;}};parent.append(node);return node;}
  button('Close',()=>modal.close(),header);
  const sections={Queue:showQueue,Plugins:showPlugins,'Project setup':showSetup,Search:showSearch,Checkpoints:showCheckpoints,Approvals:showApprovals};
  for(const name of Object.keys(sections))button(name,()=>open(name),tabs);
  async function open(name){page=name;title.textContent=name;body.replaceChildren();status.textContent='';const version=++generation;if(!modal.open)modal.showModal();try{await sections[name](version);}catch(error){if(version===generation)status.textContent=error.message;}}
  const navButton=button('Workbench',()=>open('Queue'),document.querySelector('.workspace-nav'));navButton.className='nav-item';
  const settingsSection=document.querySelector('#settingsDialog .setting-section');if(settingsSection)button('Installed plugins and tools',()=>open('Plugins'),settingsSection);
  const alertButton=button('Approvals',()=>open('Approvals'),document.body);alertButton.className='approval-alert';alertButton.hidden=true;
  const style=el('style');style.textContent='.productivity-dialog{box-sizing:border-box;height:min(680px,90vh);overflow:hidden}.productivity-dialog[open]{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto}.productivity-dialog>.workspace-dialog-body{min-height:0;max-height:none;overflow:auto}.productivity-dialog>footer{max-height:80px;overflow:auto}.productivity-dialog>nav{padding:8px 16px;margin:0;border-bottom:1px solid #29414a}.productivity-dialog>nav button{font-size:11px;padding:6px 10px}.productivity-dialog p{font:12px/1.6 Segoe UI,sans-serif;overflow-wrap:anywhere}.productivity-dialog select,.productivity-dialog textarea{box-sizing:border-box}.workbench-row{padding:12px 0;border-bottom:1px solid #29414a}.workbench-row h3{margin:0 0 5px}.workbench-row pre{max-height:28vh}.workbench-row details{margin-top:8px;font-size:12px}.workbench-state{color:#8bcec1}.approval-alert{position:fixed;right:18px;bottom:55px;z-index:40;background:#604321;color:#ffe0ad;border:1px solid #b58649;border-radius:9px;padding:10px 14px;cursor:pointer}.approval-alert[hidden]{display:none}.workbench-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.productivity-dialog label:has(input[type=checkbox]){display:flex;align-items:center;gap:8px}.productivity-dialog input[type=checkbox]{width:auto}.workbench-result{width:100%;text-align:left;margin:4px 0}.workbench-queue-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}.workbench-queue-form label:has(textarea){grid-column:1/-1}.workbench-queue-form>button{width:fit-content}.workbench-queue-form input:disabled,.workbench-queue-form select:disabled{opacity:.5}@media(max-width:650px){.workbench-queue-form{grid-template-columns:1fr}}.workbench-message{color:#a9c3cd;font-size:12px}';document.head.append(style);
  const row=(name,detail)=>{const node=el('section',undefined,'workbench-row');node.append(el('h3',name));if(detail)node.append(el('p',detail));body.append(node);return node;};
  const field=(label,type='input',parent=body)=>{const wrap=el('label',label),input=el(type);wrap.append(input);parent.append(wrap);return input;};
  const select=(label,options,parent=body)=>{const input=field(label,'select',parent);for(const [value,text] of options)input.append(new Option(text,value));return input;};
  function verification(node,job){const verification=job.verification||job.result?.verification;node.append(el('p','Completion checks: '+(verification?.status||'not checked'),'workbench-state'));if(verification?.reason)node.append(el('p',verification.reason));for(const result of verification?.results||[]){const details=el('details');details.append(el('summary',result.status+' · '+result.command),el('pre',(result.output||result.error||'No output')+'\nExit: '+result.exitCode));node.append(details);}}
  async function showQueue(version){
    const [state,profiles]=await Promise.all([api.taskQueue(),api.projects()]);if(version!==generation)return;queueState=state;
    const controls=el('div',undefined,'workspace-actions');body.append(controls);
    const pauseLabel=el('label','Pause between tasks'),pause=el('input');pause.type='checkbox';pause.checked=state.pauseBetween;pauseLabel.prepend(pause);body.append(pauseLabel);
    button('Start / continue',async()=>{await api.taskQueue({action:'start',pauseBetween:pause.checked});await open('Queue');},controls);
    button('Pause queue',async()=>{await api.taskQueue({action:'pause'});await open('Queue');},controls);
    const stateText=el('p',state.paused?'Queue paused.':'Queue running.','workbench-state');stateText.id='queueState';body.append(stateText);
    const form=el('form',undefined,'workbench-queue-form'),project=select('Project',[['','Choose a saved project'],...profiles.map(p=>[p.id,p.name])],form),provider=select('Run with',[['assistant','Assistant'],['colab','Colab']],form),roles=select('Colab roles',[['codex-builds','Codex builds · Claude reviews'],['claude-builds','Claude builds · Codex reviews'],['proposals','Compare proposals, then build']],form),task=field('Task','textarea',form);task.rows=2;task.maxLength=20000;roles.disabled=true;provider.onchange=()=>roles.disabled=provider.value!=='colab';
    button('Add task',async()=>{const selected=profiles.find(p=>p.id===project.value);if(!selected)throw Error('Choose a saved project. Use Project setup to create one.');await api.taskQueue({action:'add',task:{prompt:task.value,cwd:selected.cwd,profileId:selected.id,provider:provider.value,roles:roles.value}});await open('Queue');},form);body.append(form);
    const list=el('div');list.id='queueItems';body.append(list);renderQueueItems(list,state);
    status.textContent='Tasks run one at a time. Pause stops the next task; stop a running task in Tasks. The queue always pauses after restarting ATLAS.';
  }
  function renderQueueItems(list,state){list.replaceChildren();for(const item of state.items){const node=el('section',undefined,'workbench-row');node.append(el('h3',item.prompt),el('p',item.provider+' · '+item.status+' · '+item.cwd));if(item.error)node.append(el('p',item.error));const actions=el('div',undefined,'workspace-actions');node.append(actions);
      if(item.status==='queued')for(const [text,direction] of [['Move up','up'],['Move down','down']])button(text,async()=>{await api.taskQueue({action:'move',id:item.id,direction});await open('Queue');},actions);
      if(['failed','interrupted'].includes(item.status))button('Retry after review',async()=>{await api.taskQueue({action:'retry',id:item.id});await open('Queue');},actions);
      if(item.result?.jobId)button('View result',()=>showTask(item.result.jobId),actions);
      if(item.status!=='running')button('Remove',async()=>{await api.taskQueue({action:'remove',id:item.id});await open('Queue');},actions);
      list.append(node);
    }if(!state.items.length)list.append(el('p','No queued tasks yet.'));}
  async function showPlugins(version){
    body.append(el('p','Uses the plugins already installed for each provider. Claude toggles change its shared configuration. Start a new chat after changing plugins.'));
    status.textContent='Scanning providers…';const result=await api.plugins({cwd:typeof cwd==='string'?cwd:undefined});if(version!==generation)return;
    for(const plugin of result.plugins){const node=row(plugin.name,plugin.provider+' · '+plugin.version+' · '+plugin.status);if(plugin.provider==='claude')button(plugin.enabled?'Disable in Claude':'Enable in Claude',async()=>{await api.plugins({action:'toggle',provider:plugin.provider,id:plugin.id,enabled:!plugin.enabled,cwd:typeof cwd==='string'?cwd:undefined});await open('Plugins');},node);}
    for(const app of result.apps)row(app.name,'Codex connector · '+(app.callable?'Ready':app.enabled?'Needs connection or provider support':'Disabled'));
    for(const server of result.servers){const node=row(server.name,'MCP · '+server.authStatus+' · '+server.tools+' tools');if(/notloggedin|not_logged_in/i.test(server.authStatus||''))button('Connect',async()=>{const result=await api.pluginConnect({name:server.name});await api.openLink(result.url);},node);}
    if(result.skills.length){const details=el('details');details.append(el('summary',result.skills.length+' available Codex skills'),el('pre',result.skills.map(skill=>(skill.enabled?'✓ ':'– ')+skill.name).join('\n')));body.append(details);}
    button('Refresh',()=>open('Plugins'));status.textContent=result.errors.join('\n')||'Provider plugins discovered. Availability can vary by project and provider permissions.';
  }
  async function showSetup(version){
    const folderLabel=el('p','Choose an existing or empty project folder.');body.append(folderLabel);
    button('Choose folder',async()=>{const folder=await api.pickFolder();if(!folder)return;status.textContent='Inspecting project…';const info=await api.projectSetup({cwd:folder});if(version!==generation)return;body.replaceChildren();body.append(el('p',info.cwd),el('p','Detected: '+(info.types.join(', ')||'New project')));
      const name=field('Project name');name.value=info.name;
      const instructions=field('Project instructions','textarea');instructions.rows=3;
      const checks=field('Completion checks (one command per line)','textarea');checks.rows=4;checks.value=info.checks.join('\n');
      const autoLabel=el('label','Run these checks automatically after tasks'),auto=el('input');auto.type='checkbox';autoLabel.prepend(auto);body.append(autoLabel);
      const gitLabel=el('label','Create a local Git repository and initial snapshot'),git=el('input');git.type='checkbox';git.checked=!info.repository.exists||!info.repository.hasCommit;git.disabled=info.repository.exists&&info.repository.hasCommit;gitLabel.prepend(git);body.append(gitLabel);
      if(info.installs.length){body.append(el('p','Suggested dependency commands (review before running):'),el('pre',info.installs.join('\n')));button('Copy dependency commands',()=>navigator.clipboard.writeText(info.installs.join('\n')));}
      button('Save project',async()=>{const saved=await api.projectSetup({action:'save',cwd:info.cwd,initialize:git.checked,profile:{name:name.value,instructions:instructions.value,commands:info.installs.join('\n'),checkCommands:checks.value,autoCheck:auto.checked}});if(saved.cancelled)return;await window.atlasWorkspace?.refreshProfiles?.();status.textContent='Project saved. Choose it in Projects or the queue.';});status.textContent='Automatic checks execute your configured commands in the task folder. Enable them only after reviewing the commands.';
    });
  }
  async function showSearch(){
    const input=field('Search messages, commands, file changes and attachment names'),results=el('div');body.append(results);let timer,sequence=0;
    const search=async()=>{const request=++sequence,query=input.value.trim();results.replaceChildren();if(!query)return;status.textContent='Searching…';
      try{const [work,chats]=await Promise.all([api.searchWork({query}),api.historyList({query})]);if(request!==sequence||!input.isConnected)return;
        const matches=[...work,...chats.map(chat=>({kind:chat.provider+' chat',title:chat.title,text:chat.searchText||chat.cwd||'',chat}))];
        for(const chat of window.atlasColab?.history()||[])if((chat.title+' '+chat.turns.map(t=>t.content+' '+(t.attachments||[]).map(a=>a.name).join(' ')).join(' ')).toLowerCase().includes(query.toLowerCase()))matches.push({kind:'Colab chat',title:chat.title,text:chat.turns.map(t=>t.content).join('\n').slice(-1200),colabId:chat.id});
        for(const match of matches.slice(0,200)){const node=el('section',undefined,'workbench-row');node.append(el('h3',match.title),el('p',match.kind),el('pre',match.text));
          if(match.jobId)button('Open task',()=>showTask(match.jobId),node);
          else if(match.colabId)button('Open chat',()=>{modal.close();window.atlasColab.selectChat(match.colabId);},node);
          else if(match.chat)button('Read conversation',async()=>{const chat=await api.historyRead({provider:match.chat.provider,id:match.chat.id});body.replaceChildren(el('h3',chat.title),el('pre',chat.turns.map(t=>t.role+': '+t.content).join('\n\n')));button('Back to search',()=>open('Search'));},node);
          results.append(node);
        }status.textContent=Math.min(matches.length,200)+' results shown. Provider transcript searches use the provider’s local history.';
      }catch(error){if(request===sequence)status.textContent=error.message;}};
    input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>void search(),250);};input.focus();
  }
  async function showTask(id){
    const jobs=await api.jobs(),job=jobs.find(row=>row.id===id);if(!job)throw Error('This task is no longer retained.');page='Task';title.textContent='Task result';body.replaceChildren();generation++;
    body.append(el('h3',job.prompt),el('p',job.status+' · '+job.cwd),el('pre',job.result?.output||job.error||job.statusText||''));verification(body,job);
    const details=el('details');details.append(el('summary','Commands and activity'),el('pre',(job.events||[]).map(e=>e.text).join('\n')));body.append(details);
    if(job.changeId&&job.status!=='running')button('Review checkpoint / undo',()=>previewRestore(job));if(job.recoveryChangeId)button('Undo last restore',()=>previewRestore(job,true));
    button('Refresh task',()=>showTask(id));
  }
  async function showCheckpoints(version){const jobs=await api.jobs();if(version!==generation)return;for(const job of [...jobs].reverse()){const node=row(job.prompt,job.status+' · '+job.cwd);verification(node,job);button('View task and checks',()=>showTask(job.id),node);if(job.changeId&&job.status!=='running')button('Review restore point',()=>previewRestore(job),node);}status.textContent='Restore affects only files changed during that task. Later edits to those files block undo. Binary or large originals need Git recovery. Git commits and staged changes are preserved.';}
  async function previewRestore(job,recovery=false){const preview=await api.changes({jobId:job.id,action:'restore-preview',recovery});body.replaceChildren(el('h3','Restore pre-task working files?'),el('p',preview.cwd),el('pre',preview.files.join('\n')||'No files to restore.'));page='Restore';title.textContent='Review checkpoint';if(preview.limited)body.append(el('p','Partial checkpoint: only captured files are listed. Use Git to review other project files.'));
    if(preview.files.length)button('Restore these files',async()=>{const result=await api.changes({jobId:job.id,action:'restore',token:preview.token,recovery});status.textContent=result.message;body.replaceChildren(el('p',result.message));button('Undo this restore',()=>previewRestore(job,true));});button('Cancel',()=>open('Checkpoints'));status.textContent='A recovery snapshot is created before restoring. Unrelated files are left in place.';}
  async function showApprovals(){pending=await api.approvals();renderApprovals();}
  function renderApprovals(){body.replaceChildren();for(const request of pending){const node=row(request.provider+' · '+request.title,'Task: '+request.jobId);node.append(el('pre',request.details));const answer=request.textInput?field('Your answer','textarea',node):null;if(answer)answer.maxLength=10000;for(const choice of request.choices)button(choice,async()=>{pending=await api.approvals({action:'answer',id:request.id,choice,text:answer?.value});if(page==='Approvals')renderApprovals();},node);}if(!pending.length)body.append(el('p','No requests waiting for approval.'));status.textContent='Each answer applies to this request only. Stopping a task dismisses its pending approvals. Existing provider permission rules still apply.';}
  api.onApprovals(value=>{pending=value;alertButton.hidden=!pending.length;alertButton.textContent=pending.length+' approval'+(pending.length===1?'':'s')+' needed';if(modal.open&&page==='Approvals')renderApprovals();});
  api.onQueue(state=>{queueState=state;if(modal.open&&page==='Queue'){const list=body.querySelector('#queueItems');if(list)renderQueueItems(list,state);const label=body.querySelector('#queueState');if(label)label.textContent=state.paused?'Queue paused.':'Queue running.';}});
  api.onJobs(patch=>{for(const job of patch.upsert||[]){const i=jobRows.findIndex(row=>row.id===job.id);if(i<0)jobRows.push(job);else jobRows[i]=job;}jobRows=jobRows.filter(row=>!(patch.removed||[]).includes(row.id));});
  void api.approvals().then(value=>{pending=value;alertButton.hidden=!value.length;}).catch(()=>{});
  window.atlasWorkbench={open};
})();
