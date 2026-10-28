// Captures README screenshots from the real UI with demo data only (no personal chats or paths).
// Run: npx electron build/capture-screenshots.cjs   ->  writes docs/images/*.png
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  graph = require('../colab-graph');
const root = path.join(__dirname, '..'),
  out = process.env.ATLAS_SCREENSHOT_DIR || path.join(root, 'docs', 'images'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-screenshots-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const now = Date.parse('2026-10-26T09:30:00Z');

const assistantChat = {
  id: 'demo-assistant',
  provider: 'atlas',
  title: 'Plan a weekend trip to the Blue Mountains',
  cwd: 'C:/Projects/Travel',
  updatedAt: now,
  turns: [
    { role: 'user', content: 'Plan a relaxed two-day trip to the Blue Mountains from Sydney for next weekend.' },
    {
      role: 'assistant',
      content:
        '**Day 1: Katoomba and the Three Sisters**\n- Leave Sydney by 8 am; the drive is about 2 hours.\n- Walk to Echo Point for the Three Sisters lookout.\n- Afternoon: Scenic Railway and Skyway.\n\n**Day 2: Leura and Wentworth Falls**\n- Breakfast in Leura, then the Wentworth Falls track.\n- Head home mid-afternoon to beat the traffic.',
    },
  ],
};

const reproduction = {
  steps: 'Add items priced 0.1 and 0.2 to the cart and open the summary',
  command: 'npm test -- cart',
  files: ['tests/cart.test.js'],
  observed: 'Total shows $0.30000000000000004',
  expected: 'Total shows $0.30',
};
const debugReports = [
  {
    provider: 'claude',
    phase: 'reproduce',
    decision: 'ready',
    handover: {
      summary: 'Added a failing test: cart total shows floating-point noise',
      changedFiles: ['tests/cart.test.js'],
      checks: ['npm test -- cart (fails as expected)'],
    },
  },
  {
    provider: 'codex',
    phase: 'build',
    decision: 'ready',
    handover: {
      summary: 'Store prices in cents and format totals with two decimals',
      decisions: ['Keep the public API in dollars'],
      changedFiles: ['src/cart.js', 'src/format.js'],
      checks: ['npm test passed'],
    },
  },
  {
    provider: 'claude',
    phase: 'review',
    decision: 'ready',
    handover: { summary: 'Reproduction passes; root cause fixed; no regressions found' },
  },
];
const debugGraph = graph.build({
  task: 'Cart totals show rounding noise',
  reports: debugReports,
  state: {
    criteria: [
      { id: 'TASK', text: 'Cart totals show rounding noise' },
      { id: 'REPRO', text: 'The reproduced bug no longer occurs: Total shows $0.30' },
    ],
    reproduction,
  },
  outcome: 'completed',
  verification: { results: [{ command: 'npm test', status: 'passed' }] },
});
const colabChat = {
  id: 'demo-colab',
  title: 'Cart totals show rounding noise',
  cwd: 'C:/Projects/Shop',
  projectName: 'Shop',
  mode: 'debug',
  createdAt: now - 600000,
  updatedAt: now,
  draft: '',
  isolated: true,
  busy: false,
  graphRuns: [{ id: 'run-1', startedAt: now - 600000, graph: debugGraph }],
  messages: [
    {
      id: 'c1',
      role: 'user',
      content: 'The cart total sometimes shows $0.30000000000000004. Find and fix it.',
      at: now - 600000,
    },
    {
      id: 'c2',
      role: 'assistant',
      content:
        'Fixed. Claude first reproduced the bug with a failing test in tests/cart.test.js: adding $0.10 and $0.20 produced $0.30000000000000004. Codex then stored prices in cents and formats totals with two decimals, so the total now shows $0.30.\n\nChecks: npm test passes, including the new reproduction. Claude confirmed the root cause is fixed and found no regressions.',
      at: now,
    },
  ],
};
const disputeChat = {
  ...colabChat,
  id: 'demo-dispute',
  title: 'Make the API client retry failed requests',
  cwd: 'C:/Projects/Client',
  projectName: 'Client',
  mode: 'build',
  graphRuns: [],
  messages: [{ id: 'd1', role: 'user', content: 'Make the API client retry failed requests.', at: now - 300000 }],
};
const disputeJob = {
  id: 'job-dispute',
  collaboration: true,
  colabChatId: 'demo-dispute',
  startedAt: now - 300000,
  status: 'needs_attention',
  statusText: 'Needs attention',
  request: { task: 'Make the API client retry failed requests.' },
  checkpoints: [{}, {}, {}, {}],
  result: {
    output:
      'Work needs attention: Codex and Claude disagree on whether POST requests should be retried. Choose who is right to continue.',
    outcome: 'needs_attention',
    limitation: 'Codex and Claude disagree on 1 blocker. Choose who is right to continue.',
    dispute: {
      builder: 'codex',
      reviewer: 'claude',
      issues: [
        {
          id: 'F1',
          criterion: 'TASK',
          summary: 'Retry POST requests as well as GET',
          builderReason:
            'POST is not idempotent, so retrying it could create duplicate orders. Retries are limited to safe methods on purpose.',
          reviewerEvidence:
            'The task asks for retries on failed requests. client.js:40 sends orders with POST and an idempotency key, so retrying it is safe.',
        },
      ],
    },
  },
};

const mock = `localStorage.setItem('atlas.activeConversation','demo-assistant');
localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({ chats: [colabChat, disputeChat], selected: 'demo-colab' })}));
window.savedChats=${JSON.stringify([assistantChat])};window.jobListeners=[];
window.pushJobs=(patch)=>jobListeners.forEach((listener)=>listener(patch));
window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'kokoro',autoListenReplies:false}),home:async()=>'C:/Projects',latestConversation:async()=>savedChats[0],jobs:async()=>[],onJobs:fn=>{jobListeners.push(fn);return()=>{};},onCollaborationStatus:fn=>{window.colabStatus=fn;return()=>{};},providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'current',currentVersion:'0.6.12'}),chatMetadata:async()=>({}),historyList:async()=>savedChats.map(chat=>({...chat,turnCount:chat.turns.length,searchText:chat.turns.map(turn=>turn.content).join(' ')})),historyRead:async req=>structuredClone(savedChats.find(chat=>chat.id===req.id)),prepareProject:async()=>({ready:true,isolated:true})},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => {
  console.error('Screenshot capture timed out');
  app.exit(1);
}, 90000);
timeout.unref();
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(out, { recursive: true });
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__demo.js')
        return new Response(mock, { headers: { 'Content-Type': 'application/javascript;charset=utf-8' } });
      if (!file)
        return new Response(
          fs
            .readFileSync(path.join(root, 'index.html'), 'utf8')
            .replace('<head>', '<head><script src="/__demo.js"></script>'),
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
        );
      return new Response(fs.readFileSync(path.join(root, file)), {
        headers: { 'Content-Type': 'application/javascript;charset=utf-8' },
      });
    });
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      useContentSize: true,
      webPreferences: { backgroundThrottling: false, offscreen: true },
    });
    win.webContents.setFrameRate(30);
    await win.loadURL('atlas://app/');
    await wait(1500);
    const shot = async (name) => {
      await wait(600);
      fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG());
      console.log('wrote ' + path.join(out, name));
    };
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`);

    await run(
      `await atlasAssistant.open('demo-assistant');await new Promise((r)=>setTimeout(r,400));for(const el of document.querySelectorAll('.core *'))if(el.scrollHeight>el.clientHeight+20&&getComputedStyle(el).overflowY!=='visible')el.scrollTop=0;`,
    );
    await shot('assistant.png');

    await run(`await atlasColab.ready;atlasColab.selectChat('demo-colab');`);
    await shot('colab-debug.png');

    await run(`document.querySelector('#colabGraph').click();`);
    await shot('colab-graph.png');

    await run(`document.querySelector('.colab-graph-dialog')?.close();atlasColab.selectChat('demo-dispute');
      pushJobs({removed:[],upsert:[${JSON.stringify(disputeJob)}]});`);
    await shot('colab-dispute.png');

    await run(`atlasColab.selectAssistant?.();document.querySelector('#settingsOpen').click();`);
    await shot(process.env.ATLAS_SETTINGS_SHOT || 'settings.png');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    // Chromium keeps the profile locked until exit; the OS temp cleanup removes it otherwise.
    try {
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
    } catch {}
    app.exit(process.exitCode || 0);
  }
});
