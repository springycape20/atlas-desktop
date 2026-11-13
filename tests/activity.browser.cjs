const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const { offscreenFrame } = require('./fixtures/offscreen-frame.cjs');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-activity-ui-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const mock = `
localStorage.setItem('atlas.activeConversation','saved-chat');
window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
window.__requests=[];window.__jobsListeners=[];window.__approvalListeners=[];window.__usageListeners=[];window.__failJobs=false;
window.__jobs=[
{id:'working',conversationId:'saved-chat',cwd:'C:/Projects/Demo',prompt:'Implement the project settings screen',provider:'codex',status:'running',statusText:'Running project checks',startedAt:Date.now()-120000},
{id:'waiting',colabChatId:'colab',cwd:'C:/Trials/one',projectFolder:'C:/Projects/Demo',prompt:'Review the new settings workflow',collaboration:true,status:'running',startedAt:Date.now()-60000},
{id:'done',conversationId:'saved-chat',cwd:'C:/Projects/Demo',prompt:'Improve keyboard navigation',provider:'claude',status:'completed',startedAt:Date.now()-360000,endedAt:Date.now()-180000,verification:{status:'passed'},result:{output:'Updated keyboard navigation.'}},
{id:'other',cwd:'C:/Projects/Other',prompt:'Repair a failing build',provider:'codex',status:'failed',statusText:'A check failed',startedAt:Date.now()-500000}];
window.__approvals=[{id:'decision',jobId:'waiting',title:'Review permission',choices:['Allow once','Deny']}];
window.atlas=new Proxy({getSettings:async()=>({speakResponses:false,wakeWordEnabled:false}),home:async()=>'C:/Projects/Demo',latestConversation:async()=>({id:'saved-chat'}),discoverModels:async()=>({}),providerAuthStatus:async()=>({}),chatMetadata:async()=>({}),projects:async()=>[{id:'demo',name:'Demo project',cwd:'C:/Projects/Demo'},{id:'other',name:'Other project',cwd:'C:/Projects/Other'}],historyList:async()=>[{id:'saved-chat',provider:'atlas',cwd:'C:/Projects/Demo',title:'Saved project chat'}],historyRead:async()=>{await new Promise(r=>setTimeout(r,80));return{id:'saved-chat',provider:'atlas',cwd:'C:/Projects/Demo',title:'Saved project chat',turns:[{role:'user',content:'Keep my earlier work'}]}},jobs:async()=>{if(__failJobs)throw Error('Local records unavailable');return structuredClone(__jobs)},onJobs:f=>{__jobsListeners.push(f);return()=>{}},approvals:async()=>__approvals,onApprovals:f=>{__approvalListeners.push(f);return()=>{}},providerHealth:async()=>[{provider:'claude',available:false,estimated:true,retryAt:Date.now()+3600000}],providerUsage:async request=>{__requests.push(['usage',request]);return request.cachedOnly?{}:{codex:{provider:'codex',updatedAt:Date.now(),windows:[{label:'Session limit',remainingPercent:65,resetsAt:Date.now()+3600000}]},claude:{message:'Open the provider usage page.'}}},onProviderUsage:f=>{__usageListeners.push(f);return()=>{}},taskOpen:async id=>{__requests.push(['open',id])},chat:async()=>{throw Error('Activity must not invoke a model')},taskQueue:async()=>({items:[],paused:true,concurrency:1}),workflows:async()=>[]},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});
`;
const timer = setTimeout(() => {
  console.error('Activity UI timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__mock.js') return new Response(mock, { headers: { 'Content-Type': 'application/javascript' } });
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
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 900,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
    await run(
      `await Promise.all([atlasAssistant.ready,atlasColab.ready]);await new Promise(r=>setTimeout(r,150));if(!atlasActivity.visible())throw Error('Launch did not remain on Activity after chat restoration');if(document.querySelector('.assistant-workspace').getClientRects().length)throw Error('Chat overlays launch page');if(!document.getElementById('activityPage').textContent.includes('Waiting for your decision'))throw Error('Pending decision absent');if(__requests.filter(r=>r[0]==='usage').length!==1||!document.getElementById('activityPage').textContent.includes('65% remaining'))throw Error('Launch did not refresh usage');if(document.querySelector('[data-destination=activity]').getAttribute('aria-current')!=='page')throw Error('Activity nav not selected');`,
    );
    await run(
      `const count=()=>__requests.filter(r=>r[0]==='usage').length;const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;const initial=count();await atlasActivity.refresh();if(count()!==initial)throw Error('Usage polled too often');clock+=61000;await atlasActivity.refresh();await new Promise(r=>setTimeout(r,20));if(count()!==initial+1)throw Error('Automatic minute refresh missing');document.querySelector('[data-chat-workspace=assistant]').click();clock+=61000;await atlasActivity.refresh();if(count()!==initial+1)throw Error('Hidden Activity polled usage');atlasActivity.open();await new Promise(r=>setTimeout(r,20));if(count()!==initial+2)throw Error('Returning Activity did not refresh due usage');Date.now=originalNow;`,
    );
    const out = path.join(root, 'dist', 'activity');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'activity-desktop.png'), (await offscreenFrame(win)).toPNG());
    await run(
      `document.querySelector('[aria-label="Working tasks"] [data-job-id=working] button').click();await new Promise(r=>setTimeout(r,150));if(!__requests.some(r=>r[0]==='open'&&r[1]==='working')||atlasActivity.visible())throw Error('Activity task did not open its conversation');atlasActivity.open();`,
    );
    await run(
      `const scope=document.querySelector('[aria-label="Activity project"]');scope.value='C:/Projects/Demo';scope.dispatchEvent(new Event('change'));if(document.querySelector('#activityPage').textContent.includes('Repair a failing build'))throw Error('Project filter leaked another project');const buttons=[...document.querySelectorAll('#activityPage button')];buttons.find(b=>b.textContent==='Refresh provider usage').click();await new Promise(r=>setTimeout(r,30));if(!document.querySelector('#activityPage').textContent.includes('65% remaining'))throw Error('Usage percentage absent');__jobs[0]={...__jobs[0],status:'completed',endedAt:Date.now()};__jobsListeners.forEach(f=>f({removed:[],upsert:[__jobs[0]]}));if(document.querySelector('[aria-label="Working tasks"] [data-job-id=working]'))throw Error('Completed task remained working');__approvals=[];__approvalListeners.forEach(f=>f([]));if(!document.querySelector('[aria-label="Working tasks"] [data-job-id=waiting]'))throw Error('Approval transition lost running task');`,
    );
    await run(
      `const usageButton=[...document.querySelectorAll('#activityPage button')].find(b=>b.textContent==='Open Codex usage');usageButton.focus();__usageListeners.forEach(f=>f({provider:'codex',updatedAt:Date.now(),windows:[{label:'Session limit',remainingPercent:60,resetsAt:Date.now()+3600000}]}));if(document.activeElement.textContent!=='Open Codex usage')throw Error('Usage event lost keyboard focus');document.querySelector('[aria-label="Recent results"] [data-job-id=done] button').click();await new Promise(r=>setTimeout(r,30));if(!atlasPower.body.textContent.includes('Updated keyboard navigation.'))throw Error('Result opened the wrong task');atlasPower.close();if(!atlasActivity.visible())throw Error('Closing result did not return to Activity');`,
    );
    await run(
      `document.querySelector('[data-chat-workspace=assistant]').click();if(atlasActivity.visible()||!document.querySelector('.assistant-workspace').getClientRects().length)throw Error('Chat navigation failed');document.getElementById('prompt').value='Keep this unsent draft';atlasActivity.open();document.querySelector('[data-chat-workspace=assistant]').click();if(document.getElementById('prompt').value!=='Keep this unsent draft')throw Error('Activity erased draft');atlasActivity.open();document.querySelector('[data-chat-workspace=colab]').click();if(atlasActivity.visible()||!document.querySelector('.colab-workspace').getClientRects().length)throw Error('Colab navigation failed');atlasActivity.open();await atlasUi.open('tasks','Task centre');atlasUi.hub.close();if(!atlasActivity.visible())throw Error('Task modal lost Activity');await atlasProjectHome.open();atlasPower.close();if(!atlasActivity.visible())throw Error('Project modal lost Activity');atlasCommandMenu.open();const search=document.querySelector('[aria-label="Search navigation"]');search.value='Activity';search.dispatchEvent(new Event('input'));document.querySelector('.command-results button').click();await new Promise(r=>setTimeout(r,30));if(!atlasActivity.visible())throw Error('Ctrl+K Activity failed');`,
    );
    await run(
      `document.querySelector('[data-chat-workspace=assistant]').click();const content=document.createElement('pre');content.textContent=Array(300).fill('Saved lines').join(String.fromCharCode(10));content.style.height='2000px';content.style.maxHeight='none';document.querySelector('.assistant-past').append(content);const response=document.getElementById('response');response.scrollTop=90;if(response.scrollTop!==90)throw Error('Fixture not scrollable '+JSON.stringify({height:response.clientHeight,scroll:response.scrollHeight,shown:document.body.dataset.mainPage,style:getComputedStyle(response).display}));atlasActivity.open();document.querySelector('[data-chat-workspace=assistant]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(response.scrollTop!==90)throw Error('Activity lost chat reading position: '+response.scrollTop);content.remove();atlasActivity.open();`,
    );
    for (const theme of ['dark', 'light', 'contrast'])
      for (const [width, height] of [
        [1440, 900],
        [768, 800],
        [390, 800],
      ]) {
        win.setContentSize(width, height);
        await run(
          `atlasAppearanceUi.saved({uiTheme:${JSON.stringify(theme)},uiTextScale:1.3});atlasActivity.open();await new Promise(r=>setTimeout(r,50));const page=document.getElementById('activityPage');if(page.scrollWidth>page.clientWidth+2)throw Error('Activity horizontal overflow');if(document.documentElement.scrollWidth>innerWidth+2)throw Error('Window horizontal overflow');const header=page.querySelector('header');if(header.getBoundingClientRect().right>innerWidth+1)throw Error('Header outside window');`,
        );
        if (theme === 'dark')
          fs.writeFileSync(path.join(out, 'activity-' + width + '.png'), (await offscreenFrame(win)).toPNG());
      }
    await run(`
      const original=atlas.jobs;let before=[];
      atlas.jobs=async request=>{
        if(request?.action==='organize-many'){
          before=structuredClone(__jobs);for(const id of request.ids)atlasTaskExperience.organize(__jobs.find(j=>j.id===id),request.operation,__approvals);
          __requests.push(['bulk',request]);return {count:request.ids.length,undoToken:'undo-fixture',jobs:structuredClone(__jobs)};
        }
        if(request?.action==='undo-organize'){__jobs=before;return {count:2,jobs:structuredClone(__jobs)};}
        return original(request);
      };
      await atlasActivity.refresh();const choices=[...document.querySelectorAll('#activityPage input[type=checkbox]')].slice(0,2);
      if(choices.length!==2)throw Error('Stopped task selection absent');
      for(const input of choices){input.checked=true;input.dispatchEvent(new Event('change'));}
      choices[0].focus();await atlasActivity.refresh();if(document.activeElement.type!=='checkbox')throw Error('Activity refresh lost selection keyboard focus');
      const click=async text=>{[...document.querySelectorAll('#activityPage button')].find(b=>b.textContent===text).click();await new Promise(r=>setTimeout(r,30));};
      await click('Archive selected');if(!__requests.some(r=>r[0]==='bulk'&&r[1].ids.length===2))throw Error('Bulk archive did not send selected tasks');
      const undo=[...document.querySelectorAll('#activityPage button')].find(b=>b.textContent==='Undo cleanup');if(undo.disabled)throw Error('Undo unavailable after cleanup');
      await click('Undo cleanup');if(__jobs.some(j=>j.archived))throw Error('Undo failed to restore original task flags');
      const reset=[...document.querySelectorAll('[aria-label="Provider usage and availability"] small')].find(n=>n.textContent.startsWith('Resets in'));
      if(!reset||!reset.title.includes('Sydney'))throw Error('Usage countdown or exact Australian tooltip absent');
      atlas.jobs=original;
    `);
    await run(
      `__jobs=[];__approvals=[];await atlasActivity.refresh();if(!document.querySelector('#activityPage').textContent.includes('No tasks are working'))throw Error('Empty state absent');__failJobs=true;await atlasActivity.refresh();if(!document.querySelector('#activityPage').textContent.includes('Some local records are unavailable'))throw Error('Read failure absent');`,
    );
    assert.deepEqual(await run('return __errors'), []);
    console.log(
      'PASS: Activity launch, restored chats, automatic usage refresh and hidden-page pause, live transitions, project filtering, draft preservation, Chat/Colab/Projects/Tasks/Ctrl+K navigation, empty/error states and three themes/sizes.',
    );
    clearTimeout(timer);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
