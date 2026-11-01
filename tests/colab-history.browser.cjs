const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-colab-browser-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-colab-browser-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const chats = Array.from({ length: 14 }, (_, index) => ({
  id: 'chat-' + index,
  title: 'Project discussion ' + index,
  cwd: index % 2 ? 'C:/Projects/Website' : 'C:/Projects/Game',
  projectName: index % 2 ? 'Website' : 'Game',
  createdAt: index + 1,
  updatedAt: index + 1,
  draft: '',
  messages: Array.from({ length: 72 }, (_, turn) => ({
    id: 'message-' + index + '-' + turn,
    role: turn % 2 ? 'assistant' : 'user',
    content:
      (turn % 2 ? 'Result ' : 'Question ') +
      turn +
      ' for project ' +
      index +
      '\n' +
      'Earlier project details.\n'.repeat(6),
    at: 1700000000000 + turn * 1000,
  })),
  busy: false,
}));
chats[0].messages[2].id = chats[0].messages[0].id; // Imported duplicate IDs must not hide either message.
const mock = `if(!localStorage.getItem('colabBrowserSeed')){localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({ chats, selected: chats[0].id })}));localStorage.setItem('colabBrowserSeed','1');}
window.preparedResult={ready:false};window.collabCalls=[];window.atlas=new Proxy({collabReport:async()=>({provider:'codex',phase:'build',output:'Saved full stage report'}),prepareProject:async()=>preparedResult,collaborate:async request=>{collabCalls.push(request);return{id:'mock-direct-job'};},getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows'}),home:async()=>'C:/Projects',latestConversation:async()=>null,jobs:async()=>[],onJobs:()=>{},onCollaborationStatus:fn=>window.colabStatus=fn,providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'source',currentVersion:'test'}),chatMetadata:async()=>({})},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;
const timeout = setTimeout(() => {
  console.error('Colab browser test timed out');
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
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(`(async()=>{
   await atlasColab.ready;if(atlasColab.history().length!==14)throw Error('Legacy chats were pruned');atlasColab.selectChat('chat-0');if(atlasColab.current().messages.length!==72)throw Error('Legacy messages were pruned');
   const transcript=document.querySelector('#colabTranscript');transcript.scrollTop=190;transcript.dispatchEvent(new Event('scroll'));const top=transcript.scrollTop;
   if(transcript.querySelectorAll('.colab-message').length!==72)throw Error('Duplicate imported IDs hid a message');const firstMessage=transcript.querySelector('.colab-message');
   colabStatus({id:'new-run',chatId:'chat-0',status:'Reviewing'});if(transcript.scrollTop!==top)throw Error('Progress moved reader');
   for(let step=0;step<40;step++)colabStatus({id:'new-run',chatId:'chat-0',status:'Progress '+step});if(transcript.querySelector('.colab-message')!==firstMessage)throw Error('Progress rebuilt an unchanged message');
   colabStatus({id:'new-run',chatId:'chat-0',result:'New saved final result'});if(transcript.scrollTop!==top)throw Error('Result moved reader');
   if(document.querySelector('#colabLatest').hidden)throw Error('Latest button missing');
   const find=document.querySelector('#colabFind');find.value='Question 0 for project 0';find.dispatchEvent(new Event('input'));if(document.querySelector('#colabMatches').textContent!=='1 / 1')throw Error('Old message search failed');
   const compares=[...transcript.querySelectorAll('.colab-message-actions button')].filter(button=>button.textContent==='Compare');compares[0].click();[...transcript.querySelectorAll('.colab-message-actions button')].find(button=>button.textContent==='Compare').click();document.querySelector('#colabCompare').click();
   const comparison=document.querySelector('.colab-compare');if(!comparison.open||comparison.querySelectorAll('pre').length!==2||!comparison.textContent.includes('Result 1 for project 0'))throw Error('Comparison failed');comparison.close();
   find.value='';find.dispatchEvent(new Event('input'));transcript.scrollTop=230;transcript.dispatchEvent(new Event('scroll'));atlasColab.selectChat('chat-1');atlasColab.selectChat('chat-0');if(transcript.scrollTop!==230)throw Error('Chat scroll was not restored');
   atlasColab.selectAssistant();atlasColab.refreshMessages();atlasColab.selectChat('chat-0');if(transcript.scrollTop!==230)throw Error('Workspace switching lost reading position');
   const projects=document.querySelector('#colabProjectFilter');projects.value='c:/projects/game';projects.dispatchEvent(new Event('change'));if(document.querySelectorAll('.colab-chat-item').length!==7)throw Error('Project filter failed');
   atlasColab.applyProfile({id:'web-profile',name:'Website',cwd:'C:/Projects/Website',effort:'medium'});if(atlasColab.current().cwd!=='C:/Projects/Website'||atlasColab.history().find(chat=>chat.id==='chat-0').turns.length!==73)throw Error('Switching project rewrote previous conversation');
   atlasColab.selectChat('chat-0');await atlasColabHistory.flush();
 })()`);
    await win.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasColab.ready;atlasColab.selectChat('chat-0');if(atlasColab.history().length!==14||atlasColab.current().messages.length!==73||!atlasColab.current().messages[0].content.startsWith('Question 0')||atlasColab.current().messages.at(-1).content!=='New saved final result')throw Error('IndexedDB reload lost chat history');})()`,
    );
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
        `(()=>{const transcript=document.querySelector('#colabTranscript'),form=document.querySelector('#colabForm');return {height:transcript.clientHeight,formBottom:form.getBoundingClientRect().bottom,outerHeight:document.documentElement.scrollHeight,outerWidth:document.documentElement.scrollWidth,width:innerWidth,heightLimit:innerHeight};})()`,
      );
      assert(
        bounds.height > 35 &&
          bounds.formBottom <= height + 1 &&
          bounds.outerHeight <= height + 1 &&
          bounds.outerWidth <= width + 1,
        JSON.stringify(bounds),
      );
      const tinyText = await win.webContents.executeJavaScript(`(()=>{
        const panel=document.querySelector('.colab-workspace');
        return [...panel.querySelectorAll('*')].filter(element=>
          element.getClientRects().length && [...element.childNodes].some(node=>node.nodeType===3&&node.textContent.trim()) &&
          parseFloat(getComputedStyle(element).fontSize)<11
        ).map(element=>({text:element.textContent.slice(0,60),size:getComputedStyle(element).fontSize}));
      })()`);
      assert.deepEqual(tinyText, [], 'Colab text must remain readable at ' + width + 'px: ' + JSON.stringify(tinyText));
      fs.writeFileSync(path.join(temp, 'colab-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    win.setContentSize(1280, 800);
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.writeFileSync(path.join(temp, 'colab-history.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
  atlasColab.selectChat('chat-2');const task=document.querySelector('#colabTask'),form=document.querySelector('#colabForm');task.value='Continue my uncommitted work';task.dispatchEvent(new Event('input'));const before=atlasColab.current().messages.length;
  await form.onsubmit({preventDefault(){}});if(collabCalls.length||atlasColab.current().messages.length!==before||task.value!=='Continue my uncommitted work')throw Error('Cancel lost the task or started work');
  const change=(id,value)=>{const field=document.querySelector('#'+id);if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new Event(field.tagName==='TEXTAREA'?'input':'change'));};change('colabPreset','economy');change('colabTokenWarning','5000');change('colabAdaptiveEffort',true);change('colabReuseChecks',true);change('colabCriteria','Works offline');change('colabOutOfScope','No cloud');
  preparedResult={ready:true,isolated:false};await form.onsubmit({preventDefault(){}});if(collabCalls[0].preset!=='economy'||collabCalls[0].tokenWarning!==5000||!collabCalls[0].adaptiveEffort||!collabCalls[0].reuseChecks||collabCalls[0].brief.criteria!=='Works offline')throw Error('Efficiency controls not forwarded');if(collabCalls.length!==1||collabCalls[0].isolated!==false||atlasColab.current().isolated!==false||document.querySelector('#colabIsolated').checked)throw Error('Direct editing choice was not used');if(!document.querySelector('#colabEditingHint').textContent.includes('Direct editing'))throw Error('Editing mode not explained');
  colabStatus({id:'mock-direct-job',chatId:'chat-2',error:'Mock interrupted task'});await atlasColabHistory.flush();const saved=await atlasColabHistory.load({chats:[],selected:''});if(saved.chats.find(chat=>chat.id==='chat-2').isolated!==false)throw Error('Direct choice not saved');
 })()`);
    await win.webContents.executeJavaScript(
      `(async()=>{atlasColab.selectChat('chat-3');const usage=atlasEfficiency.usageSummary([{provider:'codex',phase:'build',output:'Done',usage:{inputTokens:20,outputTokens:5},metrics:{promptCharacters:400,legacyPromptCharacters:2000}},{provider:'claude',phase:'review',output:'Approved',metrics:{promptCharacters:400,legacyPromptCharacters:2000}}]);colabStatus({id:'usage-job',chatId:'chat-3',usage,result:'Completed with partial usage',verification:{level:'unverified',label:'Unverified',reason:'No ATLAS checks ran, so only the reviewer accepted this work.'},checkOffer:{cwd:'C:/Projects/Cart',checks:['npm run test','npm run lint'],configured:false,profileName:''}});const badge=[...document.querySelectorAll('.colab-message')].at(-1).querySelector('.verify-badge');if(!badge||badge.dataset.level!=='unverified'||badge.textContent!=='Unverified'||!badge.title.includes('only the reviewer'))throw Error('Unverified badge missing');const offer=[...document.querySelectorAll('.colab-message')].at(-1).querySelector('.check-offer');if(!offer||offer.querySelectorAll('input[type=checkbox]:checked').length!==2||!offer.textContent.includes('C:/Projects/Cart'))throw Error('Check offer missing');window.checkOfferCalls=[];window.atlas.checkOffer=async request=>{window.checkOfferCalls.push(request);return {answer:request.answer};};offer.querySelectorAll('input[type=checkbox]')[1].click();[...offer.querySelectorAll('button')].find(button=>button.textContent.startsWith("Don't ask")).click();await new Promise(resolve=>setTimeout(resolve,30));if(window.checkOfferCalls[0]?.answer!=='decline'||window.checkOfferCalls[0].cwd!=='C:/Projects/Cart'||document.querySelector('.check-offer'))throw Error('Declining the offer did not answer and hide it');const details=document.querySelector('.colab-efficiency');if(details.hidden||!details.textContent.includes('estimated')||!details.textContent.includes('codex')||!details.textContent.includes('claude'))throw Error('Stage usage sources not shown');details.open=true;details.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,30));const report=document.querySelector('[aria-label="Saved Colab stage report"]');if(!report.open||!report.textContent.includes('Saved full stage report'))throw Error('Stage report missing');report.querySelector('button').click();})()`,
    );
    for (const [width, height] of [
      [1280, 800],
      [640, 600],
    ]) {
      win.setContentSize(width, height);
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await win.webContents.executeJavaScript('innerWidth')) === width) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const size = await win.webContents.executeJavaScript(
        '({bottom:document.querySelector("#colabForm").getBoundingClientRect().bottom,outer:document.documentElement.scrollHeight})',
      );
      assert(size.bottom <= height + 1 && size.outer <= height + 1, JSON.stringify(size));
    }
    await win.webContents.executeJavaScript(`(async()=>{
   const state={windowsAvailable:true,runtimeInstalled:false,integrations:[],preset:{id:'windows',name:'Windows computer control',command:'uvx',args:['windows-mcp','serve'],enabled:true}};const calls=[];
   atlas.integrations=async request=>{calls.push(request);if(request?.action==='save')state.integrations.push({...request.integration,status:'Stopped',tools:0});if(request?.action==='install')state.runtimeInstalled=true;if(request?.action==='start'){state.integrations[0].status='Ready';state.integrations[0].tools=7;}return state;};
   document.querySelector('#colabTools').click();await new Promise(resolve=>setTimeout(resolve,40));const dialog=document.querySelector('.productivity-dialog');if(!dialog.open||!dialog.textContent.includes('Add Windows control'))throw Error('Colab Tools menu missing');
   const click=async text=>{const button=[...dialog.querySelectorAll('button')].find(node=>node.textContent===text);if(!button)throw Error('Missing '+text);button.click();await new Promise(resolve=>setTimeout(resolve,40));};
   await click('Add Windows control');await click('Install runtime');await click('Start / check');if(!dialog.textContent.includes('Ready · 7 tools')||!calls.some(row=>row?.action==='start'))throw Error('Tool readiness missing');dialog.close();
 })()`);
    console.log('PASS: Colab Tools menu adds the Windows preset, installs its runtime and checks readiness.');
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(resolve=>setTimeout(resolve,40)),rows=()=>document.querySelectorAll('.colab-chat-item').length;
      const project=document.querySelector('#colabProjectFilter');project.value='';project.dispatchEvent(new Event('change'));await wait();
      const all=rows(),id=atlasColab.current().id;
      if(document.querySelectorAll('[id]').length!==new Set([...document.querySelectorAll('[id]')].map(node=>node.id)).size)throw Error('Duplicate ids: '+[...document.querySelectorAll('[id]')].map(node=>node.id).filter((name,index,all)=>all.indexOf(name)!==index).join(', '));
      document.querySelector('#colabMoveFolder').click();await wait();
      document.querySelector('[aria-label="Folder name"]').value='Work';
      [...document.querySelectorAll('.workspace-dialog button')].find(node=>node.textContent==='Save folder').click();await wait();
      if(atlasColab.current().folder!=='Work'||document.querySelector('.workspace-dialog').open)throw Error('Colab folder not saved');
      document.querySelector('#colabArchive').click();await wait();
      if(document.querySelector('#colabArchive').textContent!=='Unarchive'||rows()!==all)throw Error('An open archived chat should stay listed');
      await atlasColabHistory.flush();window.colabChatId=id;
    })()`);
    await win.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript(`(async()=>{
      await atlasColab.ready;
      const wait=()=>new Promise(resolve=>setTimeout(resolve,40)),rows=()=>document.querySelectorAll('.colab-chat-item').length;
      const chat=atlasColab.history().find(chat=>chat.archived);
      if(!chat||chat.folder!=='Work')throw Error('Colab folder and archive state lost on reload');
      const other=atlasColab.history().find(row=>row.id!==chat.id);atlasColab.selectChat(other.id);await wait();
      const project=document.querySelector('#colabProjectFilter');project.value='';project.dispatchEvent(new Event('change'));await wait();
      const filter=document.querySelector('#colabFolderFilter'),before=rows();
      if(before!==atlasColab.history().length-1)throw Error('Archived chat still in the Colab list: '+before);
      filter.value='Work';filter.dispatchEvent(new Event('change'));await wait();if(rows()!==0)throw Error('A folder lists archived chats');
      filter.value=atlasChatRender.ARCHIVED;filter.dispatchEvent(new Event('change'));await wait();if(rows()!==1)throw Error('Archived filter wrong');
      document.querySelector('.colab-chat-item').click();await wait();
      document.querySelector('#colabArchive').click();await wait();
      filter.value='';filter.dispatchEvent(new Event('change'));await wait();
      if(rows()!==atlasColab.history().length)throw Error('Unarchive did not restore the Colab chat');
    })()`);
    console.log('PASS: Colab folders and archive survive a reload, filter the list and restore.');
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(resolve=>setTimeout(resolve,60)),
        act=(article,text)=>[...article.querySelectorAll('button')].find(node=>node.textContent===text),
        row=atlasColab.history().filter(chat=>chat.turns.some(turn=>turn.role==='user')&&chat.turns.some(turn=>turn.role==='assistant'&&!turn.error)).sort((a,b)=>b.turns.length-a.turns.length)[0];
      atlasColab.selectChat(row.id);await wait();
      const source=atlasColab.current(),saved=JSON.stringify(source.messages),count=atlasColab.history().length,
        nodes=()=>[...document.querySelectorAll('.colab-transcript .colab-message')],
        userAt=source.messages.findLastIndex(message=>message.role==='user');
      if(nodes().length!==source.messages.length)throw Error('Showing '+nodes().length+' of '+source.messages.length);
      const answer=nodes().find(node=>act(node,'Copy result'));
      if(!act(answer,'Branch from here')||act(answer,'Edit and resend'))throw Error('Colab answer actions wrong');
      act(nodes()[userAt],'Branch from here').click();await wait();
      let branch=atlasColab.current();
      if(branch.id===source.id||branch.messages.length!==userAt+1||!branch.title.startsWith('Branch: '))throw Error('Colab branch wrong');
      if(branch.workspaceId||branch.lastJob||branch.busy)throw Error('Colab branch kept job state');
      atlasColab.selectChat(source.id);await wait();
      act(nodes()[userAt],'Edit and resend').click();await wait();
      branch=atlasColab.current();
      if(branch.messages.length!==userAt||branch.draft!==source.messages[userAt].content)throw Error('Colab edit wrong');
      if(document.querySelector('#colabTask').value!==branch.draft)throw Error('Colab composer not filled');
      if(atlasColab.history().length!==count+2)throw Error('Expected two new chats');
      atlasColab.selectChat(source.id);await wait();
      if(JSON.stringify(atlasColab.current().messages)!==saved)throw Error('The original Colab chat changed');
    })()`);
    console.log('PASS: Colab edit and resend and branch from here keep the original chat.');
    console.log(
      'PASS: Efficiency controls, optional brief/budget/check reuse, mixed reported/estimated stage usage, saved report viewer and responsive layout.',
    );
    console.log(
      'PASS: Dirty-project cancellation preserves draft and messages, explicit direct editing starts the task and persists its editing mode.',
    );
    console.log(
      'PASS: IndexedDB migration/reload, 14 chats and 73 turns, project selection, old-message search, comparison, live-update scroll preservation and three viewport sizes.',
    );
    console.log('Preview: ' + path.join(temp, 'colab-history.png'));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    win?.destroy();
    app.exit(process.exitCode || 0);
  }
});
