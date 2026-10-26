// The screens added for verified debugging, check offers, the parallel queue and conflict-aware
// accept, driven through the real renderer with a mocked main process. Every button's request is
// recorded and checked, and each screen is captured for review.
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-release-screens-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-release-screens-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const chats = [
  {
    id: 'release-chat',
    title: 'Cart project',
    cwd: 'C:/Projects/Cart',
    draft: '',
    busy: true,
    jobId: 'j-colab',
    messages: [{ id: 'u1', role: 'user', content: 'Fix the cart rounding bug' }],
  },
];
const state = {
  approvals: [
    {
      id: 'repro-1',
      jobId: 'j-colab',
      provider: 'ATLAS',
      title: 'Run the bug reproduction?',
      details:
        'ATLAS runs this provider-written command to confirm the bug fails before the fix and passes after it.\n\nCommand: npm test -- cart\nFolder: C:/Projects/Cart\nWhy approval is needed: This command runs code or has effects that cannot be checked reliably. Approval is required.',
      choices: ['Allow', 'Allow once', 'Deny'],
      permissionScope: 'Allow remembers this exact request for this task. Allow once runs it once. Deny rejects it.',
    },
  ],
  jobs: [
    {
      id: 'j-colab',
      collaboration: true,
      colabChatId: 'release-chat',
      status: 'running',
      startedAt: 1,
      events: [],
      prompt: 'Fix the cart rounding bug',
      cwd: 'C:/Projects/Cart',
    },
    {
      id: 'j-done',
      status: 'completed',
      statusText: 'Complete · unverified',
      startedAt: 2,
      endedAt: 3,
      events: [],
      prompt: 'Add a discount code',
      cwd: 'C:/Projects/Shop',
      verification: { status: 'not-checked', results: [], reason: 'Automatic checks are disabled for this project.' },
      verificationBadge: {
        level: 'unverified',
        label: 'Unverified',
        reason: 'No ATLAS checks ran, so only the reviewer accepted this work.',
      },
      checkOffer: {
        cwd: 'C:/Projects/Shop',
        checks: ['npm run test', 'npm run lint'],
        configured: false,
        profileName: '',
      },
    },
  ],
  queue: {
    paused: false,
    pauseBetween: false,
    concurrency: 2,
    items: [
      { id: 'q1', prompt: 'Add tax rates', cwd: 'C:/Projects/Cart', provider: 'colab', status: 'running' },
      { id: 'q2', prompt: 'Add coupons', cwd: 'C:/Projects/Cart', provider: 'colab', status: 'running' },
      {
        id: 'q3',
        prompt: 'Document coupons',
        cwd: 'C:/Projects/Cart',
        provider: 'colab',
        status: 'queued',
        waitForPrevious: true,
      },
    ],
  },
  review: {
    id: 'tree-1',
    cwd: 'C:/ATLAS/worktrees/tree-1',
    root: 'C:/Projects/Cart',
    state: 'active',
    baseSha: 'abc123',
    files: ['cart.js'],
    token: 'token-1',
    diff: 'diff --git a/cart.js b/cart.js\n-  return String(sum);\n+  return (cents / 100).toFixed(2);',
    truncated: false,
    prUrl: '',
    overlaps: [{ id: 'tree-2', files: ['cart.js'] }],
    conflicts: [],
  },
};
const mock = `localStorage.setItem('atlas.activeConversation','assistant-one');
if(!localStorage.getItem('releaseSeed')){localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({ chats, selected: 'release-chat' })}));localStorage.setItem('releaseSeed','1');}
window.calls=[];window.testState=${JSON.stringify(state)};window.approvalListeners=[];window.queueListeners=[];
const record=(name,request)=>{calls.push({name,request:JSON.parse(JSON.stringify(request??null))});};
window.atlas=new Proxy({
 getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows'}),
 jobs:async()=>testState.jobs,onJobs:()=>()=>{},
 approvals:async request=>{record('approvals',request);if(request?.action==='answer'){testState.approvals=testState.approvals.filter(row=>row.id!==request.id);for(const fn of approvalListeners)fn(testState.approvals);}return testState.approvals;},
 onApprovals:fn=>{approvalListeners.push(fn);return ()=>{};},
 taskQueue:async request=>{record('taskQueue',request);if(request?.action==='concurrency')testState.queue.concurrency=request.value;if(request?.action==='wait'){const row=testState.queue.items.find(item=>item.id===request.id);row.waitForPrevious=request.wait;}return testState.queue;},
 onQueue:fn=>{queueListeners.push(fn);return ()=>{};},
 projects:async()=>[{id:'p1',name:'Cart',cwd:'C:/Projects/Cart'}],
 checkOffer:async request=>{record('checkOffer',request);if(request.action==='run')return {verification:{level:'passed',label:'Checks passed',reason:'ATLAS ran the configured project checks.'},status:'passed'};return {answer:request.answer,profile:{name:'Shop'}};},
 reviewChanges:async request=>{record('reviewChanges',request);if(request.action==='update'){testState.review={...testState.review,baseSha:'def456',conflicts:['cart.js'],token:'token-2'};return {state:'active',conflicts:['cart.js'],message:'Task checkout moved to the latest project commit with conflicts in: cart.js. Resolve the conflict markers in the task checkout (or send a Colab follow-up asking to resolve them), then review and accept. The previous state is saved as a recovery snapshot.'};}return testState.review;},
 onCollaborationStatus:fn=>window.colabStatus=fn,
 providerAuthStatus:async()=>({codex:{installed:true},claude:{installed:true}}),
 discoverModels:async()=>({}),home:async()=>'C:/Projects',latestConversation:async()=>null,
},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;
const timeout = setTimeout(() => {
  console.error('Release screens browser test timed out');
  app.exit(1);
}, 90000);
timeout.unref();
const capture = async (name) => {
  // A hidden window may not repaint on its own; force a fresh frame before capturing.
  win.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const file = path.join(temp, name + '.png');
  fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  return file;
};
const page = (code) =>
  win.webContents.executeJavaScript(
    `(async()=>{const wait=async(fn,what)=>{for(let i=0;i<200;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+what);};const click=(scope,text)=>{const button=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!button)throw Error('No button: '+text);button.click();};${code}})()`,
  );
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (request) => {
      const name = new URL(request.url).pathname.slice(1);
      if (name === '__test-mock.js')
        return new Response(mock, { headers: { 'Content-Type': 'application/javascript;charset=utf-8' } });
      return new Response(
        fs
          .readFileSync(path.join(root, name || 'index.html'), 'utf8')
          .replace(
            name ? 'NOT_PRESENT' : '<head>',
            name ? 'NOT_PRESENT' : '<head><script src="/__test-mock.js"></script>',
          ),
        { headers: { 'Content-Type': name ? 'application/javascript;charset=utf-8' : 'text/html;charset=utf-8' } },
      );
    });
    // Offscreen rendering keeps captures current while the window stays hidden.
    win = new BrowserWindow({
      show: false,
      width: 1400,
      height: 900,
      webPreferences: { backgroundThrottling: false, offscreen: true },
    });
    await win.loadURL('atlas://app/');
    const shots = {};

    // 1. The reproduction approval card in the Colab chat that is running the debug task.
    await page(`await atlasColab.ready;document.querySelector('[data-chat-workspace="colab"]').click();atlasColab.selectChat('release-chat');
      await wait(()=>document.body.dataset.workspace==='colab','Colab workspace on screen');
      const card=await wait(()=>[...document.querySelectorAll('.chat-approvals[data-workspace="colab"] .chat-approval')].find(c=>c.textContent.includes('Run the bug reproduction?')),'reproduction approval card');
      if(!card.textContent.includes('ATLAS'))throw Error('Card misses the provider: '+card.textContent.slice(0,300));
      const brief=card.querySelector('.approval-target');
      if(!brief||brief.textContent!=='npm test -- cart'||brief.offsetParent===null)throw Error('The command is not visible on the card');`);
    shots.approval = await capture('1-reproduction-approval');
    await page(`const card=[...document.querySelectorAll('.chat-approvals[data-workspace="colab"] .chat-approval')].find(c=>c.textContent.includes('Run the bug reproduction?'));click(card,'Allow once');
      await wait(()=>calls.some(c=>c.name==='approvals'&&c.request?.action==='answer'&&c.request.id==='repro-1'&&c.request.choice==='Allow once'),'approval answer');`);

    // 2. A finished Colab answer: Unverified badge and the check offer; run once, then enable.
    await page(`colabStatus({id:'j-done',chatId:'release-chat',result:'Added discount codes.',outcome:'completed',verification:{level:'unverified',label:'Unverified',reason:'No ATLAS checks ran, so only the reviewer accepted this work.'},checkOffer:{cwd:'C:/Projects/Shop',checks:['npm run test','npm run lint'],configured:false,profileName:''}});
      const message=await wait(()=>[...document.querySelectorAll('.colab-message')].find(m=>m.querySelector('.check-offer')),'check offer card');
      if(message.querySelector('.verify-badge').textContent!=='Unverified')throw Error('Badge missing');
      if(message.querySelectorAll('.check-offer input[type=checkbox]:checked').length!==2)throw Error('Detected checks not listed');`);
    shots.offer = await capture('2-check-offer');
    await page(`const offer=()=>[...document.querySelectorAll('.colab-message')].find(m=>m.querySelector('.check-offer'));
      offer().querySelectorAll('.check-offer input[type=checkbox]')[1].click();
      click(offer().querySelector('.check-offer'),'Run on this task');
      await wait(()=>calls.some(c=>c.name==='checkOffer'&&c.request.action==='run'),'run request');
      const run=calls.find(c=>c.name==='checkOffer'&&c.request.action==='run').request;
      if(run.jobId!=='j-done'||JSON.stringify(run.commands)!=='["npm run test"]')throw Error('Run sent the wrong task or commands: '+JSON.stringify(run));
      await wait(()=>[...document.querySelectorAll('.verify-badge')].some(b=>b.textContent==='Checks passed'),'badge update after the run');
      click(offer().querySelector('.check-offer'),'Enable for this project');
      await wait(()=>calls.some(c=>c.name==='checkOffer'&&c.request.answer==='enable'),'enable request');
      const enable=calls.find(c=>c.name==='checkOffer'&&c.request.answer==='enable').request;
      if(enable.cwd!=='C:/Projects/Shop')throw Error('Enable sent the wrong folder');
      await wait(()=>!document.querySelector('.colab-message .check-offer'),'offer to close after answering');`);
    shots.offerDone = await capture('3-check-offer-answered');

    // 3. The Queue page: Run at once, running count and the wait option.
    await page(`atlasWorkbench.open('Queue');
      const dialog=await wait(()=>document.querySelector('#queueItems')&&document.querySelector('#queueItems').closest('dialog'),'queue page');
      const select=[...dialog.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent==='Up to 3 Colab tasks'));
      if(!select||select.value!=='2')throw Error('Run at once missing or wrong: '+(select&&select.value));
      if(!dialog.querySelector('#queueState').textContent.includes('2 tasks running'))throw Error('Running count missing: '+dialog.querySelector('#queueState').textContent);
      if(!dialog.textContent.includes('waits for the task above'))throw Error('Wait marker missing');
      if(![...dialog.querySelectorAll('label')].some(l=>l.textContent.startsWith('Wait for the task above')))throw Error('Wait option missing from the add form');
      select.value='3';select.dispatchEvent(new Event('change'));
      await wait(()=>calls.some(c=>c.name==='taskQueue'&&c.request?.action==='concurrency'&&c.request.value===3),'concurrency change');`);
    shots.queue = await capture('4-queue');
    await page(`const dialog=document.querySelector('#queueItems').closest('dialog');click(dialog,"Don't wait for the task above");
      await wait(()=>calls.some(c=>c.name==='taskQueue'&&c.request?.action==='wait'&&c.request.id==='q3'&&c.request.wait===false),'wait toggle');`);

    // 4. Workbench task details (covers Assistant tasks): badge row and the check offer.
    await page(`atlasWorkbench.open('Checkpoints');
      const card=await wait(()=>document.querySelector('dialog[open] .check-offer'),'Workbench check offer');
      const badge=document.querySelector('dialog[open] .verify-state');
      if(!badge||!badge.textContent.startsWith('Unverified'))throw Error('Workbench badge missing');`);
    shots.workbench = await capture('5-workbench-offer');
    await page(`click(document.querySelector('dialog[open] .check-offer'),"Don't ask for this project");
      await wait(()=>calls.some(c=>c.name==='checkOffer'&&c.request.answer==='decline'&&c.request.cwd==='C:/Projects/Shop'),'decline request');`);

    // 5. Review changes: overlap warning, Update task checkout and the conflict notice.
    await page(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());atlasWorkspace.review('tree-1');
      const dialog=await wait(()=>[...document.querySelectorAll('dialog[open]')].find(d=>d.textContent.includes('Isolated checkout')),'review dialog');
      if(!dialog.textContent.includes('Other unaccepted tasks from this project also changed: cart.js'))throw Error('Overlap warning missing');
      if(![...dialog.querySelectorAll('button')].some(b=>b.textContent==='Update task checkout'))throw Error('Update task checkout missing');`);
    shots.review = await capture('6-review-overlap');
    await page(`const dialog=[...document.querySelectorAll('dialog[open]')].find(d=>d.textContent.includes('Isolated checkout'));click(dialog,'Update task checkout');
      await wait(()=>calls.some(c=>c.name==='reviewChanges'&&c.request.action==='update'&&c.request.token==='token-1'),'update request');
      const after=await wait(()=>{const d=[...document.querySelectorAll('dialog[open]')].find(d=>d.textContent.includes('The last update left conflict markers in: cart.js'));return d;},'conflict notice after update');
      if(!after.querySelector('footer').textContent.includes('conflicts in: cart.js'))throw Error('Update message not shown: '+after.querySelector('footer').textContent);`);
    shots.update = await capture('7-review-after-update');
    console.log(
      'PASS: Reproduction approval card, check offer run/enable/decline, Queue run-at-once and wait option, Workbench badge and offer, review overlap warning and Update task checkout.',
    );
    for (const [name, file] of Object.entries(shots)) console.log('Screen ' + name + ': ' + file);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    win?.destroy();
    app.exit(process.exitCode || 0);
  }
});
