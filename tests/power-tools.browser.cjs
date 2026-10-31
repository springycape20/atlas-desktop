const { offscreenFrame } = require('./fixtures/offscreen-frame.cjs');
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
        {
          headers: {
            'Content-Type': file.endsWith('.css') ? 'text/css' : file ? 'application/javascript' : 'text/html',
          },
        },
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
    fs.writeFileSync(path.join(shots, 'context.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(`atlasPower.show('Performance')`);
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'performance.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasPower.show('Recovery');document.querySelector('#powerDialog details').open=true;const b=[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Preview restore to before task');b.click();await new Promise(r=>setTimeout(r,30));if(powerCalls.some(r=>r.action==='restore'))throw Error('Restore ran without confirmation');if(!document.querySelector('#powerDialog').textContent.includes('Restore 1 file'))throw Error('Restore confirmation missing');})()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'recovery.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{atlas.workflows=async()=>[{id:'fixture',name:'Voice bug workflow',task:'Reproduce and fix the voice bug',mode:'debug',criteria:'Reproduction passes after the fix',checks:'npm test',builtin:false}];await atlasPower.show('Workflows');const picker=document.querySelector('#powerDialog select');picker.value='fixture';picker.dispatchEvent(new Event('change'));})()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'workflows.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasColab.ready;[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Use draft in Colab').click();await new Promise(r=>setTimeout(r,30));const chat=atlasColab.current();if(chat.draft!=='Reproduce and fix the voice bug'||chat.workflowChecks!=='npm test'||chat.busy)throw Error('Workflow did not produce an unsent draft');await atlasPower.show('Workflows');})()`,
    );
    win.setContentSize(640, 600);
    await win.webContents.executeJavaScript(
      `(async()=>{atlas.taskQueue=async request=>{powerCalls.push(request);return {paused:true,items:[]};};await atlasPower.show('Parallel');document.querySelector('#parallelTasks').value=['Add voice tests','Document voice controls'].join(String.fromCharCode(10));document.querySelector('#parallelChecks').value='npm test';})()`,
    );
    win.setContentSize(1280, 800);
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(path.join(shots, 'parallel.png'), (await offscreenFrame(win)).toPNG());
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
    fs.writeFileSync(path.join(shots, 'local-models.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Save local model settings').click();await new Promise(r=>setTimeout(r,30));if(!powerCalls.some(r=>r.action==='save-local-settings'&&r.settings.localModelEnabled))throw Error('Local settings not saved');if(!document.querySelector('.local-model-state').textContent.includes('fixture:8b'))throw Error('Local mode indicator missing');})()`,
    );
    win.setContentSize(390, 844);
    await new Promise((r) => setTimeout(r, 100));
    await win.webContents.executeJavaScript(
      `(()=>{const dialog=document.querySelector('#powerDialog').getBoundingClientRect(),footer=document.querySelector('#powerDialog footer').getBoundingClientRect();if(footer.bottom>dialog.bottom+1||dialog.right>innerWidth+1)throw Error('Narrow dialog footer overflow');})()`,
    );
    await win.webContents.executeJavaScript(`(async()=>{
      window.fixturePacket={id:'packet-one',revision:1,title:'Reduce token overhead',cwd:'C:/Projects/ATLAS',profileId:'',goal:'Preserve requirements',summary:'Model-reported work',decisions:'Keep checks enabled',files:'app.js',checks:'npm test · passed · exit 0',unresolved:'Review next steps',nextSteps:'Continue scoped changes',note:'Local fixture; review before drafting.',reviewedAt:null};
      atlas.jobs=async()=>[{id:'done-one',prompt:'Reduce token overhead',cwd:'C:/Projects/ATLAS',status:'completed',endedAt:1}];
      atlas.milestoneHandovers=async request=>{powerCalls.push(request);if(request.action==='list')return [structuredClone(fixturePacket)];if(request.action==='save'){Object.assign(fixturePacket,request.packet,{revision:fixturePacket.revision+1,reviewedAt:null});return structuredClone(fixturePacket);}if(request.action==='review'){fixturePacket.reviewedAt=1;return structuredClone(fixturePacket);}if(request.action==='draft'){if(!fixturePacket.reviewedAt)throw Error('Review first');return {text:'Reviewed handover draft: preserve requirements',cwd:fixturePacket.cwd,profileId:''};}};
      await atlasPower.show('Milestone handovers');document.querySelector('#powerDialog details').open=true;
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Open fresh Assistant draft').click();await new Promise(r=>setTimeout(r,30));
      if(!document.querySelector('.power-status').textContent.includes('Review first'))throw Error('Unreviewed draft allowed');
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='I reviewed this packet').click();await new Promise(r=>setTimeout(r,30));
    })()`);
    for (const width of [1280, 1024, 640, 390]) {
      win.setContentSize(width, 800);
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `(()=>{const dialog=document.querySelector('#powerDialog'),rect=dialog.getBoundingClientRect();if(rect.right>innerWidth+1||dialog.scrollWidth>dialog.clientWidth+2)throw Error('Handover dialog overflow');})()`,
      );
      fs.writeFileSync(path.join(shots, 'milestone-' + width + '.png'), (await offscreenFrame(win)).toPNG());
    }
    await win.webContents.executeJavaScript(`(async()=>{
      document.querySelector('#prompt').value='';
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Open fresh Assistant draft').click();await new Promise(r=>setTimeout(r,50));
      if(document.querySelector('#prompt').value!=='Reviewed handover draft: preserve requirements')throw Error('Fresh unsent handover missing');
      if(document.querySelector('#powerDialog').open)throw Error('Dialog did not close after drafting');
      await atlasPower.show('Model routing');
      const boxes=[...document.querySelectorAll('#powerDialog input[type=checkbox]')];if(boxes.length!==3||boxes[1].checked||!boxes[2].checked)throw Error('Efficiency defaults incorrect');
      boxes[1].click();boxes[2].click();[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Save model routing').click();await new Promise(r=>setTimeout(r,30));
      if(!powerCalls.some(r=>r.action==='save-local-settings'&&r.settings.checkDrivenEscalation&&r.settings.contextReuseEnabled===false))throw Error('Efficiency settings not saved');
    })()`);
    win.setContentSize(1280, 800);
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(shots, 'efficiency-settings.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{atlas.contextPreview=async()=>({sections:[],budget:{estimatedTokens:18000,imageCount:2,overBudget:true,rows:[{id:'prompt',label:'Current request',included:true,estimatedTokens:300},{id:'history',label:'Recent conversation',included:true,estimatedTokens:17700}],note:'Text estimate only; hidden provider history and image cost are unknown.',expectedPasses:'One initial model turn; repairs can add calls.'},note:'Local context fixture'});await atlasPower.show('Context');await new Promise(r=>setTimeout(r,60));if(!document.querySelector('.power-body').textContent.includes('18,000'))throw Error('Request budget missing');if(!document.querySelector('.power-body').textContent.includes('image tokens unknown'))throw Error('Image estimate disclosure missing');})()`,
    );
    fs.writeFileSync(path.join(shots, 'request-budget.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
      atlasColab.metadata(atlasColab.current().id,{draft:''});const previous=atlasColab.history().map(c=>c.id);
      await atlasPower.show('Milestone handovers');document.querySelector('#powerDialog details').open=true;
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Open fresh Colab draft').click();await new Promise(r=>setTimeout(r,50));
      const fresh=atlasColab.current();if(previous.includes(fresh.id)||fresh.messages.length||fresh.draft!=='Reviewed handover draft: preserve requirements')throw Error('Colab handover was not a fresh unsent chat');
      if(!previous.every(id=>atlasColab.history().some(c=>c.id===id)))throw Error('Source chat was lost');
      atlas.jobs=async()=>[{id:'logged-check',verification:{results:[{command:'npm test',status:'failed',logFile:'managed-fixture.log',logLimited:false}]}}];
      atlas.checkLog=async request=>{powerCalls.push({action:'check-log-fixture',...request});return {text:'Error: fixture assertion failed',previewLimited:true,logLimited:false,logError:''};};
      await atlasPower.show('Check logs');document.querySelector('#powerDialog details').open=true;
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Read local preview').click();await new Promise(r=>setTimeout(r,30));
      if(!document.querySelector('#powerDialog pre').textContent.includes('fixture assertion'))throw Error('Check log preview missing');
      if(!document.querySelector('.power-status').textContent.includes('64 KB'))throw Error('Log preview truncation not disclosed');
    })()`);
    fs.writeFileSync(path.join(shots, 'check-logs.png'), (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
      window.sessionCalls=[];
      atlas.jobs=async()=>[{id:'session-task',prompt:'Fix startup',cwd:'C:/Projects/ATLAS',status:'completed',endedAt:2,verification:{results:[{command:'npm test',status:'failed',exitCode:1}]}}];
      atlas.workSession=async request=>{sessionCalls.push(request);switch(request.action){
        case 'list':return {snapshots:[{id:'snapshot',name:'Before startup changes'}],branches:[{id:'trial-a',checkpointId:'snapshot',name:'First approach',cwd:'C:/Trials/first'},{id:'trial-b',checkpointId:'snapshot',name:'Second approach',cwd:'C:/Trials/second'}],receipts:[{id:'receipt',cwd:'C:/Projects/ATLAS',at:1,files:3}]};
        case 'map':return {entries:[{path:'app.js',reason:'Declared package entry point'}],modules:[{path:'app.js',definitions:[{name:'start'}],imports:['lib/start.js']}],note:'Bounded static analysis'};
        case 'inbox':return [{id:'failure',jobId:'session-task',kind:'check',text:'npm test failed',fingerprint:'fingerprint'},{id:'pending',kind:'permission',text:'Run a command?',fingerprint:'permission'}];
        case 'criteria-status':return [{id:'criterion',jobId:'session-task',text:'Startup works',status:'model/user claim; unverified',note:'Inspect current checks'}];
        case 'task-search':return [{jobId:'session-task',cwd:'C:/Projects/ATLAS',title:'Fix startup',excerpt:'Error: startup failure at app.js:12'}];
        case 'prepare':return {id:'prepared',query:request.query,cwd:request.cwd,receipt:{id:'receipt'},ranked:{results:[{path:'app.js',line:1,excerpt:'function start(){}'}]},checks:{status:'not-checked',results:[]},suggestedChecks:['npm test'],note:'Local preparation only'};
        case 'preparation-draft':return {cwd:'C:/Projects/ATLAS',profileId:'',text:'Prepared local context: function start(){}'};
        case 'bug-preview':return {id:'bug',text:'{"reproduction":"Open and click Start","expected":"Starts","actual":"Fails"}'};
        case 'bug-export':return {exported:true};
        case 'freshness':return {changed:['app.js'],note:'Reattach changed originals.'};
        case 'compare':return {note:'Current trial comparison',diffs:[{path:'app.js',patch:'- first approach\\n+ second approach'}]};
        default:return {saved:true};
      }};
      await atlasPower.show('Project map');[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Build local project map').click();await new Promise(r=>setTimeout(r,30));if(!document.querySelector('.power-body').textContent.includes('Declared package entry point'))throw Error('Project map missing');
    })()`);
    fs.writeFileSync(path.join(shots, 'project-map.png'), (await offscreenFrame(win)).toPNG());
    for (const name of [
      'Trial checkpoints',
      'Context freshness',
      'Review inbox',
      'Acceptance evidence',
      'Model handoff',
      'Task solution search',
      'Offline preparation',
      'Bug report builder',
    ]) {
      await win.webContents.executeJavaScript(`atlasPower.show(${JSON.stringify(name)})`);
      for (const width of [1280, 390]) {
        win.setContentSize(width, 800);
        await new Promise((r) => setTimeout(r, 40));
        await win.webContents.executeJavaScript(
          `(()=>{const d=document.querySelector('#powerDialog'),r=d.getBoundingClientRect();if(r.right>innerWidth+1||d.scrollWidth>d.clientWidth+2)throw Error('Work-session panel overflow');})()`,
        );
        fs.writeFileSync(
          path.join(shots, name.toLowerCase().replaceAll(' ', '-') + '-' + width + '.png'),
          (await offscreenFrame(win)).toPNG(),
        );
      }
    }
    win.setContentSize(1280, 800);
    await win.webContents.executeJavaScript(`(async()=>{
      const click=text=>[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent===text).click();
      const set=(label,value)=>{const row=[...document.querySelectorAll('#powerDialog label')].find(r=>r.textContent.startsWith(label));row.querySelector('textarea,input').value=value;};
      await atlasPower.show('Bug report builder');click('Export reviewed report');await new Promise(r=>setTimeout(r,20));if(sessionCalls.some(r=>r.action==='bug-export'))throw Error('Unreviewed bug report exported');
      set('Reproduction steps','Open app and click Start');set('Expected behavior','Starts');set('Actual behavior','Fails');click('Prepare redacted report');await new Promise(r=>setTimeout(r,30));const review=[...document.querySelectorAll('#powerDialog label')].find(r=>r.textContent.startsWith('I reviewed')).querySelector('input');review.checked=true;click('Export reviewed report');await new Promise(r=>setTimeout(r,30));if(!sessionCalls.some(r=>r.action==='bug-export'&&r.confirm))throw Error('Reviewed report export missing');
      await atlasPower.show('Offline preparation');set('Task to prepare','Fix startup');click('Prepare locally');await new Promise(r=>setTimeout(r,30));if(!document.querySelector('[data-prepared-path]'))throw Error('Prepared source selection missing');if(sessionCalls.some(r=>r.action==='prepare'&&r.checks?.length))throw Error('Checks ran during passive preparation');
      document.querySelector('#prompt').value='';click('Open selected context as an unsent draft');await new Promise(r=>setTimeout(r,40));if(document.querySelector('#prompt').value!=='Prepared local context: function start(){}')throw Error('Prepared draft missing');
      await atlasPower.show('Trial checkpoints');click('Compare trial files');await new Promise(r=>setTimeout(r,30));if(!document.querySelector('.power-body').textContent.includes('second approach'))throw Error('Trial comparison missing');
      await atlasPower.show('Context freshness');click('Check for changed files');await new Promise(r=>setTimeout(r,30));if(!document.querySelector('.power-body').textContent.includes('app.js'))throw Error('Freshness warning missing');
    })()`);
    await win.webContents.executeJavaScript(`(async()=>{
      await atlasPower.show('Milestone handovers');document.querySelector('#powerDialog details').open=true;document.querySelector('[aria-label="Provider for fresh Assistant handoff"]').value='claude';document.querySelector('#prompt').value='';[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Open fresh Assistant draft').click();await new Promise(r=>setTimeout(r,40));if(!document.querySelector('#prompt').value.startsWith('Use claude for this task.'))throw Error('Explicit provider handoff missing');
      await atlasPower.show('Workflows');document.querySelector('#workflow-task').value='Fix startup';document.querySelector('#workflow-steps').value='Reproduce, fix, test, review';document.querySelector('#workflow-stopConditions').value='Ask before API changes';[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Use draft in Colab').click();await new Promise(r=>setTimeout(r,40));if(!atlasColab.current().draft.includes('Reproduce, fix, test, review')||!atlasColab.current().draft.includes('Ask before API changes'))throw Error('Recipe steps or stopping conditions missing from unsent draft');
      await atlasPower.show('Review inbox');
    })()`);
    await win.webContents.executeJavaScript(`(async()=>{
      window.upgradeCalls=[];
      atlas.languageServer=async request=>{upgradeCalls.push(request);if(request.action==='settings')return {config:{command:'C:/Tools/node.exe',args:['C:/Tools/server.js','--stdio'],languageId:'javascript'},running:false};if(request.action==='definition')return {rows:[{path:'src/app.js',line:3,column:1}],note:'Fixture navigation result'};return {saved:true};};
      await atlasPower.show('Power tools');
      if(document.querySelectorAll('.upgrade-tool-row').length!==12)throw Error('Power tool overview incomplete');
      await atlasPower.show('Language intelligence');
      document.querySelector('[aria-label="Project file"]').value='src/app.js';
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Save server configuration').click();await new Promise(r=>setTimeout(r,30));
      if(upgradeCalls.some(r=>r.action==='definition'))throw Error('Saving a server ran a query');
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Go to definition').click();await new Promise(r=>setTimeout(r,30));
      if(!document.querySelector('.power-body').textContent.includes('Open src/app.js:3'))throw Error('Language navigation result missing');
      atlas.livePreview=async request=>{upgradeCalls.push(request);if(request.action==='browser-recipes')return [];if(request.action==='status')return {open:true,running:false,output:'Fixture server ready'};if(request.action==='profile')return {domNodes:24,jsHeapMB:12,rendererWorkingSetMB:48,rendererCpuPercent:0,domReadyMs:15,loadMs:null,delta:{domNodes:1,jsHeapMB:-2},note:'Fixture measurements for UI validation.'};if(request.action==='browser-checks')return {status:'passed',results:[{action:'assert-visible',status:'passed',durationMs:2}],browserErrors:[],skipped:0};return {};};
      await atlasPower.show('Live preview');
      [...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Run browser checks…').click();await new Promise(r=>setTimeout(r,30));
      if(!document.querySelector('.power-body').textContent.includes('Browser checks · passed'))throw Error('Browser check evidence missing');
    })()`);
    for (const name of ['Power tools', 'Language intelligence', 'Live preview']) {
      await win.webContents.executeJavaScript(`atlasPower.show(${JSON.stringify(name)})`);
      for (const width of [1280, 768, 390]) {
        win.setContentSize(width, 800);
        await new Promise((r) => setTimeout(r, 60));
        await win.webContents.executeJavaScript(
          `(()=>{const d=document.querySelector('.power-body');if(d.scrollWidth>d.clientWidth+2)throw Error('Upgrade panel overflow');for(const input of d.querySelectorAll('input,textarea,select'))if(input.getBoundingClientRect().right>d.getBoundingClientRect().right+1)throw Error('Upgrade field overflow');})()`,
        );
        fs.writeFileSync(
          path.join(shots, name.toLowerCase().replaceAll(' ', '-') + '-' + width + '.png'),
          (await offscreenFrame(win)).toPNG(),
        );
        if (name === 'Live preview') {
          await win.webContents.executeJavaScript(
            `(async()=>{[...document.querySelectorAll('#powerDialog button')].find(b=>b.textContent==='Measure project preview').click();await new Promise(r=>setTimeout(r,30));const profile=document.querySelector('.preview-profile');if(!profile.textContent.includes('12 MB')||!profile.textContent.includes('-2 MB')||!profile.textContent.includes('0%'))throw Error('Profile units or zero values missing');document.querySelector('.power-body').scrollTop=100000;})()`,
          );
          fs.writeFileSync(path.join(shots, 'project-profile-' + width + '.png'), (await offscreenFrame(win)).toPNG());
          await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('.power-body h3')].find(b=>b.textContent==='Repeatable browser checks').scrollIntoView({block:'start'})`,
          );
          fs.writeFileSync(path.join(shots, 'browser-checks-' + width + '.png'), (await offscreenFrame(win)).toPNG());
        }
      }
    }
    clearTimeout(timeout);
    const inspection = await win.webContents.executeJavaScript(
      `(()=>{const live=document.querySelector('#powerDialog'),copy=live.cloneNode(true);[...live.querySelectorAll('input')].forEach((input,index)=>{const target=copy.querySelectorAll('input')[index];target.setAttribute('value',input.value);if(input.checked)target.setAttribute('checked','');else target.removeAttribute('checked');});const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS captured demo dialog</title>'+styles+'<style>body{margin:0;background:#0c0d0f}.power-dialog{display:block;position:relative;margin:24px auto;inset:auto}</style></head><body><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';})()`,
    );
    fs.writeFileSync(path.join(shots, 'inspect.html'), inspection);
    console.log(
      'PASS: Work-session panels, explicit model handoffs, recipe steps, trial comparisons, freshness, preparation drafts, report review gates and existing efficiency controls. Screenshots: ' +
        shots,
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
