const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-settings-browser-');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-settings-browser-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const mock = `window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'kokoro',autoListenReplies:false}),home:async()=>'C:/Projects',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'current',currentVersion:'test'}),chatMetadata:async()=>({}),saveSettings:async(next)=>next},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
const timeout = setTimeout(() => {
  console.error('Settings browser test timed out');
  app.exit(1);
}, 60000);
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
        headers: { 'Content-Type': 'application/javascript;charset=utf-8' },
      });
    });
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms)),$=(s)=>document.querySelector(s),$$=(s)=>[...document.querySelectorAll(s)];
      const fail=(message)=>{throw Error(message)};
      await wait(500);
      const visible=(node)=>Boolean(node&&node.getClientRects().length);
      const shown=()=>$$('#settingsDialog .setting-section').filter(visible).map(s=>s.querySelector('h3').textContent);
      const nav=()=>$$('.settings-nav-item');
      $('#settingsOpen').click();await wait(200);
      if(!$('#settingsDialog').open)fail('Settings did not open');
      const order=nav().map(b=>b.dataset.section);
      const expected=['Provider accounts','Models','Assistant','Voice','Microphone','Permissions','Transparency','Startup','App updates','Tools and data'];
      if(JSON.stringify(order)!==JSON.stringify(expected))fail('Section order: '+JSON.stringify(order));
      if(JSON.stringify(shown())!=='["Provider accounts"]')fail('Expected only Provider accounts, saw '+JSON.stringify(shown()));
      if(nav()[0].getAttribute('aria-current')!=='true')fail('Current section is not marked');
      // Buttons from other scripts land in the right sections.
      const textOf=(name)=>$$('#settingsDialog .setting-section').find(s=>s.querySelector('h3').textContent===name).textContent;
      if(!textOf('Provider accounts').includes('Test connections and dependencies'))fail('Test connections missing from Provider accounts');
      if(textOf('Provider accounts').includes('Show log file'))fail('Show log file is still under Provider accounts');
      for(const label of ['Installed plugins and tools','Import chats from Codex or Claude','Show log file'])if(!textOf('Tools and data').includes(label))fail(label+' missing from Tools and data');
      if(textOf('App updates').includes('Installed plugins and tools'))fail('Plugins button is still under App updates');
      if(!textOf('Transparency').includes('Show model reasoning summaries')||$('#showReasoning').checked)fail('Reasoning summaries toggle missing or not off by default');
      // Switching sections, with the keyboard too.
      nav().find(b=>b.dataset.section==='Voice').click();await wait(50);
      if(JSON.stringify(shown())!=='["Voice"]')fail('Voice did not show: '+JSON.stringify(shown()));
      nav().find(b=>b.dataset.section==='Voice').focus();
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await wait(50);
      if(JSON.stringify(shown())!=='["Microphone"]'||document.activeElement.dataset.section!=='Microphone')fail('Arrow key did not move to Microphone');
      // Search across sections.
      const search=$('.settings-search');
      search.value='wake';search.dispatchEvent(new Event('input'));await wait(50);
      if(JSON.stringify(shown())!=='["Microphone"]')fail('Search for wake showed '+JSON.stringify(shown()));
      if(!visible($('#wakeWordEnabled').closest('label')))fail('Wake word row is not visible');
      if(visible($('#micSelect').closest('label')))fail('Unrelated microphone rows are still visible');
      if(!nav().find(b=>b.dataset.section==='Models').classList.contains('settings-no-match'))fail('Non-matching sections are not dimmed');
      search.value='voice';search.dispatchEvent(new Event('input'));await wait(50);
      if(!shown().includes('Voice')||shown().length<2)fail('Search for voice should span sections: '+JSON.stringify(shown()));
      search.value='timeout';search.dispatchEvent(new Event('input'));await wait(50);
      if(JSON.stringify(shown())!=='["Assistant"]')fail('Search for timeout showed '+JSON.stringify(shown()));
      search.value='zzzz';search.dispatchEvent(new Event('input'));await wait(50);
      if(shown().length||!visible($('.settings-empty'))||!$('.settings-empty').textContent.includes('zzzz'))fail('Empty search message missing');
      search.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await wait(50);
      if(search.value||!$('#settingsDialog').open)fail('Escape should clear the search, not close Settings');
      if(JSON.stringify(shown())!=='["Microphone"]')fail('Clearing search should return to the current section');
      // Unsaved changes.
      $('#routeMode').value='codex';$('#routeMode').dispatchEvent(new Event('change',{bubbles:true}));
      if($('#settingsSaved').textContent!=='Unsaved changes'||!$('.settings-footer').classList.contains('settings-dirty'))fail('Unsaved changes are not shown');
      $('#settingsClose').click();await wait(100);
      if(!$('#toast').textContent.includes('not saved'))fail('Closing with unsaved changes gave no warning');
      // Reopening starts clean and remembers the section.
      $('#settingsOpen').click();await wait(200);
      if($('#settingsSaved').textContent==='Unsaved changes')fail('Reopened Settings still says unsaved');
      if(JSON.stringify(shown())!=='["Microphone"]')fail('Last section was not remembered');
      // Saving clears the indicator without a warning.
      $('#toast').textContent='';
      $('#speechDetail').value='full';$('#speechDetail').dispatchEvent(new Event('change',{bubbles:true}));
      $('#settingsSave').click();await wait(300);
      if($('#settingsDialog').open)fail('Save did not close Settings');
      if($('#toast').textContent.includes('not saved'))fail('A saved change was reported as unsaved');
      // Narrow window: the section list becomes a row and nothing scrolls sideways.
      $('#settingsOpen').click();await wait(200);
    })()`);
    win.setContentSize(640, 600);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await win.webContents.executeJavaScript(`(async()=>{
      const navStyle=getComputedStyle(document.querySelector('.settings-nav'));
      if(navStyle.flexDirection!=='row')throw Error('Narrow layout did not switch to a row: '+navStyle.flexDirection);
      const dialog=document.querySelector('#settingsDialog').getBoundingClientRect();
      if(dialog.right>innerWidth+1||dialog.left<-1)throw Error('Settings is wider than the window');
      if(document.documentElement.scrollWidth>innerWidth+1)throw Error('The page scrolls sideways');
      const body=document.querySelector('.settings-body').getBoundingClientRect();
      if(body.height<120)throw Error('Too little room for settings in a narrow window: '+body.height);
    })()`);
    if (process.env.ATLAS_SETTINGS_NARROW_SHOT)
      fs.writeFileSync(process.env.ATLAS_SETTINGS_NARROW_SHOT, (await win.webContents.capturePage()).toPNG());
    console.log(
      'PASS: Settings lists sections in order, switches by click and keyboard, searches across sections, keeps buttons in the right sections, tracks unsaved changes and fits a narrow window.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    app.exit(process.exitCode || 0);
  }
});
