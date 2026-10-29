const { app, BrowserWindow, protocol } = require('electron'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createProjectFiles } = require('../project-files');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-file-ui-')),
  project = path.join(temp, 'project');
fs.mkdirSync(project);
fs.copyFileSync(path.join(root, 'docs/images/assistant.png'), path.join(project, 'preview.png'));
fs.writeFileSync(
  path.join(project, 'README.md'),
  '# Demo project\n\n<script>window.injected=true</script>\nRead-only source.',
);
fs.writeFileSync(
  path.join(project, 'style.css'),
  'body{font:18px system-ui;margin:32px;background:#f1f4f5;color:#17343c}h1{color:rgb(20,64,70)}img{max-width:95%;max-height:260px;object-fit:contain}',
);
fs.writeFileSync(
  path.join(project, 'index.html'),
  '<html><head><link rel="stylesheet" href="style.css"></head><body onload="window.unsafePreview=true"><h1>Project dashboard</h1><p>Local project preview</p><img src="preview.png"><script>window.unsafePreview=true;parent.postMessage("unsafe", "*")</script><iframe src="https://example.invalid"></iframe><a href="https://example.invalid">Remote link</a></body></html>',
);
const answer =
  'Here is your project.\n\n![Project screenshot](preview.png)\n\n[Read the project file](README.md) · [Open page](index.html)\n\n`README.md`\n\n![Remote image](https://example.invalid/track.png)';
