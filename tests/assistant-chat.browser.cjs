const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-assistant-browser-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-assistant-browser-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const first = '11111111-1111-4111-8111-111111111111',
  second = '22222222-2222-4222-8222-222222222222';
const chats = [
  {
    id: first,
    provider: 'atlas',
    title: 'Pong project',
    workspaceName: 'Pong workspace',
    workspaceId: 'project-pong',
    cwd: 'C:/Projects/Pong',
    updatedAt: 2,
    turns: Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: (i % 2 ? 'Saved answer ' : 'Old question ') + i + '\n' + 'Project details\n'.repeat(5),
      at: 1700000000000 + i * 1000,
      ...(i === 0 ? { attachments: [{ id: 'image', name: 'Screenshot.png', type: 'image', size: 10 }] } : {}),
    })),
  },
  {
    id: second,
    provider: 'atlas',
    title: 'Website project',
    cwd: 'C:/Projects/Website',
    updatedAt: 1,
    turns: [
      { role: 'user', content: 'Website question' },
      { role: 'assistant', content: 'Website answer' },
    ],
  },
];
const native = Array.from({ length: 125 }, (_, i) => ({
  id: i.toString(16).padStart(64, '0'),
  sessionId: '11111111-1111-4111-8111-' + String(i).padStart(12, '0'),
  title: 'Native chat ' + i,
  provider: i % 2 ? 'claude' : 'codex',
  workspaceName: i % 2 ? 'Claude workspace' : 'Codex workspace',
  workspaceId: i % 2 ? 'claude-project' : 'codex-project',
  cwd: 'C:/Projects/Native',
  turnCount: null,
  nativeName: true,
  importable: i !== 0,
  internal: i === 124,
}));
const mock = `localStorage.setItem('atlas.activeConversation','${first}');localStorage.setItem('atlas.colab.chats.v1','{}');window.savedChats=${JSON.stringify(chats)};window.nativeChats=${JSON.stringify(native)};window.jobCallbacks=[];window.textCallbacks=[];window.savedJobs=[];window.importRequests=[];window.performImport=async req=>{importRequests.push(req);const chats=req.chats.map(selected=>({...nativeChats.find(chat=>chat.id===selected.id),turns:Array.from({length:122},(_,i)=>({role:i%2?'assistant':'user',content:i===0?'Imported first message '+ 'z'.repeat(13000):'Imported message '+i}))}));if(req.destination==='colab')return{chats};const results=chats.map(chat=>{let saved=savedChats.find(row=>row.importSource===chat.id);if(!saved){saved={...chat,id:crypto.randomUUID(),importSource:chat.id,provider:'atlas'};savedChats.push(saved);}return saved;});return{chats:results,imported:results.length,skipped:0};};
window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows',autoListenReplies:false}),home:async()=>'C:/Projects',latestConversation:async()=>savedChats[0],jobs:async()=>savedJobs,onJobs:fn=>jobCallbacks.push(fn),onResponseText:fn=>textCallbacks.push(fn),providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'source',currentVersion:'test'}),chatMetadata:async()=>({}),historyList:async()=>savedChats.map(chat=>({...chat,turnCount:chat.turns.length,searchText:chat.turns.map(turn=>turn.content).join(' ')})),historyRead:async req=>{const chat=savedChats.find(chat=>chat.id===req.id);if(!chat)throw Error('No saved conversation');return structuredClone(chat);},attachmentPreview:async()=>({preview:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRqoAAAAASUVORK5CYII='}),importChats:async req=>req.action==='scan'?{chats:nativeChats,workspaces:[],errors:[]}:req.action==='preview'?{turns:[{role:'user',content:'Native preview'}]}:await performImport(req),chat:async req=>{
 window.lastChatRequest=req;let chat=savedChats.find(chat=>chat.id===req.conversationId);if(!chat){chat={id:req.conversationId,provider:'atlas',title:req.prompt,cwd:req.cwd,updatedAt:Date.now(),turns:[]};savedChats.push(chat);}const job={id:req.requestId,conversationId:chat.id,cwd:req.cwd,prompt:req.prompt,status:'running',events:[{kind:'command',text:'node --version',provider:'codex',status:'completed',exitCode:0}],startedAt:Date.now()};savedJobs.push(job);for(const fn of jobCallbacks)fn({upsert:[job],removed:[]});for(const fn of textCallbacks)fn({requestId:req.requestId,text:'Streamed reply'});await new Promise(r=>setTimeout(r,40));chat.turns.push({role:'user',content:req.prompt},{role:'assistant',content:'Completed reply for '+req.prompt,provider:'codex'});chat.updatedAt=Date.now();job.status='completed';job.result={output:'Completed reply for '+req.prompt};for(const fn of jobCallbacks)fn({upsert:[job],removed:[]});return{output:job.result.output,provider:'codex',conversationId:chat.id};}
},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;
const timeout = setTimeout(() => {
  console.error('Assistant browser test timed out');
  app.exit(1);
}, 45000);
timeout.unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__test-mock.js')
        return new Response(mock, { headers: { 'Content-Type': 'application/javascript;charset=utf-8' } });
      if (!file)
        return new Response(
          fs
            .readFileSync(path.join(root, 'index.html'), 'utf8')
            .replace('<head>', '<head><script src="/__test-mock.js"></script>'),
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
        );
      return new Response(fs.readFileSync(path.join(root, file)), {
        headers: { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'application/javascript;charset=utf-8' },
      });
    });
    win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (_event, _level, message) => {
      if (/Uncaught|Error:/.test(message)) console.log('Renderer: ' + message);
    });
    await win.loadURL('atlas://app/');
    await win.webContents
      .executeJavaScript(`(async()=>{await atlasAssistant.ready;await new Promise(r=>setTimeout(r,60));if(document.querySelectorAll('.assistant-past .assistant-turn').length!==40)throw Error('Full saved timeline missing');if(!document.querySelector('.assistant-past .attachment-thumbnail'))throw Error('Saved image preview missing');if(document.querySelectorAll('.assistant-chat-item').length!==2)throw Error('Chat sidebar missing');
  const projectFilter=document.querySelector('[aria-label="Filter Assistant chats by workspace"]');projectFilter.value='project-pong';projectFilter.dispatchEvent(new Event('change'));if(document.querySelectorAll('.assistant-chat-item').length!==1||!document.querySelector('.assistant-chat-item').textContent.includes('Pong workspace'))throw Error('Imported project filter or name missing');projectFilter.value='';projectFilter.dispatchEvent(new Event('change'));const transcript=document.querySelector('#response');transcript.scrollTop=210;transcript.dispatchEvent(new Event('scroll'));await atlasAssistant.open('${second}');await atlasAssistant.open('${first}');if(transcript.scrollTop!==210)throw Error('Reading position lost');const find=document.querySelector('.assistant-chat-find input');find.value='Old question 0';find.dispatchEvent(new Event('input'));if(document.querySelector('.assistant-chat-find span').textContent!=='1 / 1')throw Error('Old message search missing');
  const effort=document.querySelector('#assistantEffort');effort.value='2';effort.dispatchEvent(new Event('input'));await sendMessage('First follow-up');if(lastChatRequest.effort!=='high')throw Error('Effort control no longer forwarded');if(document.querySelectorAll('.assistant-past .assistant-turn').length!==40||!document.querySelector('#output').textContent.includes('Completed reply for First follow-up'))throw Error('First follow-up replaced history');await sendMessage('Second follow-up');if(document.querySelectorAll('.assistant-past .assistant-turn').length!==42||!document.querySelector('.assistant-past').textContent.includes('First follow-up'))throw Error('Second follow-up lost first pair');
  for(const selector of ['#mic','#assistantEffort','.attachment-add','.assistant-task-work','#setFolder','#readFullAnswer'])if(!document.querySelector(selector))throw Error('Existing control missing: '+selector);
  await atlasWorkspace.importChats();const dialog=document.querySelector('.import-dialog');if(dialog.querySelectorAll('input[type=checkbox]').length!==61)throw Error('Import paging or internal filter missing');if(!dialog.textContent.includes('Native chat 0')||dialog.textContent.includes('Native chat 124'))throw Error('Named chat list wrong');const nativeSelect=dialog.querySelector('input[aria-label="Import Native chat 0"]');if(!nativeSelect.disabled)throw Error('Unavailable transcript selectable');const workspace=dialog.querySelector('[aria-label="Filter import workspace"]');workspace.value='claude|claude-project';workspace.dispatchEvent(new Event('change'));if(!dialog.textContent.includes('Claude workspace')||dialog.textContent.includes('Native chat 0'))throw Error('Workspace filter failed');dialog.querySelector('#workspaceDialogClose').click();
 })()`);
    for (const [width, height] of [
      [1280, 800],
      [800, 600],
      [640, 600],
    ]) {
      win.setContentSize(width, height);
      for (let attempt = 0; attempt < 40; attempt++) {
        const size = await win.webContents.executeJavaScript('[innerWidth,innerHeight]');
        if (size[0] === width && size[1] === height) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const bounds = await win.webContents.executeJavaScript(
        `(()=>({outerHeight:document.documentElement.scrollHeight,outerWidth:document.documentElement.scrollWidth,transcript:document.querySelector('#response').clientHeight,composerBottom:document.querySelector('.composer').getBoundingClientRect().bottom}))()`,
      );
      assert(
        bounds.outerHeight <= height + 1 &&
          bounds.outerWidth <= width + 1 &&
          bounds.transcript > 35 &&
          bounds.composerBottom <= height + 1,
        JSON.stringify(bounds),
      );
    }
    win.setContentSize(1280, 800);
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await win.webContents.executeJavaScript('innerWidth')) === 1280) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await win.webContents.executeJavaScript(`(async()=>{
  const toggles=document.querySelectorAll('.chat-list-toggle'),chats=document.querySelector('.assistant-chats'),width=()=>document.querySelector('.assistant-workspace>.core').clientWidth,before=width();
  if(toggles.length!==2||!document.querySelector('.colab-chats>.chat-list-toggle'))throw Error('Assistant and Colab need a list toggle');
  toggles[0].click();await new Promise(r=>setTimeout(r,60));
  if(!document.body.classList.contains('chat-lists-hidden')||chats.clientWidth>50||width()<before+100||localStorage.getItem('atlas.chatListsHidden')!=='1'||toggles[1].getAttribute('aria-expanded')!=='false')throw Error('Hiding the chat list did not widen the chat and persist');
  if(document.querySelector('.assistant-chat-list').offsetParent)throw Error('Hidden chat list still shows chats');
  toggles[0].click();await new Promise(r=>setTimeout(r,60));
  if(document.body.classList.contains('chat-lists-hidden')||chats.clientWidth<150||localStorage.getItem('atlas.chatListsHidden')!=='0')throw Error('Showing the chat list again failed');
  const setItem=Storage.prototype.setItem;
  try{
    Storage.prototype.setItem=function(key,value){if(key==='atlas.chatListsHidden')throw new DOMException('Storage full','QuotaExceededError');return setItem.call(this,key,value);};
    toggles[0].click();
    if(!document.body.classList.contains('chat-lists-hidden')||toggles[1].getAttribute('aria-expanded')!=='false')throw Error('Storage failure prevented hiding the chat lists');
    toggles[1].click();
    if(document.body.classList.contains('chat-lists-hidden')||toggles[0].getAttribute('aria-expanded')!=='true')throw Error('Storage failure prevented showing the chat lists');
  }finally{Storage.prototype.setItem=setItem;}
  const input=document.querySelector('#form').getBoundingClientRect(),mic=document.querySelector('#mic').getBoundingClientRect(),send=document.querySelector('#send').getBoundingClientRect();
  if(mic.top<input.bottom||Math.abs(mic.top-send.top)>12)throw Error('Voice and Send should share one row under the message box');
  [...document.querySelectorAll('.composer .shell-composer-tools button')].find(button=>button.textContent==='Options').click();await new Promise(r=>setTimeout(r,20));if(!document.querySelector('.assistant-effort-button').getClientRects().length)throw Error('Effort options are unreachable');document.querySelector('#assistantMessageOptions').hidePopover();
  const [idle,working]=document.querySelectorAll('.sigil img');
  if(!idle?.complete||!idle.naturalWidth||!working?.naturalWidth)throw Error('The Beacon logo did not load');
  const visible=()=>[idle,working].map(img=>getComputedStyle(img).visibility);
  if(visible().join()!=='visible,hidden')throw Error('The Beacon should be white at rest');
  const jobs=jobList;renderJobs([...jobs,{id:'beacon-check',status:'running',events:[]}]);
  if(visible().join()!=='hidden,visible')throw Error('The Beacon should turn orange while a job runs');
  renderJobs(jobs);
  if(visible().join()!=='visible,hidden')throw Error('The Beacon should turn white when work ends');
  for(const name of ['assistant','colab'])if(!document.querySelector('[data-chat-workspace="'+name+'"] svg path'))throw Error(name+' menu icon missing');
 })()`);
    fs.writeFileSync(path.join(temp, 'assistant-chat.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{atlasAssistant.newChat();if(document.querySelectorAll('.assistant-past .assistant-turn').length||conversationId)throw Error('New chat retained old conversation');await atlasAssistant.open('${first}');if(document.querySelectorAll('.assistant-past .assistant-turn').length!==44)throw Error('Saved follow-ups missing');await atlasColab.ready;atlasColab.selectChat(atlasColab.current().id);if(!document.querySelector('.assistant-workspace').hidden)throw Error('Assistant did not hide for Colab');atlasColab.selectAssistant();if(document.querySelector('.assistant-workspace').hidden)throw Error('Assistant did not return');})()`,
    );
    await win.webContents.executeJavaScript(`(async()=>{
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Import UI did not finish');};
  const begin=async()=>{document.querySelector('#settingsDialog').showModal();[...document.querySelectorAll('#settingsDialog button')].find(button=>button.textContent==='Import chats from Codex or Claude').click();await wait(()=>document.querySelector('[aria-label="Import Native chat 1"]'));if(document.querySelector('#settingsDialog').open)throw Error('Settings blocked imported workspace');};
  const single=()=>{const check=document.querySelector('[aria-label="Import Native chat 1"]');check.closest('section').querySelectorAll('button')[1].click();};
  const choose=label=>[...document.querySelector('.import-destination').querySelectorAll('button')].find(button=>button.textContent===label).click();
  await begin();single();await wait(()=>document.querySelector('.import-destination')?.open);choose('Cancel');await wait(()=>!document.querySelector('.import-destination'));if(importRequests.length)throw Error('Cancelled import wrote data');
  const check=document.querySelector('[aria-label="Import Native chat 1"]');check.checked=true;check.dispatchEvent(new Event('change'));[...document.querySelector('.import-actions').querySelectorAll('button')].find(button=>button.textContent.startsWith('Import selected')).click();await wait(()=>document.querySelector('.import-destination')?.open);choose('Colab');await wait(()=>!document.querySelector('.import-dialog').open);
  const imported=atlasColab.current();if(document.body.dataset.workspace!=='colab'||imported.messages.length!==122||imported.messages[0].content.length<13000||imported.title!=='Native chat 1')throw Error('Colab import did not open full named conversation');if(savedChats.length!==2)throw Error('Colab import leaked into Assistant');
  await atlasColabHistory.flush();const stored=await atlasColabHistory.load({chats:[],selected:''});if(stored.chats.find(chat=>chat.id===imported.id)?.messages.length!==122)throw Error('Colab import not persisted');
  await begin();single();await wait(()=>document.querySelector('.import-destination')?.open);choose('Colab');await wait(()=>!document.querySelector('.import-dialog').open);if(atlasColab.current().id!==imported.id||atlasColab.current().messages.length!==122)throw Error('Colab reimport duplicated chat');
  await begin();single();await wait(()=>document.querySelector('.import-destination')?.open);choose('Assistant');await wait(()=>!document.querySelector('.import-dialog').open);await wait(()=>document.querySelectorAll('.assistant-past .assistant-turn').length===122);if(document.body.dataset.workspace!=='assistant'||savedChats.length!==3||!document.querySelector('.assistant-chat-heading').textContent.includes('Native chat 1'))throw Error('Assistant import did not open full named conversation');
  const insert=atlasColabHistory.insert;atlasColabHistory.insert=async()=>{throw Error('Mock disk failure');};const count=atlasColab.history().length;try{await atlasColab.importChats([{provider:'codex',id:'failed-import',turns:[{role:'user',content:'Fail safely'}]}]);throw Error('Storage failure was swallowed');}catch(error){if(error.message!=='Mock disk failure')throw error;}finally{atlasColabHistory.insert=insert;}if(atlasColab.history().length!==count)throw Error('Failed import changed chat list');
 })()`);
    console.log(
      'PASS: Settings import destination prompt, cancellation, batch Colab import, independent Assistant import, 122 complete messages, persistence, deduplication and storage failure.',
    );
    console.log(
      'PASS: Assistant timeline/sidebar, image previews, streaming follow-ups, preserved controls, scroll/search, native-name import paging/workspaces, new chat, Colab switching, hiding the chat lists, one control row, the Beacon and menu icons and three viewport sizes.',
    );
    console.log('Preview: ' + path.join(temp, 'assistant-chat.png'));
    await win.webContents.executeJavaScript(`(async()=>{
      settings.wakeWordEnabled=false;settings.autoListenReplies=false;
      const original=navigator.mediaDevices.getUserMedia;let captures=0;
      navigator.mediaDevices.getUserMedia=async()=>{captures++;throw Error('No real microphone in this test');};
      try { await startInterruptionMonitor();await startWakeListener();if(captures)throw Error('Automatic listening ignored microphone opt-out'); }
      finally { navigator.mediaDevices.getUserMedia=original; }
      let saved;atlas.saveSettings=async value=>(saved=structuredClone(value));
      settings.wakeWordEnabled=true;settings.autoListenReplies=true;
      document.querySelector('#wakeWordEnabled').checked=true;document.querySelector('#autoListenReplies').checked=true;
      document.querySelector('#wakeIndicator').click();await new Promise(r=>setTimeout(r,20));
      if(saved?.wakeWordEnabled!==false||saved?.autoListenReplies!==false)throw Error('Pause did not persist both listening opt-outs');
      if(document.querySelector('#wakeWordEnabled').checked||document.querySelector('#autoListenReplies').checked)throw Error('Pause left stale microphone checkboxes that could re-enable listening on save');
    })()`);
    await win.webContents.executeJavaScript(`localStorage.setItem('atlas.chatListsHidden','1')`);
    const normalMock = mock;
    protocol.unhandle('atlas');
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__blocked-mock.js')
        return new Response(
          normalMock +
            `
          const getItem=Storage.prototype.getItem;
          Storage.prototype.getItem=function(key){if(key==='atlas.chatListsHidden')throw new DOMException('Storage blocked','SecurityError');return getItem.call(this,key);};`,
          { headers: { 'Content-Type': 'application/javascript;charset=utf-8' } },
        );
      return new Response(
        file
          ? fs.readFileSync(path.join(root, file))
          : fs
              .readFileSync(path.join(root, 'index.html'), 'utf8')
              .replace('<head>', '<head><script src="/__blocked-mock.js"></script>'),
        {
          headers: {
            'Content-Type': file?.endsWith('.css')
              ? 'text/css'
              : file
                ? 'application/javascript;charset=utf-8'
                : 'text/html;charset=utf-8',
          },
        },
      );
    });
    await win.webContents.session.clearCache();
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(`(async()=>{
      if(!window.atlasAssistant)throw Error('Blocked chat-list storage prevented Assistant startup');
      await atlasAssistant.ready;
      if(document.body.classList.contains('chat-lists-hidden')||document.querySelectorAll('.assistant-past .assistant-turn').length!==40)throw Error('Blocked storage did not fall back to visible lists and load history: '+JSON.stringify({hidden:document.body.classList.contains('chat-lists-hidden'),turns:document.querySelectorAll('.assistant-past .assistant-turn').length,conversationId,selected:localStorage.getItem('atlas.activeConversation')}));
      document.querySelector('.chat-list-toggle').click();
      if(!document.body.classList.contains('chat-lists-hidden'))throw Error('Blocked reads prevented list toggling');
    })()`);
    console.log('PASS: Chat lists work when preference reads are blocked or writes exceed storage quota.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    win?.destroy();
    app.exit(process.exitCode || 0);
  }
});
