const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-power-ui-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const baseMock = `window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false}),home:async()=>'C:/Projects/ATLAS',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({}),discoverModels:async()=>({}),updates:async()=>({}),chatMetadata:async()=>({}),contextPreview:async()=>({sections:[{id:'instructions',label:'Project instructions',included:true,text:'Run the configured checks.'}],indexed:{indexed:1,results:[{path:'src/voice.js',line:12,excerpt:'function transcribe() {}'}]},note:'Provider tools can add further context.'}),performance:async()=>({startupMs:450,mainProcessRssMB:64,runningTasks:0,samples:{}})},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
const mock =
  baseMock +
  `window.powerCalls=[];window.atlas.jobs=async()=>[{id:'recovery-one',prompt:'Improve voice recognition',cwd:'C:/Projects/ATLAS',status:'paused',startedAt:1,collaboration:true,colabChatId:'old-chat',changeId:'snapshot',checkpoints:[{phase:'build',provider:'codex'},{phase:'review',provider:'claude'}]}];window.atlas.changes=async request=>{powerCalls.push(request);if(request.action==='restore-preview')return {cwd:'C:/Projects/ATLAS',files:['voice.js'],token:'reviewed'};if(request.action==='restore')return {message:'Restored with backup'};return {files:[{path:'voice.js'}],added:2,removed:1};};window.atlas.collabReport=async request=>({phase:request.index===0?'build':'review',provider:'fixture',output:'Saved stage report'});`;
const timeout = setTimeout(() => {
  console.error('Power tools test timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__mock.js') return new Response(mock, { headers: { 'Content-Type': 'application/javascript' } });
      if (file.endsWith('.png'))
        return new Response(fs.readFileSync(path.join(root, file)), { headers: { 'Content-Type': 'image/png' } });
      return new Response(
        fs
          .readFileSync(path.join(root, file || 'index.html'), 'utf8')
          .replace(file ? 'NO_REPLACE' : '<head>', file ? 'NO_REPLACE' : '<head><script src="/__mock.js"></script>'),
        { headers: { 'Content-Type': file ? 'application/javascript' : 'text/html' } },
      );
    });
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(
      `(async()=>{await new Promise(r=>setTimeout(r,300));document.querySelector('#prompt').value='Improve voice';await atlasPower.show('Context');await new Promise(r=>setTimeout(r,100));const box=document.querySelector('[data-context="memories"]');box.click();if(atlasPower.selection('assistant').memories!==false)throw Error('Selection not saved');const button=[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Exclude this file');button.click();await new Promise(r=>setTimeout(r,10));if(!atlasPower.selection('assistant').files.includes('src/voice.js'))throw Error('File exclusion missing');})()`,
    );
    const shots = path.join(root, '.handover', 'power-ui');
    fs.mkdirSync(shots, { recursive: true });
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'context.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`atlasPower.show('Performance')`);
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'performance.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasPower.show('Recovery');document.querySelector('#powerDialog details').open=true;const b=[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Preview restore to before task');b.click();await new Promise(r=>setTimeout(r,30));if(powerCalls.some(r=>r.action==='restore'))throw Error('Restore ran without confirmation');if(!document.querySelector('#powerDialog').textContent.includes('Restore 1 file'))throw Error('Restore confirmation missing');})()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'recovery.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{atlas.workflows=async()=>[{id:'fixture',name:'Voice bug workflow',task:'Reproduce and fix the voice bug',mode:'debug',criteria:'Reproduction passes after the fix',checks:'npm test',builtin:false}];await atlasPower.show('Workflows');const picker=document.querySelector('#powerDialog select');picker.value='fixture';picker.dispatchEvent(new Event('change'));})()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'workflows.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasColab.ready;[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Use draft in Colab').click();await new Promise(r=>setTimeout(r,30));const chat=atlasColab.current();if(chat.draft!=='Reproduce and fix the voice bug'||chat.workflowChecks!=='npm test'||chat.busy)throw Error('Workflow did not produce an unsent draft');await atlasPower.show('Workflows');})()`,
    );
    win.setContentSize(640, 600);
    await win.webContents.executeJavaScript(
      `(async()=>{atlas.taskQueue=async request=>{powerCalls.push(request);return {paused:true,items:[]};};await atlasPower.show('Parallel');document.querySelector('#parallelTasks').value=['Add voice tests','Document voice controls'].join(String.fromCharCode(10));document.querySelector('#parallelChecks').value='npm test';})()`,
    );
    win.setContentSize(1280, 800);
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'parallel.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Queue batch for review').click();await new Promise(r=>setTimeout(r,30));const request=powerCalls.find(r=>r.action==='add-batch');if(!request||request.tasks.length!==2||request.checks!=='npm test')throw Error('Batch request incomplete');if(powerCalls.some(r=>r.action==='start'))throw Error('Batch started without Start');})()`,
    );
    win.setContentSize(640, 600);
    await win.webContents.executeJavaScript(
      `if(document.querySelector('#powerDialog').getBoundingClientRect().right>innerWidth+1)throw Error('Dialog overflow');`,
    );
    win.setContentSize(1280, 800);
    await win.webContents.executeJavaScript(
      `(async()=>{atlas.localModel=async()=>['fixture:8b'];atlas.saveSettings=async next=>{powerCalls.push({action:'save-local-settings',settings:next});return next;};await atlasPower.show('Local models');document.querySelector('#localModelName').value='fixture:8b';document.querySelector('#localModelEnabled').checked=true;})()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'local-models.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Save local model settings').click();await new Promise(r=>setTimeout(r,30));if(!powerCalls.some(r=>r.action==='save-local-settings'&&r.settings.localModelEnabled))throw Error('Local settings not saved');if(!document.querySelector('.local-model-state').textContent.includes('fixture:8b'))throw Error('Local mode indicator missing');})()`,
    );
    win.setContentSize(390, 844);
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(
      `(()=>{const dialog=document.querySelector('#powerDialog').getBoundingClientRect(),footer=document.querySelector('#powerDialog footer').getBoundingClientRect();if(footer.bottom>dialog.bottom+1||dialog.right>innerWidth+1)throw Error('Narrow dialog footer overflow');})()`,
    );
    clearTimeout(timeout);
    const inspection = await win.webContents.executeJavaScript(
      `(()=>{const live=document.querySelector('#powerDialog'),copy=live.cloneNode(true);[...live.querySelectorAll('input')].forEach((input,index)=>{const target=copy.querySelectorAll('input')[index];target.setAttribute('value',input.value);if(input.checked)target.setAttribute('checked','');else target.removeAttribute('checked');});const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS captured demo dialog</title>'+styles+'<style>body{margin:0;background:#0c0d0f}.power-dialog{display:block;position:relative;margin:24px auto;inset:auto}</style></head><body><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';})()`,
    );
    fs.writeFileSync(path.join(shots, 'inspect.html'), inspection);
    console.log(
      'PASS: Context, performance, recovery previews, workflow drafts, paused batches and local-model settings. Screenshots: ' +
        shots,
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
