const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  graph = require('../colab-graph');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-graph-browser-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-graph-browser-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const task = '<img src=x onerror=alert(1)> Fix parser',
  reports = [
    {
      provider: 'codex',
      phase: 'build',
      decision: 'ready',
      handover: {
        summary: 'Updated parser',
        decisions: ['Validate input'],
        changedFiles: ['src/parser.js'],
        checks: ['Parser unit tests passed'],
      },
    },
    { provider: 'claude', phase: 'review', decision: 'ready', output: 'Required work meets criteria' },
  ],
  finished = graph.build({
    task,
    reports,
    outcome: 'completed',
    verification: { results: [{ command: 'node --test', status: 'passed' }] },
  }),
  live = graph.build({ task, reports: reports.slice(0, 1), active: { phase: 'review', provider: 'claude' } }),
  milestoned = graph.build({
    task: 'Totals in cents',
    reports: [
      { provider: 'codex', phase: 'build', decision: 'ready', output: 'Planned' },
      { provider: 'claude', phase: 'plan_review', decision: 'ready', milestone: 'plan' },
      { provider: 'codex', phase: 'build', decision: 'ready', milestone: 'M1' },
      { provider: 'claude', phase: 'review', decision: 'ready', milestone: 'M1' },
      { provider: 'codex', phase: 'build', decision: 'ready', milestone: 'M2' },
    ],
    state: {
      taskCriteria: [{ id: 'TASK', text: 'Totals in cents' }],
      milestones: [
        {
          id: 'M1',
          title: 'Model',
          status: 'done',
          criteria: [{ id: 'M1.1', text: 'Model stores cents' }],
          check: 'npm test -- model',
          checkRun: { command: 'npm test -- model', status: 'passed', exitCode: 0 },
        },
        { id: 'M2', title: 'API', status: 'active', criteria: [{ id: 'M2.1', text: 'API returns cents' }], check: '' },
        { id: 'M3', title: 'Docs', status: 'pending', criteria: [{ id: 'M3.1', text: 'README' }], check: '' },
      ],
    },
    active: { phase: 'review', provider: 'claude', milestone: 'M2' },
  }),
  stepped = graph.build({
    task: 'Fix totals',
    reports: [
      {
        provider: 'codex',
        phase: 'build',
        decision: 'ready',
        output: 'Built',
        handover: { summary: 'Stored cents', decisions: [{ decision: 'Use cents', reason: 'Floats drift' }] },
        steps: [
          { type: 'command', provider: 'codex', text: 'npm ci', status: 'completed', startedAt: 1, endedAt: 900 },
          { type: 'file', provider: 'codex', text: 'update: src/cart.js', status: 'completed' },
          { type: 'command', provider: 'codex', text: 'npm test', status: 'failed', exitCode: 1 },
          { type: 'gateway', provider: 'codex', text: 'Tool: windows / Screenshot', status: 'completed' },
        ],
      },
      { provider: 'claude', phase: 'review', decision: 'ready', output: 'Approved' },
    ],
    state: {},
  });
