const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-dispute-browser-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-dispute-browser-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const chat = {
  id: 'chat-d',
  title: 'Retry logic',
  cwd: 'C:/Projects/Client',
  projectName: 'Client',
  createdAt: 1,
  updatedAt: 1,
  draft: '',
  isolated: false,
  messages: [{ id: 'm1', role: 'user', content: 'Make the client reliable', at: 1700000000000 }],
  busy: false,
};
const job = {
  id: 'job-dispute',
  collaboration: true,
  colabChatId: 'chat-d',
  startedAt: Date.now(),
  status: 'needs_attention',
  statusText: 'Needs attention',
  request: { task: 'Make the client reliable' },
  checkpoints: [{}, {}, {}, {}],
  result: {
    output: 'Paused',
    outcome: 'needs_attention',
    limitation: 'Codex and Claude disagree on 2 blockers. Choose who is right to continue.',
    dispute: {
      builder: 'codex',
      reviewer: 'claude',
      issues: [
        {
          id: 'F1',
          criterion: 'TASK',
          summary: 'Add retry logic',
          builderReason: 'transport.js already retries <img src=x onerror=alert(1)>',
          reviewerEvidence: 'Only GET is retried; POST in client.js:40 is not',
        },
        {
          id: 'F2',
          criterion: 'TASK',
          summary: 'Log failed attempts',
          builderReason: 'Out of scope',
          reviewerEvidence: 'Task asks for observable retries',
        },
      ],
    },
  },
};
const mock = `localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({ chats: [chat], selected: chat.id })}));
window.collabCalls=[];window.atlas=new Proxy({prepareProject:async()=>({ready:true,isolated:false}),collaborate:async request=>{collabCalls.push(request);return{id:'resumed-job'};},getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows'}),home:async()=>'C:/Projects',latestConversation:async()=>null,jobs:async()=>[],onJobs:fn=>{(window.jobListeners||=[]).push(fn);window.pushJobs=(patch)=>jobListeners.forEach((listener)=>listener(patch));return()=>{};},onCollaborationStatus:fn=>window.colabStatus=fn,providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'source',currentVersion:'test'}),chatMetadata:async()=>({})},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;
const timeout = setTimeout(() => {
  console.error('Dispute browser test timed out');
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
      await atlasColab.ready;atlasColab.selectChat('chat-d');
      pushJobs({removed:[],upsert:[${JSON.stringify(job)}]});
      await new Promise(r=>setTimeout(r,100));
      const box=document.querySelector('#colabDispute'),buttons=()=>[...box.querySelectorAll('button')];
      if(box.hidden)throw Error('Dispute card is hidden');if(!box.getClientRects().length||box.closest('details:not([open])'))throw Error('Dispute card is not visible on screen');
      if(!document.querySelector('#colabResume').hidden)throw Error('Generic resume should be replaced by the dispute card');
      if(!box.textContent.includes('Needs your decision'))throw Error('Heading missing: '+box.textContent);
      if(!box.textContent.includes('Codex (builder): transport.js already retries'))throw Error('Builder side missing');
      if(!box.textContent.includes('Claude (reviewer): Only GET is retried'))throw Error('Reviewer side missing');
      if(box.querySelector('img'))throw Error('Provider text was rendered as HTML');
      const proceed=()=>buttons().find(b=>b.textContent==='Continue with these rulings');
      if(!proceed().disabled)throw Error('Continue must wait for every ruling');
      buttons().filter(b=>b.textContent==='Use Codex’s approach')[0].click();
      if(!proceed().disabled)throw Error('Continue enabled with one blocker undecided');
      buttons().filter(b=>b.textContent==='Use Claude’s approach')[1].click();
      if(buttons().filter(b=>b.getAttribute('aria-pressed')==='true').length!==2)throw Error('Choices are not shown as selected');
      if(proceed().disabled)throw Error('Continue stayed disabled');
      proceed().click();await new Promise(r=>setTimeout(r,100));
      const call=collabCalls.at(-1);
      if(!call||call.resumeJobId!=='job-dispute')throw Error('Resume was not requested');
      if(JSON.stringify(call.rulings)!==JSON.stringify({F1:'builder',F2:'reviewer'}))throw Error('Wrong rulings: '+JSON.stringify(call.rulings));
    })()`);
    console.log(
      'PASS: Dispute card shows both sides safely, waits for every ruling and resumes with the chosen rulings.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    app.exit(process.exitCode || 0);
  }
});