const chat = {
  id: 'assistant-preview',
  title: 'Project output preview',
  cwd: project,
  turns: [
    { role: 'user', content: 'Show the project' },
    { role: 'assistant', content: answer },
  ],
};
const mock = `localStorage.setItem('atlas.colab.chats.v1',JSON.stringify({chats:[{id:'colab-preview',title:'Colab project output',cwd:${JSON.stringify(project)},messages:[{id:'preview-message',role:'assistant',content:${JSON.stringify(answer)}}]}],selected:'colab-preview'}));window.fileUiErrors=[];window.addEventListener('error',e=>fileUiErrors.push(e.message));window.atlas=new Proxy({projectFile:async request=>{const response=await fetch('/__file?request='+encodeURIComponent(JSON.stringify(request)));const value=await response.json();if(value.error)throw Error(value.error);return value;},getSettings:async()=>({speakResponses:false,wakeWordEnabled:false}),home:async()=>${JSON.stringify(project)},latestConversation:async()=>null,historyList:async()=>[${JSON.stringify({ ...chat, turns: undefined, provider: 'atlas', turnCount: 2 })}],historyRead:async()=>(${JSON.stringify(chat)}),jobs:async()=>[],taskQueue:async()=>({items:[],paused:true}),providerAuthStatus:async()=>({}),discoverModels:async()=>({}),chatMetadata:async()=>({})},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
app.disableHardwareAcceleration();
new (require('node:vm').Script)(mock);
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const files = createProjectFiles(),
  calls = [];
const editor = require('../project-editor').createProjectEditor({ files });
let win;
const timeout = setTimeout(() => {
  console.error('Project-file UI timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', async (request) => {
      const url = new URL(request.url),
        file = url.pathname.slice(1);
      if (file === '__mock.js')
        return new Response(
          mock +
            `window.atlas.projectWorkbench=async request=>request.action==='health'?{name:'Demo project',types:['Node.js'],checks:['npm test'],results:[{name:'Node.js',status:'available',detail:'Fixture tool'}],note:'No scripts executed.'}:request.action==='list'?[]:{id:'checkpoint'};window.atlas.livePreview=async request=>request.action==='capture'?{attachments:[{id:'visual-screenshot',name:'preview.png',type:'image',size:100}],selected:{selector:'button#target',text:'Change this'},cwd:${JSON.stringify(project)}}:{open:true,running:false,output:'src/app.ts:12:3 example compile error'};`,
          { headers: { 'Content-Type': 'application/javascript' } },
        );
      if (file === '__file') {
        try {
          const data = JSON.parse(url.searchParams.get('request'));
          calls.push(data);
          const value = /^(editor-|replace-)/.test(data.action)
            ? await editor.action(project, data)
            : data.action === 'list'
              ? await files.list(project, data.path)
              : data.action === 'search'
                ? await files.search(project, data.query, data.contents)
                : data.action === 'attach'
                  ? [{ id: 'attached-project', name: path.basename(data.path), type: 'text', size: 100 }]
                  : data.action === 'reveal'
                    ? { revealed: true }
                    : await files.read(project, data.path);
          return Response.json(value);
        } catch (error) {
          return Response.json({ error: error.message });
        }
      }
      const content = fs.readFileSync(path.join(root, file || 'index.html'));
      return new Response(
        file ? content : content.toString().replace('<head>', '<head><script src="/__mock.js"></script>'),
        {
          headers: {
            'Content-Type': !file
              ? 'text/html'
              : file.endsWith('.css')
                ? 'text/css'
                : file.endsWith('.png')
                  ? 'image/png'
                  : 'application/javascript',
          },
        },
      );
    });
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    const run = async (source) => {
      try {
        return await win.webContents.executeJavaScript(source);
      } catch (error) {
        throw Error(source.slice(0, 300) + ': ' + error.message);
      }
    };
    const wait = async (source) => {
      for (let i = 0; i < 150; i++) {
        if (await run(source)) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error('UI did not reach: ' + source);
    };
    await run(
      `(async()=>{await atlasAssistant.ready;await atlasColab.ready;await atlasAssistant.open('assistant-preview');})()`,
    );
    await wait(`Boolean(document.querySelector('.assistant-turn .project-output-card img')?.naturalWidth)`);
    assert.equal(
      await run(
        `(()=>{const target=document.createElement('div');renderAnswer('Version '+String.fromCharCode(96)+'0.9.0'+String.fromCharCode(96),target);return target.querySelectorAll('.project-file-link').length;})()`,
      ),
      0,
    );
    assert.equal(await run(`document.querySelectorAll('img[src^="http"]').length`), 0);
    const shots = path.join(root, '.handover', 'project-file-previews');
    fs.mkdirSync(shots, { recursive: true });
    fs.writeFileSync(path.join(shots, 'chat-output.png'), (await win.webContents.capturePage()).toPNG());
    await run(
      `[...document.querySelectorAll('.assistant-turn .project-file-link')].find(item=>item.textContent==='Read the project file').click()`,
    );
    await wait(
      `document.querySelector('.project-file-source')?.textContent.includes('<script>window.injected=true</script>')`,
    );
    assert.equal(await run('window.injected'), undefined);
    await run(
      `[...document.querySelectorAll('.project-file-tools button')].find(item=>item.textContent==='Attach to next message').click()`,
    );
    await wait(`document.querySelector('.project-file-status').textContent.includes('Attached to the next')`);
    assert(calls.some((call) => call.action === 'attach'));
    fs.writeFileSync(path.join(shots, 'source-preview.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('.project-file-dialog').close();new Promise(r=>setTimeout(r,30))`);
    await run(
      `[...document.querySelectorAll('.assistant-turn .project-file-link')].find(item=>item.textContent==='Open page').click()`,
    );
    await wait(`Boolean(document.querySelector('.project-file-content iframe'))`);
    let frame;
    for (let attempt = 0; attempt < 150 && !frame; attempt++) {
      frame = win.webContents.mainFrame.frames.find((item) => item.url === 'about:srcdoc');
      if (!frame) await new Promise((r) => setTimeout(r, 20));
    }
    assert(frame, 'Static page frame did not load');
    const page = await run(`document.querySelector('.project-file-content iframe').srcdoc`);
    assert.match(page, /Project dashboard/);
    assert.match(page, /rgb\(20,64,70\)/);
    assert.match(page, /data:image\/png;base64,/);
    assert.doesNotMatch(page, /<script[\s>]|<iframe[\s>]|onload=|href="https:/i);
    assert.equal(await run('window.unsafePreview'), undefined);
    await assert.rejects(frame.executeJavaScript('true'), /Script not run|blocked/i);
    assert.equal(await run(`document.querySelector('.project-file-content iframe').getAttribute('sandbox')`), '');
    fs.writeFileSync(path.join(shots, 'page-preview.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('.project-file-dialog').close();new Promise(r=>setTimeout(r,30))`);
    await run(`atlasColab.selectChat('colab-preview')`);
    await wait(`Boolean(document.querySelector('.colab-message .project-output-card img')?.naturalWidth)`);
    fs.writeFileSync(path.join(shots, 'colab-output.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasProjectFiles.browse({scope:'colab',cwd:${JSON.stringify(project)},chatId:'colab-preview'})`);
    await wait(`document.querySelector('.project-file-list')?.textContent.includes('README.md')`);
    await new Promise((r) => setTimeout(r, 120));
    assert(
      await run(`document.querySelector('.project-file-dialog').getBoundingClientRect().height<650`),
      'Small project folders should not stretch the dialog across the whole window.',
    );
    fs.writeFileSync(path.join(shots, 'file-browser.png'), (await win.webContents.capturePage()).toPNG());
    await run(
      `[...document.querySelectorAll('.project-file-tools button')].find(item=>item.textContent==='Keep beside chat for dragging').click()`,
    );
    await wait(`document.querySelector('.project-file-dialog[open]')?.dataset.docked==='true'`);
    assert.equal(await run(`document.querySelector('.project-file-dialog').matches(':modal')`), false);
    await run(
      `(()=>{const transfer=new DataTransfer();const file=[...document.querySelectorAll('.project-file-list button')].find(item=>item.textContent==='README.md');file.dispatchEvent(new DragEvent('dragstart',{dataTransfer:transfer,bubbles:true}));document.querySelector('.colab-composer').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));})()`,
    );
    await wait(`document.querySelector('.colab-composer .attachment-chips').textContent.includes('README.md')`);
    await run(
      `document.querySelector('.project-file-tools input').value='Read-only source';[...document.querySelectorAll('.project-file-tools button')].find(item=>item.textContent==='Search file contents').click()`,
    );
    await wait(`document.querySelector('.project-file-list')?.textContent.includes('README.md:4')`);
    const inspection = await run(
      `(()=>{const copy=document.querySelector('.project-file-dialog').cloneNode(true);const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS project file browser</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8'))}+'</style><style>body{margin:0;padding:16px;background:#0c171e;min-height:0;height:auto;overflow:auto}.project-file-dialog{position:relative;inset:auto;margin:0 auto;max-width:100%;height:calc(100vh - 32px);box-sizing:border-box}</style></head><body class="atlas-ui"><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';})()`,
    );
    fs.writeFileSync(path.join(shots, 'inspect.html'), inspection);
    for (const [width, height] of [
      [768, 800],
      [640, 700],
    ]) {
      win.setContentSize(width, height);
      await new Promise((r) => setTimeout(r, 80));
      const bounds = await run(
        `({width:innerWidth,dialog:document.querySelector('.project-file-dialog').getBoundingClientRect().right,overflow:document.documentElement.scrollWidth})`,
      );
      assert(bounds.dialog <= bounds.width + 1 && bounds.overflow <= bounds.width + 1, JSON.stringify(bounds));
    }
    await run(`document.querySelector('.project-file-dialog').close();new Promise(r=>setTimeout(r,30))`);
    win.setContentSize(1280, 900);
    await run(`atlasProjectEditor.open({cwd:${JSON.stringify(project)}},'README.md')`);
    await wait(`document.querySelector('.project-editor-panel:not([hidden])')`);
    await run(
      `(()=>{const input=document.querySelector('.project-editor-panel textarea');input.value+='\\nEdited locally';input.dispatchEvent(new Event('input'));[...document.querySelectorAll('.project-editor-panel button')].find(item=>item.textContent==='Save').click()})()`,
    );
    await wait(`document.querySelector('.project-editor-panel [role=status]').textContent.includes('Saved README.md')`);
    assert(fs.readFileSync(path.join(project, 'README.md'), 'utf8').includes('Edited locally'));
    await run(`atlasProjectEditor.open({cwd:${JSON.stringify(project)}},'style.css')`);
    assert.equal(await run(`document.querySelectorAll('.project-editor-panel [role=tab]').length`), 2);
    await run(
      `[...document.querySelectorAll('.project-editor-panel button')].find(item=>item.textContent==='Syntax preview').click()`,
    );
    await wait(`document.querySelector('.project-editor-panel pre .token')`);
    for (const [width, height] of [
      [1280, 900],
      [768, 800],
      [640, 700],
    ]) {
      win.setContentSize(width, height);
      await new Promise((r) => setTimeout(r, 80));
      assert(
        await run(
          `(()=>{const r=document.querySelector('.project-editor-panel').getBoundingClientRect();return r.right<=innerWidth+1&&r.left>=0&&r.bottom<=innerHeight+1})()`,
        ),
      );
      fs.writeFileSync(path.join(shots, 'editor-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    fs.writeFileSync(
      path.join(shots, 'editor-inspect.html'),
      await run(
        `(()=>{const styles=[...document.querySelectorAll('style')].map(x=>x.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS project editor</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'project-editor.css'), 'utf8'))}+'</style><style>body{margin:0;padding:16px;background:#111;color:#eee}.project-editor-panel{position:relative;inset:auto;width:100%;height:calc(100vh - 32px)}</style></head><body class="atlas-ui"><main>'+document.querySelector('.project-editor-panel').outerHTML+'</main></body></html>'})()`,
      ),
    );
    await run(
      `[...document.querySelectorAll('.project-editor-panel button')].find(item=>item.textContent==='Hide editor').click()`,
    );
    win.setContentSize(1280, 900);
    await run(`atlasPower.show('Find and replace')`);
    await run(
      `(()=>{const fields=document.querySelectorAll('.power-body input');fields[0].value='Edited locally';document.querySelector('.power-body textarea').value='Replaced locally';[...document.querySelectorAll('#powerDialog button')].find(item=>item.textContent==='Preview replacements').click()})()`,
    );
    await wait(`document.querySelector('.power-body').textContent.includes('Review README.md')`);
    await run(
      `[...document.querySelectorAll('.power-body button')].find(item=>item.textContent==='Review README.md').click()`,
    );
    await wait(`document.querySelector('.power-body pre')?.textContent.includes('Replaced locally')`);
    await run(
      `(()=>{const box=[...document.querySelectorAll('.power-body input[type=checkbox]')].find(x=>!x.disabled&&x.parentElement.textContent.includes('README.md'));box.click();[...document.querySelectorAll('.power-body button')].find(item=>item.textContent==='Apply selected replacements').click()})()`,
    );
    await wait(`document.querySelector('.power-status').textContent.includes('1 files written')`);
    assert(fs.readFileSync(path.join(project, 'README.md'), 'utf8').includes('Replaced locally'));
    await run(
      `window.atlas.integrations=async r=>r.action==='desktop-permissions'?[{owner:'assistant:fixture',grantedAt:Date.now()}]:[];window.atlas.workflowTools=async r=>r.action==='diagnostic-preview'?{id:'draft',text:JSON.stringify({appVersion:'0.9.1',failedChecks:[]})}:r.action==='diagnostic-export'?{exported:true}:[];atlasPower.show('Permissions')`,
    );
    await wait(`document.querySelector('.power-body').textContent.includes('Revoke assistant:fixture')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'permissions.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasPower.show('Diagnostic bundle')`);
    await run(
      `[...document.querySelectorAll('.power-body button')].find(item=>item.textContent==='Preview bundle').click()`,
    );
    await wait(`document.querySelector('.power-body pre').textContent.includes('appVersion')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'diagnostic-bundle.png'), (await win.webContents.capturePage()).toPNG());
    await run(
      `window.atlas.jobs=async()=>[{id:'one',prompt:'Build the project',endedAt:1000},{id:'two',prompt:'Improve the project',endedAt:2000}];window.atlas.workflowTools=async r=>r.action==='archive-list'?[]:r.ids.map((id,i)=>({id,title:i?'Improve the project':'Build the project',provider:'codex',status:'completed',durationMs:1000+i*500,usage:i?{inputTokens:250,outputTokens:80}:null,checks:{status:i?'passed':'failed',results:[{status:i?'passed':'failed',command:'npm test',output:i?'Tests passed':'A check failed'}]},diff:{checkedAt:Date.now(),files:[{path:'app.js',status:'modified',added:1,removed:1,hunks:[{lines:['-old','+new']}]}]}}));atlasPower.show('Task comparison')`,
    );
    await run(`[...document.querySelectorAll('.power-body button')].find(item=>item.textContent==='Compare').click()`);
    await wait(`document.querySelector('.task-comparison-grid').textContent.includes('input 250')`);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(await run(`document.querySelectorAll('.task-comparison-grid>section').length`), 2);
    fs.writeFileSync(path.join(shots, 'task-comparison.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasPower.show('Project health')`);
    await run(
      `[...document.querySelectorAll('#powerDialog button')].find(item=>item.textContent==='Run local health check').click()`,
    );
    await wait(`document.querySelector('.power-body').textContent.includes('Fixture tool')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'project-health.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasPower.show('Named checkpoints')`);
    await wait(`document.querySelector('.power-body').textContent.includes('Create checkpoint')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'named-checkpoints.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasPower.show('Live preview')`);
    await wait(`document.querySelector('.power-body').textContent.includes('Open src/app.ts:12:3')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'live-preview-controls.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(
      path.join(shots, 'workbench-inspect.html'),
      await run(
        `(()=>{const styles=[...document.querySelectorAll('style')].map(x=>x.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS live preview controls</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8'))}+'</style><style>body{margin:0;background:#111;color:#eee;padding:16px}.power-dialog{position:relative;inset:auto;margin:auto;width:min(980px,100%);max-height:calc(100vh - 32px);box-sizing:border-box}</style></head><body class="atlas-ui"><main>'+document.getElementById('powerDialog').outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';})()`,
      ),
    );
    await run(
      `[...document.querySelectorAll('#powerDialog button')].find(item=>item.textContent==='Attach screenshot and selection to chat').click()`,
    );
    await wait(`document.getElementById('colabTask').value.includes('button#target')`);
    assert.equal(await run(`document.getElementById('powerDialog').open`), false);
    await run(
      `window.advancedCalls=[];window.terminalRows=[];window.repairRows=[];window.atlas.advancedWorkflows=async r=>{advancedCalls.push(r);if(r.tool==='intelligence')return {indexed:3,definitions:[{path:'README.md',name:'renderPage',line:1}],references:[{path:'style.css',line:1,excerpt:'renderPage()'}],imports:['style.css'],affected:[{path:'index.html',distance:1}],tests:[],note:'Static hints only.'};if(r.tool==='terminal'){if(r.action==='start')terminalRows.push({id:'terminal-demo-'+terminalRows.length,command:r.command||'PowerShell',shell:r.shell,status:'running',pid:42,output:'Fixture live output',cwd:r.cwd});if(r.action==='stop')terminalRows.find(x=>x.id===r.id).status='cancelled';if(r.action==='input')terminalRows[0].output+=' input received';return r.action==='start'?terminalRows[0]:terminalRows;}if(r.tool==='repair'){if(r.action==='start')repairRows.push({id:'repair-demo',status:'running',runs:[{attempt:0,results:[{command:'npm test',status:'failed',output:'Fixture failure'}]}]});if(r.action==='stop')repairRows[0].status='cancelled';return r.action==='start'?repairRows[0]:repairRows;}return {verified:true,reason:'Tracked files match.',remaining:'Continue after two recorded stages.'};};window.atlas.jobs=async()=>[{id:'failed-demo',prompt:'Repair fixture',status:'failed',endedAt:1000,cwd:${JSON.stringify(project)},verification:{results:[{command:'npm test',status:'failed'}]},resumeCheckpoint:{id:'saved'}}];void 0;`,
    );
    win.setContentSize(1280, 900);
    await run(`atlasPower.show('Project intelligence')`);
    await run(
      `(()=>{document.querySelector('.power-body input').value='README.md';[...document.querySelectorAll('.power-body button')].find(x=>x.textContent==='Analyze project').click()})()`,
    );
    await wait(`document.querySelector('.power-body').textContent.includes('renderPage')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'project-intelligence.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasPower.show('Terminal')`);
    await run(`document.querySelector('.terminal-dock button[aria-label="New terminal session"]').click()`);
    await wait(`document.querySelector('.terminal-dock pre').textContent.includes('Fixture live output')`);
    await run(`document.querySelector('.terminal-dock button[aria-label="New terminal session"]').click()`);
    await wait(`document.querySelectorAll('.terminal-dock nav button').length===2`);
    await run(
      `(()=>{const input=document.querySelector('.terminal-dock textarea');input.value='echo fixture';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))})()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'terminal.png'), (await win.webContents.capturePage()).toPNG());
    for (const [width, height] of [
      [1280, 900],
      [768, 800],
      [640, 700],
    ]) {
      win.setContentSize(width, height);
      await new Promise((r) => setTimeout(r, 60));
      assert(
        await run(
          `(()=>{const r=document.querySelector('.terminal-dock').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()`,
        ),
      );
      fs.writeFileSync(
        path.join(shots, 'terminal-dock-' + width + '.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
    }
    win.setContentSize(1280, 900);
    await run(`[...document.querySelectorAll('.terminal-dock button')].find(x=>x.textContent==='Stop').click()`);
    await wait(`document.querySelector('.terminal-dock').textContent.includes('cancelled')`);
    await run(`[...document.querySelectorAll('.terminal-dock button')].find(x=>x.textContent==='Hide').click()`);
    await run(`atlasPower.show('Repair loops')`);
    await run(
      `[...document.querySelectorAll('.power-body button')].find(x=>x.textContent==='Start bounded repair…').click()`,
    );
    await wait(`document.querySelector('.power-body').textContent.includes('Stop this loop')`);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'repair-loop.png'), (await win.webContents.capturePage()).toPNG());
    await run(`[...document.querySelectorAll('.power-body button')].find(x=>x.textContent==='Stop this loop').click()`);
    await wait(`document.querySelector('.power-body').textContent.includes('cancelled')`);
    await run(`atlasPower.show('Recovery')`);
    await run(
      `(()=>{document.querySelector('.power-body details').open=true;[...document.querySelectorAll('.power-body button')].find(x=>x.textContent==='Verify saved checkpoint').click()})()`,
    );
    await wait(`document.querySelector('.power-body').textContent.includes('Checkpoint verified')`);
    for (const name of ['Project intelligence', 'Terminal', 'Repair loops'])
      for (const width of [768, 640]) {
        win.setContentSize(width, 800);
        await run('atlasPower.show(' + JSON.stringify(name) + ')');
        assert(await run(`document.documentElement.scrollWidth<=innerWidth+1`));
      }
    assert(
      await run(
        `advancedCalls.some(row=>row.tool==='terminal'&&row.action==='start'&&row.shell)&&advancedCalls.some(row=>row.tool==='terminal'&&row.action==='input'&&row.text==='echo fixture')&&advancedCalls.some(row=>row.tool==='repair'&&row.action==='start'&&row.commands[0]==='npm test')`,
      ),
    );
    assert.deepEqual(await run('fileUiErrors'), []);
    console.log(
      'PASS: Chat/Colab inline local images, file links, source preview, explicit attachment, isolated static HTML/CSS/assets, file browsing and narrow layout. Screenshots: ' +
        shots,
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
