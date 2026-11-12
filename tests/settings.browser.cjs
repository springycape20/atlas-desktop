const { app, BrowserWindow, protocol } = require('electron');
const { offscreenFrame } = require('./fixtures/offscreen-frame.cjs');
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
const mock = `window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows',autoListenReplies:false}),home:async()=>'C:/Projects',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'current',currentVersion:'test'}),onUpdateStatus:fn=>{window.pushUpdate=fn;return()=>{};},chatMetadata:async()=>({}),saveSettings:async(next)=>next},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
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
        return new Response(
          "window.__uiErrors=[];window.addEventListener('error',event=>__uiErrors.push(event.message));" + mock,
          { headers: { 'Content-Type': 'application/javascript;charset=utf-8' } },
        );
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
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.error(event.message);
    });
    await win.loadURL('atlas://app/');
    const scriptErrors = await win.webContents.executeJavaScript('window.__uiErrors');
    if (scriptErrors.length) throw Error(scriptErrors.join('\n'));
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms)),$=(s)=>document.querySelector(s),$$=(s)=>[...document.querySelectorAll(s)];
      const fail=(message)=>{throw Error(message)};
      await wait(500);
      const visible=(node)=>Boolean(node&&node.getClientRects().length);
      const shown=()=>$$('#settingsDialog .setting-section').filter(visible).map(s=>s.querySelector('h3').textContent);
      const nav=()=>$$('.settings-nav-item');
      $('#settingsOpen').click();await wait(200);
      if(!$('#settingsDialog').open)fail('Settings did not open');
      const hint=$('.settings-nav-item[aria-current="true"] small'),hintStyle=getComputedStyle(hint);
      if(parseFloat(hintStyle.fontSize)<13)fail('Settings hint text is too small: '+hintStyle.fontSize);
      const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number),lum=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
      const foreground=lum(rgb(hintStyle.color)),background=lum(rgb(getComputedStyle(hint.parentElement).backgroundColor));
      if((Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)<4.5)fail('Selected Settings hint contrast is below 4.5:1');
      const order=nav().map(b=>b.dataset.section);
      const expected=['Provider accounts','Models','Appearance','Provider activity','Assistant','Voice','Microphone','Permissions','Transparency','Startup','App updates','Tools and data','Diagnostics'];
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
      fs.writeFileSync(process.env.ATLAS_SETTINGS_NARROW_SHOT, (await offscreenFrame(win)).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
      document.querySelector('#settingsClose').click();
      window.updateRequests=[];window.updateBusy=true;
      atlas.saveSettings=async value=>{window.updateSaved=value;return value;};
      await new Promise(r=>setTimeout(r,20));document.querySelector('#settingsOpen').click();await new Promise(r=>setTimeout(r,50));
      atlasSettings.show('App updates');
      const automatic=document.querySelector('#autoDownloadUpdates');
      if(automatic.checked)throw Error('Automatic updates must be opt-in');
      automatic.checked=true;automatic.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#settingsSave').click();await new Promise(r=>setTimeout(r,80));
      if(!updateSaved.autoDownloadUpdates)throw Error('Automatic download preference missing from Save');
    })()`);
    // Drive the registered startup listener with an asynchronous release notification.
    await win.webContents.executeJavaScript(`(async()=>{
      window.updateVersion='1.2.0';
      atlas.updates=async request=>{updateRequests.push(request.action);if(request.action==='download')return {status:'downloaded',version:updateVersion,currentVersion:'1.0.0'};if(request.action==='install'){if(updateBusy)throw Error('Finish or stop running tasks before installing the update.');return {status:'installing',version:updateVersion};}return {status:'available',version:updateVersion,currentVersion:'1.0.0'};};
      const button=[...document.querySelectorAll('#settingsDialog button')].find(b=>b.textContent==='Check for updates');
      button.click();await new Promise(r=>setTimeout(r,50));
      if(!document.querySelector('#updatePrompt').open)throw Error('Update announcement missing');
      if(!document.querySelector('#updatePrompt').textContent.includes('1.2.0'))throw Error('Available version missing');
      if(updateRequests.includes('download')||updateRequests.includes('install'))throw Error('Prompt started an unrequested update');
    })()`);
    const shots = path.join(root, '.handover', 'update-ui');
    fs.mkdirSync(shots, { recursive: true });
    for (const width of [1280, 640, 390]) {
      win.setContentSize(width, width === 390 ? 844 : 800);
      await new Promise((r) => setTimeout(r, 50));
      await win.webContents.executeJavaScript(
        `(()=>{const d=document.querySelector('#updatePrompt');const box=d.getBoundingClientRect();if(box.left<0||box.right>innerWidth+1||d.scrollWidth>d.clientWidth+1)throw Error('Update prompt overflow');})()`,
      );
      fs.writeFileSync(path.join(shots, 'available-' + width + '.png'), (await offscreenFrame(win)).toPNG());
    }
    await win.webContents.executeJavaScript(`(async()=>{
      const dialog=document.querySelector('#updatePrompt'),buttons=()=>[...dialog.querySelectorAll('button')];
      buttons().find(b=>b.textContent==='Download update').click();await new Promise(r=>setTimeout(r,50));
      if(!buttons().some(b=>b.textContent==='Restart and install')||updateRequests.includes('install'))throw Error('Download did not await explicit restart');
      buttons().find(b=>b.textContent==='Restart and install').click();await new Promise(r=>setTimeout(r,50));
      if(!dialog.textContent.includes('Finish or stop running tasks'))throw Error('Busy install error missing');
      buttons().find(b=>b.textContent==='Later').click();await new Promise(r=>setTimeout(r,30));
      if(dialog.open)throw Error('Later did not dismiss update');
      [...document.querySelectorAll('#settingsDialog button')].find(b=>b.textContent==='Check for updates').click();await new Promise(r=>setTimeout(r,50));
      if(dialog.open)throw Error('Same update prompted twice during one launch');
      updateVersion='1.3.0';
      document.querySelector('#settingsOpen').click();await new Promise(r=>setTimeout(r,60));atlasSettings.show('App updates');
      [...document.querySelectorAll('#settingsDialog button')].find(b=>b.textContent==='Check for updates').click();await new Promise(r=>setTimeout(r,50));
      if(dialog.open)throw Error('Update stole focus from another dialog');
      document.querySelector('#settingsClose').click();await new Promise(r=>setTimeout(r,50));
      if(!dialog.open)throw Error('Deferred update prompt missing after Settings closed');
      buttons().find(b=>b.textContent==='Download update').click();await new Promise(r=>setTimeout(r,50));
      updateBusy=false;buttons().find(b=>b.textContent==='Restart and install').click();await new Promise(r=>setTimeout(r,50));
      if(!dialog.textContent.includes('Restarting'))throw Error('Explicit install request missing');
    })()`);
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
