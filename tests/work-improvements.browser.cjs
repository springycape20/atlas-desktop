const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { offscreenFrame } = require('./fixtures/offscreen-frame.cjs');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-work-ui-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const mock = `
window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
window.__calls=[];window.__listeners=[];
window.__profiles=[{id:'demo',name:'Demo project',cwd:'C:/Projects/Demo',instructions:'Use tests',effort:'medium'}];
window.__jobs=[{id:'run',prompt:'Build a useful feature with a very long original request '.repeat(10),cwd:'C:/Projects/Demo',status:'running',startedAt:30},{id:'fail',prompt:'Fix the broken test',cwd:'C:/Trials/fix',projectFolder:'C:/Projects/Demo',status:'failed',startedAt:20,verification:{status:'failed',results:[{command:'npm test',status:'failed',exitCode:1,output:'test failed'}]}},{id:'done',prompt:'Update help text',cwd:'C:/Projects/Demo',status:'completed',startedAt:10,conversationId:'saved-chat',verification:{status:'passed',results:[{command:'npm test',status:'passed',exitCode:0}]},result:{output:'Updated help text.'}}];
window.atlas=new Proxy({getSettings:async()=>({speakResponses:false,wakeWordEnabled:false}),home:async()=>'C:/Projects/Demo',latestConversation:async()=>null,providerAuthStatus:async()=>({}),discoverModels:async()=>({}),chatMetadata:async()=>({}),projects:async r=>{if(r?.action==='save'){__calls.push(['save-profile',r]);return r.profile;}return structuredClone(__profiles)},historyList:async()=>[{id:'saved-chat',provider:'atlas',title:'Saved conversation',cwd:'C:/Projects/Demo',updatedAt:4}],historyRead:async()=>({id:'saved-chat',title:'Saved conversation',cwd:'C:/Projects/Demo',turns:[]}),onJobs:f=>{__listeners.push(f);return()=>{}},jobs:async r=>{if(r?.action==='rename'){__calls.push(['rename',r]);__jobs.find(j=>j.id===r.id).title=r.title;}return structuredClone(__jobs)},taskOpen:async id=>{__calls.push(['open-task',id])},taskQueue:async()=>({items:[],paused:true,concurrency:1}),workflows:async()=>[],approvals:async()=>[],providerHealth:async()=>[],projectFile:async r=>r.action==='editor-read'?{path:r.path,text:'hello',version:'v1'}:[],contextPreview:async()=>({sections:[],note:'Local preview'}),changes:async()=>({files:[],added:0,removed:0}),onResponseText:()=>()=>{}},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
const timer = setTimeout(() => {
  console.error('Work UI timeout');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (req) => {
      const name = new URL(req.url).pathname.slice(1);
      if (name === '__mock.js') return new Response(mock, { headers: { 'Content-Type': 'application/javascript' } });
      const bytes = fs.readFileSync(path.join(root, name || 'index.html'));
      return new Response(
        name ? bytes : bytes.toString().replace('<head>', '<head><script src="/__mock.js"></script>'),
        {
          headers: {
            'Content-Type': !name
              ? 'text/html'
              : name.endsWith('.css')
                ? 'text/css'
                : name.endsWith('.png')
                  ? 'image/png'
                  : 'application/javascript',
          },
        },
      );
    });
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 900,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    const run = async (source) => {
      try {
        return await win.webContents.executeJavaScript(`(async()=>{${source}})()`);
      } catch (error) {
        console.error('Failed scenario:', source.slice(0, 1000));
        throw error;
      }
    };
    await run(
      `await new Promise(r=>setTimeout(r,400));await atlasProjectHome.open();if(!atlasPower.body.textContent.includes('Demo project'))throw Error('Project home absent');if(!atlasPower.body.textContent.includes('Needs attention · 1'))throw Error('Isolated task missing');if(!atlasPower.body.textContent.includes('Saved conversation'))throw Error('Recent chat missing');if(__calls.length)throw Error('Opening project home has side effects');`,
    );
    const out = path.join(root, 'dist', 'work-improvements');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'project-home.png'), (await offscreenFrame(win)).toPNG());
    await run(
      `atlasPower.close();await new Promise(r=>setTimeout(r,20));await atlasUi.open('tasks','Running');if(atlasPower.currentView()!=='Task centre')throw Error('Running alias is stale');const list=atlasPower.body.querySelector('[aria-live]');if(list.children.length!==1||!list.querySelector('[data-task-id=run]'))throw Error('Active includes history');const click=label=>{const b=[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent.startsWith(label));if(!b)throw Error('Missing button '+label+' in '+atlasPower.body.textContent);b.click();};click('Needs attention');await new Promise(r=>setTimeout(r,30));if(!list.querySelector('[data-task-id=fail]')||list.querySelector('[data-task-id=done]'))throw Error('Attention filter');click('History');await new Promise(r=>setTimeout(r,30));if(!list.querySelector('[data-task-id=done]'))throw Error('History missing');const input=list.querySelector('[aria-label="Task title"]');input.value='Readable title';click('Save title');await new Promise(r=>setTimeout(r,30));if(!__calls.some(c=>c[0]==='rename'&&c[1].title==='Readable title'))throw Error('Rename not saved');click('Open task');await new Promise(r=>setTimeout(r,30));if(!__calls.some(c=>c[0]==='open-task'&&c[1]==='done'))throw Error('Task action wrong');`,
    );
    await run(`
    atlasPower.setSelection('assistant',{...atlasPower.selection('assistant'),vault:true});
    if(!document.querySelector('.composer-context-strip').textContent.includes('preview required'))throw Error('Missing vault review indicator');
    atlas.vaultReferences=async()=>({results:[{path:'decision.md',line:1,excerpt:'A selected decision'}]});
    await atlasReferences.open('assistant','note','decision');
    const add=[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent==='Add reference');add.click();await new Promise(r=>setTimeout(r,50));
    if(atlasPower.selection('assistant').vaultPaths[0]!=='decision.md')throw Error('Note selection lost');
    if(atlasPower.selection('assistant').vaultPreview)throw Error('Reference bypassed preview');
    if(!document.getElementById('prompt').value.includes('decision.md'))throw Error('Reference absent from draft');
    atlasPower.close();
    atlas.contextPreview=async()=>({sections:[],vaultPreview:'fresh',vaultIndexed:{indexed:1,results:[]},note:'review'});
    await atlasPower.show('Context');await new Promise(r=>setTimeout(r,50));
    if(!atlasPower.selection('assistant').vaultPreview)throw Error('Preview not saved');
    const input=document.getElementById('prompt');input.value+=' edited';input.dispatchEvent(new Event('input',{bubbles:true}));
    if(atlasPower.selection('assistant').vaultPreview)throw Error('Edited prompt retained receipt');
    atlasPower.close();
  `);
    await run(`
    document.getElementById('prompt').value='';
    await atlasOutcomes.open('done');
    if(!atlasPower.body.textContent.includes('What changed — model report')||!atlasPower.body.textContent.includes('npm test · passed · exit 0'))throw Error('Completion evidence absent');
    [...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent==='Save as reusable workflow').click();await new Promise(r=>setTimeout(r,50));
    if(document.getElementById('workflow-checks').value!=='npm test'||document.getElementById('workflow-task').value!=='Update help text')throw Error('Workflow seed missing');
    const field=document.getElementById('workflow-task');field.value='Update {{filename}}';field.dispatchEvent(new Event('change'));if(!atlasPower.body.querySelector('[aria-label="Workflow input filename"]'))throw Error('Workflow input missing');
    atlasPower.close();await atlasProjectEditor.open({cwd:'C:/Projects/Demo'},'help.js');
    const editor=document.querySelector('[aria-label="File contents"]');editor.setSelectionRange(0,5);
    [...document.querySelectorAll('.project-editor-panel button')].find(b=>b.textContent==='Ask ATLAS about selection').click();await new Promise(r=>setTimeout(r,40));
    if(!document.getElementById('prompt').value.includes('hello'))throw Error('Editor selection missing from draft');
    if(__calls.some(c=>c[0]==='chat'))throw Error('A review action sent a provider request');
    document.querySelector('.project-editor-panel').hidden=true;document.body.classList.remove('project-editor-open');
  `);
    await run(`
    atlas.setupAssistant=async()=>({cwd:'C:/Projects/Demo',name:'Demo',types:['Node.js'],checks:['npm test'],runs:['npm run dev'],installs:['npm ci'],prerequisites:[{name:'node',available:true},{name:'npm',available:false}],note:'No commands executed.'});
    await atlasSetupAssistant.open();const click=label=>[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent===label).click();click('Detect project setup');await new Promise(r=>setTimeout(r,40));if(!atlasPower.body.textContent.includes('npm · missing'))throw Error('Setup prerequisites absent');click('Save reviewed project profile');await new Promise(r=>setTimeout(r,40));if(!__calls.some(c=>c[0]==='save-profile'))throw Error('Setup profile not saved');atlasPower.close();
    await atlasProjectEditor.open({cwd:'C:/Projects/Demo'},'help.js');
    const editor=document.querySelector('[aria-label="File contents"]');editor.value='unsaved draft';editor.dispatchEvent(new Event('input',{bubbles:true}));
    if(!document.querySelector('.connected-workbench').contains(editor))throw Error('Editor not in connected workbench');
    atlasDock.activate('preview');atlasDock.activate('editor');if(editor.value!=='unsaved draft')throw Error('Switching dock panels lost unsaved text');
    atlasDock.hide();
  `);
    await run(`
      document.getElementById('prompt').value='';
      await atlasAssistant.open('saved-chat');
      const failed=__jobs.find(j=>j.id==='fail');failed.conversationId='saved-chat';failed.provider='claude';failed.startedAt=100;failed.error='Account cooldown';
      atlas.providerHealth=async()=>[{provider:'claude',available:false,retryAt:Date.now()+60000,estimated:true}];
      __listeners.forEach(f=>f({removed:[],upsert:[failed]}));await new Promise(r=>setTimeout(r,100));
      const host=document.querySelector('[aria-label="Provider status for assistant"]');if(!host.textContent.includes('estimated retry')||!host.textContent.includes('Account cooldown'))throw Error('Actionable failure absent');
      [...host.querySelectorAll('button')].find(b=>b.textContent==='Prepare retry with Codex').click();await new Promise(r=>setTimeout(r,40));
      if(!document.getElementById('prompt').value.startsWith('Use Codex.'))throw Error('Retry did not prepare provider-specific draft');
      const retained=document.getElementById('prompt').value;[...host.querySelectorAll('button')].find(b=>b.textContent==='Prepare retry with Claude').click();await new Promise(r=>setTimeout(r,30));if(document.getElementById('prompt').value!==retained)throw Error('Retry overwrote draft');
      let actions=[];atlas.semanticSolutions=async r=>{actions.push(r);if(r.action==='preview')return {token:'preview',documents:[{title:'Updater repair',text:'Fix restart'}],characters:11,note:'Local preview'};if(r.action==='build')return {id:'index',count:1};if(r.action==='search')return {results:[{id:'done',title:'Updater repair',text:'Fix restart'}],stale:0,note:'Similarity'};return {};};
      await atlasPower.show('Semantic solution search');const click=label=>[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent===label).click();
      click('Build reviewed local index');await new Promise(r=>setTimeout(r,30));if(actions.length)throw Error('Unreviewed embedding request');
      click('Preview tasks to index');await new Promise(r=>setTimeout(r,30));atlasPower.body.querySelector('input[type=checkbox]').checked=true;atlasPower.body.querySelector('[aria-label="Installed embedding model"]').value='embed';click('Build reviewed local index');await new Promise(r=>setTimeout(r,30));if(!actions.some(r=>r.action==='build'&&r.consent))throw Error('Reviewed index did not build');
      atlasPower.body.querySelector('[aria-label="Describe the solution you need"]').value='restart problem';click('Search by meaning');await new Promise(r=>setTimeout(r,30));if(!atlasPower.body.textContent.includes('Updater repair'))throw Error('Semantic result absent');
      click('Clear all semantic indexes');await new Promise(r=>setTimeout(r,30));if(!actions.some(r=>r.action==='clear'))throw Error('Semantic clear absent');atlasPower.close();
    `);
    await run(`
      const originalJobs=atlas.jobs;
      atlas.jobs=async r=>{if(['archive','unarchive','dismiss-attention','restore-attention'].includes(r?.action)){atlasTaskExperience.organize(__jobs.find(j=>j.id===r.id),r.action);return structuredClone(__jobs);}return originalJobs(r);};
      await atlasPower.show('Task centre');
      const click=async label=>{[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent.startsWith(label)).click();await new Promise(r=>setTimeout(r,40));};
      await click('Needs attention');await click('Dismiss from attention');
      if(atlasPower.body.querySelector('[data-task-id=fail]'))throw Error('Dismiss did not remove attention');
      await click('History');const task=atlasPower.body.querySelector('[data-task-id=fail]');
      [...task.querySelectorAll('button')].find(b=>b.textContent==='Archive task').click();await new Promise(r=>setTimeout(r,40));
      await click('Archived');if(!atlasPower.body.querySelector('[data-task-id=fail]'))throw Error('Archive view missing');
      await click('Unarchive task');await click('History');await click('Restore attention');
      await atlasOutcomes.open('done');if(!atlasPower.body.querySelector('[aria-label="Task handoff"]').textContent.includes('1 checks passed'))throw Error('Handoff evidence summary absent');
      atlasPower.close();
      atlas.workflows=async()=>[{id:'workflow-help',name:'Demo help workflow',task:'Update Demo help'}];
      atlas.searchWork=async()=>[];atlas.historyList=async()=>[];atlas.memory=async()=>[];
      await atlasPower.show('Search all work');const query=atlasPower.body.querySelector('input');query.value='Demo';
      const search=async()=>{[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent==='Search local work').click();await new Promise(r=>setTimeout(r,50));};
      await search();if(!atlasPower.body.textContent.includes('Demo help workflow')||!atlasPower.body.textContent.includes('Open project'))throw Error('Project/workflow search absent');
      atlasPower.body.querySelector('[aria-label="Search result type"]').value='workflow';await search();
      if(atlasPower.body.textContent.includes('Open project')||!atlasPower.body.textContent.includes('Review workflow'))throw Error('Search type filter failed');
      atlasPower.body.querySelector('[aria-label="Search project scope"]').value='C:/Projects/Demo';await search();
      if(atlasPower.body.textContent.includes('Review workflow'))throw Error('Unscoped workflow leaked project filter');
      atlasPower.close();
      const calls=[];atlas.projectWorkbench=async r=>{calls.push(r);return {id:'checkpoint',gitCommit:'abc'};};
      const check=document.querySelector('[aria-label="Create Git checkpoint before next assistant task"]');check.checked=true;
      await atlasTaskStart.prepare('assistant','C:/Projects/Demo');await atlasTaskStart.prepare('assistant','C:/Projects/Demo');
      if(calls.length!==1||calls[0].action!=='capture-git')throw Error('Checkpoint is not one-shot');
      check.checked=true;atlas.projectWorkbench=async()=>{throw Error('No Git repository')};
      let rejected=false;try{await atlasTaskStart.prepare('assistant','C:/Projects/Demo')}catch{rejected=true;}
      if(!rejected||!check.checked)throw Error('Failed checkpoint lost user choice');check.checked=false;
      document.getElementById('prompt').value='Saved unsent draft';document.getElementById('prompt').dispatchEvent(new Event('input',{bubbles:true}));
      await atlasProjectEditor.open({cwd:'C:/Projects/Demo'},'help.js');
      const editor=document.querySelector('[aria-label="File contents"]');editor.value='Saved editor draft';editor.dispatchEvent(new Event('input'));
      atlas.livePreview=async()=>({url:'http://127.0.0.1:5173/demo?secret=omit#omit'});
      await atlasPower.show('Saved workspace');atlasPower.body.querySelector('input[type=checkbox]').checked=true;
      [...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent==='Save current workspace').click();await new Promise(r=>setTimeout(r,50));
      const saved=JSON.parse(localStorage.getItem('atlas.saved-workspaces.v1'))[0];
      if(saved.draft!=='Saved unsent draft'||saved.editor.drafts[0].text!=='Saved editor draft'||saved.url.includes('secret'))throw Error('Session snapshot incomplete or URL secret retained');
      atlasPower.close();
    `);
    const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.reload();
    await reloaded;
    await run(
      `await new Promise(r=>setTimeout(r,500));document.querySelector('[data-chat-workspace=assistant]').click();if(document.getElementById('prompt').value!=='Saved unsent draft')throw Error('Automatic draft recovery failed across reload');await atlasPower.show('Saved workspace');const restore=[...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent==='Restore working session');restore.click();await new Promise(r=>setTimeout(r,100));if(document.getElementById('prompt').value!=='Saved unsent draft')throw Error('Saved chat draft not restored across reload');if(document.querySelector('[aria-label="File contents"]').value!=='Saved editor draft')throw Error('Saved editor draft not restored across reload');`,
    );
    await run(`
      await atlasPower.show('Saved workspace');
      document.getElementById('prompt').value='Keep current draft';
      [...atlasPower.body.querySelectorAll('button')].find(b=>b.textContent==='Restore working session').click();await new Promise(r=>setTimeout(r,40));
      if(document.getElementById('prompt').value!=='Keep current draft'||!atlasPower.status.textContent.includes('Save or clear'))throw Error('Session overwrote a conflicting current draft');
      document.getElementById('prompt').value='';
      const area=document.querySelector('[aria-label="File contents"]');area.value='hello';area.dispatchEvent(new Event('input'));
      const read=atlas.projectFile;atlas.projectFile=async r=>r.action==='editor-read'?{path:r.path,text:'new disk contents',version:'v2'}:read(r);
      const failures=await atlasProjectEditor.restore({cwd:'C:/Projects/Demo'},JSON.parse(localStorage.getItem('atlas.saved-workspaces.v1'))[0].editor);
      if(!failures.some(text=>text.includes('disk contents changed'))||area.value!=='hello')throw Error('Changed disk version did not protect saved editor draft');
      atlas.projectFile=read;atlasDock.hide();await atlasPower.show('Saved workspace');
    `);
    for (const width of [1440, 768, 390]) {
      win.setContentSize(width, 900);
      await run(
        `await new Promise(r=>setTimeout(r,40));if(document.documentElement.scrollWidth>innerWidth+2)throw Error('Saved workspace horizontal overflow');`,
      );
      fs.writeFileSync(path.join(out, 'saved-workspace-' + width + '.png'), (await offscreenFrame(win)).toPNG());
    }
    win.setContentSize(1440, 900);
    let inspection = await run(
      "return '<html><head>'+document.head.innerHTML+[...document.querySelectorAll('style')].map(s=>s.outerHTML).join('')+'<style>body{margin:0;padding:16px;min-height:100vh}.power-dialog{display:block;position:relative;inset:auto;margin:0 auto;max-height:none}.power-body{max-height:none}</style></head><body class=\"atlas-ui\"><main>'+atlasPower.dialog.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>'",
    );
    inspection = inspection
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(
        /<link\b[^>]*href="([^"]+\.css)"[^>]*>/gi,
        (_tag, href) => '<style>' + fs.readFileSync(path.join(root, href.replace(/^\//, '')), 'utf8') + '</style>',
      );
    fs.writeFileSync(path.join(out, 'saved-workspace-inspect.html'), '<!doctype html>' + inspection);
    await run('atlasPower.close();document.getElementById("prompt").value="";atlasDock.activate("editor");');
    fs.writeFileSync(path.join(out, 'workbench.png'), (await offscreenFrame(win)).toPNG());
    await run('atlasDock.hide();');
    await run(`
      document.querySelector('[data-chat-workspace=assistant]').click();
      const output=document.getElementById('output');output.hidden=false;document.getElementById('response').classList.add('show');
      atlasThinking.start(output);
      const first=output.textContent;
      if(!first.trim()||!output.querySelector('.atlas-thinking-spinner'))throw Error('Thinking state absent');
      const letters=output.querySelectorAll('.atlas-thinking-phrase > span');
      if(getComputedStyle(letters[0]).animationDelay===getComputedStyle(letters[1]).animationDelay)throw Error('Wave has no letter stagger');
      const wave=letters[0].getAnimations()[0];wave.pause();wave.currentTime=440;
      const blue=getComputedStyle(letters[0]).color.match(/[0-9]+/g).map(Number);
      if(blue[2]<=blue[0])throw Error('Wave highlight is not blue');
      await new Promise(r=>setTimeout(r,4200));
      if(output.textContent===first)throw Error('Thinking phrases did not cycle');
      output.textContent='Actual provider response';await new Promise(r=>setTimeout(r,4200));
      if(output.textContent!=='Actual provider response')throw Error('Thinking timer overwrote provider output');
      atlasThinking.start(output);renderAnswer('Completed response');await new Promise(r=>setTimeout(r,20));
      if(output.querySelector('.atlas-thinking')||!output.textContent.includes('Completed response'))throw Error('Final response retained loading state');
      const interval=window.setInterval;let advance;
      window.setInterval=(callback,delay)=>{advance=callback;return interval(callback,delay);};
      atlasThinking.start(output);window.setInterval=interval;
      const seen=new Set([output.textContent]);let previous=output.textContent;
      for(let i=0;i<40;i++){advance();if(output.textContent===previous)throw Error('Shuffle repeated the previous phrase');seen.add(output.textContent);previous=output.textContent;}
      if(seen.size!==20)throw Error('Shuffle did not cover all twenty phrases');
      renderAnswer('Completed response');
    `);
    await run(`
      const fence=String.fromCharCode(96).repeat(3),raw='First line'+String.fromCharCode(10)+String.fromCharCode(10)+'<literal tags> & quotes'+String.fromCharCode(10);
      const output=document.getElementById('output');renderAnswer('Intro'+fence+'text'+String.fromCharCode(10)+raw+fence+'After');
      const box=output.querySelector('.answer-code-box'),copy=box.querySelector('button');box.scrollIntoView();
      let copied='';const clipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
      copy.focus();if(getComputedStyle(copy).opacity!=='1')throw Error('Copy icon unavailable to keyboard focus');
      copy.click();await new Promise(r=>setTimeout(r,30));
      if(copied!==raw||copy.title!=='Copied')throw Error('Copy lost exact embedded text or confirmation');
      if(box.querySelector('pre').textContent!==raw||box.querySelector('literal'))throw Error('Copy box changed or interpreted reference text');
      navigator.clipboard.writeText=async()=>{throw Error('Clipboard denied')};copy.click();await new Promise(r=>setTimeout(r,30));
      if(copy.disabled||!copy.title.includes('failed'))throw Error('Copy failure did not remain retryable');
      if(clipboard)Object.defineProperty(navigator,'clipboard',clipboard);else delete navigator.clipboard;
    `);
    await run(`
      atlasPower.close();document.querySelector('[data-chat-workspace=assistant]').click();
      const input=document.getElementById('prompt'), originalRead=atlas.historyRead;
      atlas.historyRead=async req=>({id:req.id,cwd:'C:/Projects/Demo',title:'Draft fixture',provider:'atlas',turns:[]});
      await atlasAssistant.open('draft-first-chat');input.value='Recover first draft';input.dispatchEvent(new Event('input',{bubbles:true}));
      await atlasAssistant.open('draft-second-chat');if(input.value)throw Error('Draft leaked into another chat');
      input.value='Separate second draft';input.dispatchEvent(new Event('input',{bubbles:true}));
      await atlasAssistant.open('draft-first-chat');if(input.value!=='Recover first draft')throw Error('Navigation lost draft');
      const key=atlasDraftRecovery.identity();atlas.chat=async()=>({output:'Fixture reply',provider:'local'});await sendMessage(input.value);
      const store=atlasQol.createDraftStore(localStorage);if(store.get(key))throw Error('Sent draft remained in automatic recovery');
      atlas.historyRead=originalRead;
      const output=document.getElementById('output');atlasResponseErrors.render(output,Error('OAuth session expired: private technical log'));
      const details=output.querySelector('details');if(details.open||!output.textContent.includes('Provider sign-in needs attention')||!details.textContent.includes('private technical log'))throw Error('Readable error lost detail or expanded it by default');
      const fence=String.fromCharCode(96).repeat(3);renderAnswer(fence+'javascript'+String.fromCharCode(10)+Array(100).fill('const example = true;').join(String.fromCharCode(10))+fence);
      const box=output.querySelector('.answer-code-box'),header=box.querySelector('.answer-code-header'),scroller=box.querySelector('.answer-code-scroll'),expand=box.querySelector('.answer-code-expand');box.scrollIntoView();
      if(!header.textContent.includes('javascript'))throw Error('Code language label absent');
      expand.click();if(!box.classList.contains('expanded')||expand.getAttribute('aria-expanded')!=='true')throw Error('Long text did not expand');expand.click();
      scroller.scrollTop=100;await new Promise(r=>setTimeout(r,20));if(Math.abs(header.getBoundingClientRect().top-scroller.getBoundingClientRect().top)>3)throw Error('Copy toolbar is not sticky inside the box');
      const statuses=[];atlasChatBadges.label('assistant','saved-chat');
      const pending={id:'badge-task',conversationId:'saved-chat',provider:'codex',status:'running',startedAt:Date.now()};
      __listeners.forEach(f=>f({removed:[],upsert:[pending]}));
      if(!document.querySelector('.assistant-chat-item .chat-work-badge')?.textContent.includes('Running'))throw Error('Background task badge missing');
      pending.status='completed';pending.endedAt=Date.now()+10;__listeners.forEach(f=>f({removed:[],upsert:[pending]}));await new Promise(r=>setTimeout(r,40));
      if(![...document.querySelectorAll('.chat-work-badge')].some(e=>e.textContent==='New result'))throw Error('Unseen result badge missing');
    `);
    assert.deepEqual(await run('return __errors'), []);
    console.log(
      'PASS: Work improvements plus task cleanup, handoff evidence, project/workflow search filters, one-shot checkpoint choices, saved session reload, conflicting-draft/disk protection and three workspace widths.',
    );
    clearTimeout(timer);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
