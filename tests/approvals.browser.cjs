const { app, BrowserWindow, protocol } = require('electron'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-approvals-browser-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-approvals-browser-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const chats = ['one', 'two'].map((id) => ({
  id: 'colab-' + id,
  title: 'Colab ' + id,
  cwd: 'C:/Project',
  messages: [{ id: 'user-' + id, role: 'user', content: 'Task ' + id }],
  busy: true,
}));
const mock = `localStorage.setItem('atlas.activeConversation','assistant-one');if(!localStorage.getItem('approvalSeed')){localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({ chats, selected: 'colab-one' })}));localStorage.setItem('approvalSeed','1');}
 window.permissionListeners=[];window.testPermissions=[];window.testShell=[];window.shellRevokes=0;window.approvalListeners=[];window.testApprovals=[{id:'a1',jobId:'j1',provider:'codex',title:'Allow Windows Screenshot?',details:'Allow once runs this action while the PC is active.',permissionScope:'Allow remembers routine control for this chat.',choices:['Allow','Allow once','Deny']},{id:'a2',jobId:'j2',provider:'claude',title:'Other chat request',details:'Only for chat two',choices:['Allow','Allow once','Deny']},{id:'a3',jobId:'j3',provider:'claude',title:'Which file?',details:'Enter the filename',choices:['Send answer','Deny'],textInput:true}];window.answers=[];
 window.fakeJobs=[{id:'j1',collaboration:true,colabChatId:'colab-one',status:'running',startedAt:1,events:[{id:'ps1',kind:'command',provider:'codex',status:'completed',approvedBy:'chat',text:'In C:/Project\\n> npm run build\\n\\nbuilt ok',at:1}],prompt:'Task one'},{id:'j2',collaboration:true,colabChatId:'colab-two',status:'running',startedAt:2,events:[],prompt:'Task two'},{id:'j3',conversationId:'assistant-one',status:'running',startedAt:3,events:[],prompt:'Assistant task'}];
 window.atlas=new Proxy({onDesktopPermissions:fn=>permissionListeners.push(fn),integrations:async request=>{if(request?.action==='shell-permissions')return testShell;if(request?.action==='revoke-shell'){shellRevokes++;testShell=testShell.filter(row=>row.owner!==request.owner);return testShell;}if(request?.action==='grant-desktop'){testPermissions=[...testPermissions.filter(row=>row.owner!==request.owner),{owner:request.owner,id:'switch-grant'}];for(const fn of permissionListeners)fn(testPermissions);}if(request?.action==='revoke-desktop'){testPermissions=testPermissions.filter(row=>row.owner!==request.owner);for(const fn of permissionListeners)fn(testPermissions);}return testPermissions;},getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows'}),jobs:async()=>fakeJobs,onJobs:()=>{},approvals:async request=>{if(request?.action==='answer'){if(request.choice==='Send answer'&&!request.text?.trim())throw Error('Enter an answer');answers.push(request);if(request.choice==='Allow'&&request.id==='remember-request'){testPermissions=[{owner:'colab:colab-one',id:'grant'}];for(const fn of permissionListeners)fn(testPermissions);}testApprovals=testApprovals.filter(item=>item.id!==request.id);for(const listener of approvalListeners)listener(testApprovals);}return testApprovals;},onApprovals:fn=>approvalListeners.push(fn),taskQueue:async()=>({items:[],paused:true}),historyList:async()=>[{id:'assistant-one',provider:'atlas',title:'Assistant one',turns:[]}],historyRead:async()=>({id:'assistant-one',title:'Assistant one',turns:[{role:'user',content:'Assistant task'}]}),home:async()=>'C:/Project',latestConversation:async()=>null,providerAuthStatus:async()=>({codex:{installed:true},claude:{installed:true}}),discoverModels:async()=>({})},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;
const timeout = setTimeout(() => {
  console.error('Approvals browser test timed out');
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
        {
          headers: {
            'Content-Type': name.endsWith('.css')
              ? 'text/css'
              : name
                ? 'application/javascript;charset=utf-8'
                : 'text/html;charset=utf-8',
          },
        },
      );
    });
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { backgroundThrottling: false, offscreen: Boolean(process.env.ATLAS_COMPACT_CAPTURE) },
    });
    if (process.env.ATLAS_APPROVAL_HEIGHT)
      win.setContentSize(Number(process.env.ATLAS_APPROVAL_WIDTH || 1024), Number(process.env.ATLAS_APPROVAL_HEIGHT));
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(
      `(async()=>{await atlasColab.ready;await atlasAssistant.ready;const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Approval UI did not update');};atlasColab.selectChat('colab-one');await wait(()=>document.querySelector('.chat-approvals[data-workspace="colab"] .chat-approval'));const colab=document.querySelector('.chat-approvals[data-workspace="colab"]'),bubble=document.querySelector('.approval-alert');if(colab.querySelectorAll('.chat-approval').length!==1||!colab.textContent.includes('Screenshot')||colab.textContent.includes('Other chat'))throw Error('Approval leaked into another chat');if(JSON.stringify([...colab.querySelectorAll('button')].map(button=>button.textContent))!==JSON.stringify(['Allow','Allow once','Deny'])||!colab.textContent.includes('Allow remembers routine control'))throw Error('Three permission choices or scope missing');if(bubble.hidden||!bubble.textContent.includes('3 approvals'))throw Error('Approval bubble not synchronized');[...colab.querySelectorAll('button')].find(button=>button.textContent==='Allow once').click();await wait(()=>answers.length===1);if(answers[0].choice!=='Allow once'||!colab.hidden||!bubble.textContent.includes('2 approvals'))throw Error('Inline approval did not clear bubble/card');atlasColab.selectChat('colab-two');if(colab.hidden||!colab.textContent.includes('Other chat'))throw Error('Switching chats lost scoped approval');bubble.click();await wait(()=>document.querySelector('.productivity-dialog').open);const modal=document.querySelector('.productivity-dialog');[...modal.querySelectorAll('.workbench-row')].find(row=>row.textContent.includes('Other chat')).querySelector('button').click();await wait(()=>answers.length===2);if(!colab.hidden||!bubble.textContent.includes('1 approval'))throw Error('Bubble answer did not dismiss inline card');modal.querySelector('header button').click();atlasColab.selectAssistant();await atlasAssistant.open('assistant-one');const assistant=document.querySelector('.chat-approvals[data-workspace="assistant"]');await wait(()=>!assistant.hidden);assistant.querySelector('textarea').value='src/game.py';assistant.querySelector('textarea').dispatchEvent(new Event('input'));document.querySelector('#newChat').click();if(!assistant.hidden)throw Error('Approval leaked into new Assistant chat');await atlasAssistant.open('assistant-one');if(assistant.hidden||assistant.querySelector('textarea').value!=='src/game.py')throw Error('Approval answer draft lost across chats');[...assistant.querySelectorAll('button')].find(button=>button.textContent==='Send answer').click();await wait(()=>answers.length===3);if(answers[2].text!=='src/game.py'||!assistant.hidden||!bubble.hidden)throw Error('Text approval did not synchronize');testApprovals=[{id:'stop-request',jobId:'j1',provider:'codex',title:'Pending action',details:'Cancel test',choices:['Allow','Allow once','Deny']}];for(const listener of approvalListeners)listener(testApprovals);atlasColab.selectChat('colab-one');if(colab.hidden)throw Error('New request missing');testApprovals=[];for(const listener of approvalListeners)listener([]);if(!colab.hidden||!bubble.hidden)throw Error('Cancelled request remained visible');testApprovals=[{id:'remember-request',jobId:'j1',provider:'codex',title:'Allow screen control?',details:'Remember this chat',choices:['Allow','Allow once','Deny']}];for(const fn of approvalListeners)fn(testApprovals);[...colab.querySelectorAll('button')].find(b=>b.textContent==='Allow').click();await wait(()=>testPermissions.length===1);const bar=document.querySelector('.screen-control-bar[data-workspace="colab"]');if(bar.hidden)throw Error('Remembered control indicator missing');atlasColab.selectChat('colab-two');if(bar.hidden||!bar.textContent.includes('Computer control: ask first'))throw Error('Permission state leaked to another chat');atlasColab.selectChat('colab-one');if(bar.hidden)throw Error('Permission indicator did not return');bar.querySelector('button').click();await wait(()=>!testPermissions.length);if(!bar.textContent.includes('Computer control: ask first'))throw Error('Revoke did not clear indicator');bar.querySelector('button').click();await wait(()=>testPermissions.some(row=>row.owner==='colab:colab-one'));if(!bar.textContent.includes('Screen control allowed'))throw Error('Explicit control switch did not grant permission');bar.querySelector('button').click();await wait(()=>!testPermissions.length);})()`,
    );
    // The PowerShell bar shows only for a chat that allows PowerShell, revokes it, and command rows say how
    // they were approved and expand to their output.
    await win.webContents.executeJavaScript(
      `(async()=>{const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('PowerShell UI did not update');};atlasColab.selectChat('colab-one');const shell=document.querySelector('.shell-control-bar[data-workspace="colab"]');if(!shell||!shell.hidden)throw Error('PowerShell bar shown without a grant');testShell=[{owner:'colab:colab-one',id:'shell'}];for(const fn of permissionListeners)fn(testPermissions);await wait(()=>!shell.hidden);if(!shell.textContent.includes('PowerShell allowed for this chat'))throw Error('PowerShell bar text missing');if(!document.querySelector('.colab-run-details>summary').textContent.includes('PowerShell allowed'))throw Error('Collapsed run details hide the PowerShell grant');atlasColab.selectChat('colab-two');if(!shell.hidden)throw Error('PowerShell grant leaked to another chat');atlasColab.selectChat('colab-one');if(shell.hidden)throw Error('PowerShell bar did not return');shell.querySelector('button').click();await wait(()=>shell.hidden);if(shellRevokes!==1)throw Error('Revoke did not call revoke-shell');await wait(()=>[...document.querySelectorAll('.task-command')].some(node=>node.textContent.includes('npm run build')));const command=[...document.querySelectorAll('.task-command')].find(node=>node.textContent.includes('npm run build'));if(!command.querySelector('summary').textContent.includes('approved for this chat'))throw Error('Command row does not say how it was approved: '+command.querySelector('summary').textContent);if(!command.textContent.includes('built ok'))throw Error('Command output missing');})()`,
    );
    const compact = await win.webContents.executeJavaScript(
      `(async()=>{atlasColab.selectChat('colab-one');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const main=document.querySelector('.colab-chat-main'),transcript=document.querySelector('#colabTranscript'),form=document.querySelector('#colabForm'),details=document.querySelector('.colab-run-details');return {main:main.clientHeight,transcript:transcript.clientHeight,composer:form.offsetHeight,collapsed:!details.open};})()`,
    );
    if (process.env.ATLAS_COMPACT_CAPTURE)
      fs.writeFileSync(process.env.ATLAS_COMPACT_CAPTURE, (await win.webContents.capturePage()).toPNG());
    assert(compact.collapsed);
    assert(compact.composer < 155, JSON.stringify(compact));
    assert(
      compact.transcript > compact.main * 0.5,
      JSON.stringify({
        ...compact,
        rows: await win.webContents.executeJavaScript(
          `[...document.querySelector('.colab-chat-main').children].map(el=>({name:el.className,height:Math.round(el.getBoundingClientRect().height)}))`,
        ),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(await win.webContents.executeJavaScript('document.body.dataset.workspace'), 'colab');
    if (process.env.ATLAS_COMPACT_CAPTURE)
      fs.writeFileSync(process.env.ATLAS_COMPACT_CAPTURE, (await win.webContents.capturePage()).toPNG());
    for (const [width, height] of [
      [1280, 800],
      [1024, 640],
      [640, 600],
    ]) {
      win.setContentSize(width, height);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const bounds = await win.webContents.executeJavaScript(
        `({height:innerHeight,outer:document.documentElement.scrollHeight,bottom:document.querySelector('#colabForm').getBoundingClientRect().bottom})`,
      );
      assert(bounds.outer <= bounds.height + 1 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
      if (width === 1024) {
        const compactRoom = await win.webContents.executeJavaScript(
          `({main:document.querySelector('.colab-chat-main').clientHeight,transcript:document.querySelector('#colabTranscript').clientHeight,composer:document.querySelector('#colabForm').offsetHeight})`,
        );
        assert(compactRoom.transcript > compactRoom.main * 0.5, JSON.stringify(compactRoom));
        assert(compactRoom.composer < 155, JSON.stringify(compactRoom));
      }
    }
    console.log(
      'PASS: Chat-scoped Colab and Assistant approval cards, active-user takeover choice, text answers, chat switching, bottom-bubble synchronization, cancellation, PowerShell grant bar and command rows, and responsive layout.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    win?.destroy();
    app.exit(process.exitCode || 0);
  }
});