const chats = [
  {
    id: 'graph-chat',
    title: 'Parser project',
    cwd: 'C:/Projects/Parser',
    draft: '',
    messages: [{ id: 'u', role: 'user', content: 'Fix parser' }],
  },
];
const mock = `if(!localStorage.getItem('graphSeed')){localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({ chats, selected: 'graph-chat' })}));localStorage.setItem('graphSeed','1');}window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows'}),jobs:async()=>[],onJobs:()=>{},onCollaborationStatus:fn=>window.colabStatus=fn,providerAuthStatus:async()=>({codex:{installed:true},claude:{installed:true}}),discoverModels:async()=>({}),home:async()=>'C:/Projects',latestConversation:async()=>null},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;
const timeout = setTimeout(() => {
  console.error('Graph browser test timed out');
  app.exit(1);
}, 60000);
timeout.unref();
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
    win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasColab.ready;atlasColab.selectChat('graph-chat');document.querySelector('#colabGraph').click();const dialog=document.querySelector('.colab-graph-dialog');if(!dialog.open||!dialog.textContent.includes('Send a task'))throw Error('Empty graph state missing');dialog.querySelector('header button').click();colabStatus({id:'graph-job',chatId:'graph-chat',status:'Reviewing'});colabStatus({id:'graph-job',chatId:'graph-chat',graph:${JSON.stringify(live)}});document.querySelector('#colabGraph').click();if(!dialog.querySelector('[data-id="active"]'))throw Error('Live review missing');colabStatus({id:'graph-job',chatId:'graph-chat',result:'Parser fixed',outcome:'completed'});colabStatus({id:'graph-job',chatId:'graph-chat',graph:${JSON.stringify(finished)}});if(atlasColab.current().busy)throw Error('Graph-only final update reactivated task');if(dialog.querySelector('[data-id="active"]'))throw Error('Stale active node');if(dialog.querySelector('img'))throw Error('Graph injected markup');dialog.querySelector('[data-id="pass:0"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));if(!dialog.querySelector('.colab-graph-detail').textContent.includes('Updated parser'))throw Error('Node details missing');const search=dialog.querySelector('input');search.value='src/parser.js';search.dispatchEvent(new Event('input'));if(!dialog.querySelector('[data-dim="true"]'))throw Error('Search did not highlight');search.value='';search.dispatchEvent(new Event('input'));const filter=dialog.querySelector('[aria-label="Graph node filter"]');filter.value='check';filter.dispatchEvent(new Event('change'));if(dialog.querySelector('[data-id="file:src/parser.js"]'))throw Error('Filter failed');if(!dialog.querySelector('[data-id="verified:0"]'))throw Error('Executed check missing');filter.value='all';filter.dispatchEvent(new Event('change'));const canvas=dialog.querySelector('svg'),width=parseFloat(canvas.style.width);dialog.querySelector('[aria-label="Zoom in"]').click();if(parseFloat(canvas.style.width)<=width)throw Error('Zoom failed');colabStatus({id:'second-job',chatId:'graph-chat',graph:${JSON.stringify(graph.build({ task: 'Second task', outcome: 'failed' }))}});const picker=dialog.querySelector('[aria-label="Task graph"]');if(picker.options.length!==2||picker.value!=='second-job')throw Error('Latest task not followed');picker.value='graph-job';picker.dispatchEvent(new Event('change'));if(!dialog.querySelector('[data-id="verified:0"]'))throw Error('Earlier task graph lost');colabStatus({id:'resume-job',graphRunId:'graph-job',chatId:'graph-chat',graph:{...atlasColab.current().graphRuns[0].graph,revision:10}});if(atlasColab.current().graphRuns.length!==2)throw Error('Resume split task graph history');colabStatus({id:'interrupted-job',chatId:'graph-chat',graph:{...atlasColab.current().graphRuns[0].graph,outcome:'working',nodes:[{id:'task',kind:'task',label:'Interrupted task',status:'working',origin:'user',rank:0},{id:'active',kind:'stage',label:'Interrupted review',status:'running',origin:'ATLAS recorded',rank:1}],edges:[]}});await atlasColabHistory.flush();})()`,
    );
    for (const [width, height] of [
      [1400, 900],
      [640, 600],
    ]) {
      win.setContentSize(width, height);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const bounds = await win.webContents.executeJavaScript(
        `(()=>{const d=document.querySelector('.colab-graph-dialog').getBoundingClientRect();return {left:d.left,right:d.right,bottom:d.bottom,width:innerWidth,height:innerHeight};})()`,
      );
      assert(
        bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1,
        JSON.stringify(bounds),
      );
    }
    win.setContentSize(1400, 900);
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(path.join(temp, 'workflow-graph.png'), (await win.webContents.capturePage()).toPNG());
    await win.reload();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasColab.ready;atlasColab.selectChat('graph-chat');if(atlasColab.current().graphRuns.length!==3)throw Error('Graphs did not survive reload');if(atlasColab.current().graphRuns.at(-1).graph.outcome!=='paused'||atlasColab.current().graphRuns.at(-1).graph.nodes.some(node=>node.status==='running'))throw Error('Interrupted graph was not normalized after restart');document.querySelector('#colabGraph').click();if(document.querySelector('[aria-label="Task graph"]').options.length!==3)throw Error('Saved task selector missing');})()`,
    );
    await win.webContents.executeJavaScript(
      `(async()=>{colabStatus({id:'milestone-job',chatId:'graph-chat',graph:${JSON.stringify(milestoned)}});const dialog=document.querySelector('.colab-graph-dialog');const y=id=>{const node=dialog.querySelector('[data-id="'+id+'"]');if(!node)throw Error('Missing '+id);return Number(node.getAttribute('transform').match(/translate\\(\\S+ (\\S+)\\)/)[1]);};if(!(y('milestone:M1')<y('pass:2')&&y('milestone:M3')<y('pass:2')))throw Error('Milestones are not above the stages');if(y('criterion:M2.1')<=y('pass:2'))throw Error('Milestone criteria are not under their milestone');const filter=dialog.querySelector('[aria-label="Graph node filter"]');filter.value='milestone';filter.dispatchEvent(new Event('change'));if(!dialog.querySelector('[data-id="milestone:M2"]')||dialog.querySelector('[data-id="criterion:M1.1"]'))throw Error('Milestone filter failed');filter.value='all';filter.dispatchEvent(new Event('change'));dialog.querySelector('[data-id="milestone:M2"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));if(!dialog.querySelector('.colab-graph-detail').textContent.includes('unverified'))throw Error('Unverified milestone not explained');})()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(path.join(temp, 'milestone-graph.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `(async()=>{colabStatus({id:'steps-job',chatId:'graph-chat',graph:${JSON.stringify(stepped)}});const dialog=document.querySelector('.colab-graph-dialog');const node=id=>dialog.querySelector('[data-id="'+id+'"]');const at=id=>{const n=node(id);if(!n)throw Error('Missing '+id);return Number(n.getAttribute('transform').match(/translate\\(\\S+ (\\S+)\\)/)[1]);};if(node('pass:0:step:0').querySelector('rect').getAttribute('height')!=='40')throw Error('Step nodes are not compact');if(node('pass:0:step:2').querySelector('rect').getAttribute('stroke')!=='#f39a8b')throw Error('Failed step not outlined');if(!(at('pass:0:step:0')<at('pass:0:step:1')&&at('pass:0:step:1')<at('pass:0:step:2')))throw Error('Steps are not in order under their stage');node('pass:0').dispatchEvent(new MouseEvent('click',{bubbles:true}));const detail=dialog.querySelector('.colab-graph-detail').textContent;if(!detail.includes('3. $ npm test · exit 1 · failed')||!detail.includes('because Floats drift'))throw Error('Stage details miss steps or rationale');const filter=dialog.querySelector('[aria-label="Graph node filter"]');filter.value='step';filter.dispatchEvent(new Event('change'));if(!node('pass:0:step:3')||node('pass:0:decision:0'))throw Error('Steps filter failed');filter.value='all';filter.dispatchEvent(new Event('change'));})()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(path.join(temp, 'steps-graph.png'), (await win.webContents.capturePage()).toPNG());
    console.log(
      'PASS: Live graph, completion, node details, safe text, search, filters, zoom, task selection, responsive layout, saved graphs after reload, milestones and step timelines.',
    );
    console.log('Preview: ' + path.join(temp, 'workflow-graph.png'));
    console.log('Milestones: ' + path.join(temp, 'milestone-graph.png'));
    console.log('Steps: ' + path.join(temp, 'steps-graph.png'));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    win?.destroy();
    app.exit(process.exitCode || 0);
  }
});
