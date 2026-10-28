const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-navigation-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const mock = `window.__uiErrors=[];window.addEventListener('error',e=>__uiErrors.push(e.message));window.__saved={speakResponses:false,wakeWordEnabled:false};window.atlas=new Proxy({getSettings:async()=>structuredClone(__saved),home:async()=>'C:/Projects/Demo',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({}),discoverModels:async()=>({}),chatMetadata:async()=>({}),taskQueue:async()=>({items:[],paused:true,concurrency:1}),workflows:async()=>[],saveSettings:async value=>(__saved=structuredClone(value))},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
const timeout = setTimeout(() => {
  console.error('Navigation UI timed out');
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
      width: 1280,
      height: 800,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(
      `(async()=>{await new Promise(r=>setTimeout(r,300));const names=[...document.querySelectorAll('.workspace-nav>.nav-item')].filter(b=>getComputedStyle(b).display!=='none').map(b=>b.textContent.trim());if(JSON.stringify(names)!==JSON.stringify(['Chat','Colab','Projects','Tasks','Library','Settings']))throw Error('Navigation: '+JSON.stringify(names));await atlasUi.open('tasks','Queue');if(!atlasUi.hub.querySelector('#queueState'))throw Error('Queue did not mount');atlasUi.hub.close();await new Promise(r=>setTimeout(r,20));await atlasUi.open('library','Workflows');if(!atlasUi.hub.textContent.includes('Reusable Colab workflows'))throw Error('Workflows not in Library');atlasUi.hub.close();await new Promise(r=>setTimeout(r,20));await atlasUi.open('tasks','Recovery');if(!atlasUi.hub.textContent.includes('Saved tasks'))throw Error('Recovery not in Tasks');atlasUi.hub.close();await new Promise(r=>setTimeout(r,20));const handle=document.querySelector('.shell-chat-resize');handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));if(handle.getAttribute('aria-valuenow')!=='260')throw Error('Keyboard resize failed');if(document.querySelector('#send').getAttribute('form')!=='form')throw Error('Send lost its form');if(!document.querySelector('.colab-composer .shell-composer-tools #colabStart'))throw Error('Colab actions not grouped');})()`,
    );
    const out = path.join(root, '.handover', 'ui-navigation');
    fs.mkdirSync(out, { recursive: true });
    await win.webContents.executeJavaScript(`(async()=>{
      if(document.querySelector('.provider-usage-dock'))throw Error('Old overlapping dock remains');
      atlas.providerUsage=async()=>{throw Error('Subscription usage must not be polled');};
      const originalJobs=atlas.jobs, originalHealth=atlas.providerHealth;
      atlas.jobs=async()=>[{provider:'codex',status:'running'},{provider:'claude',status:'completed'},{collaboration:true,status:'completed'}];
      atlas.providerHealth=async()=>[{provider:'codex',available:true},{provider:'claude',available:false,retryAt:Date.now()+60000,estimated:true}];
      document.getElementById('providerActivityOpen').click();await new Promise(r=>setTimeout(r,100));
      const rows=[...document.querySelectorAll('.provider-activity-row')];
      if(rows.length!==3||!rows[0].textContent.includes('1 running')||!rows[1].textContent.includes('1 completed')||!rows[2].textContent.includes('1 retained tasks'))throw Error('Provider activity counts incorrect');
      if(!rows[0].textContent.includes('allowance is unknown')||!rows[1].textContent.includes('estimated retry'))throw Error('Availability labels misleading');
      atlas.jobs=originalJobs;atlas.providerHealth=originalHealth;
    })()`);
    fs.writeFileSync(path.join(out, 'provider-activity.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(
      `document.getElementById('settingsDialog').close();new Promise(r=>setTimeout(r,30))`,
    );
    await win.webContents.executeJavaScript(`atlasUi.open('tasks','Parallel')`);
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(out, 'tasks.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(r=>setTimeout(r,40));
      atlasUi.hub.close();await wait();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));
      if(!atlasCommandMenu.dialog.open)throw Error('Ctrl+K did not open search');
      const search=atlasCommandMenu.dialog.querySelector('input');
      search.value='appearance';search.dispatchEvent(new Event('input'));
      if(atlasCommandMenu.dialog.querySelectorAll('.command-results button').length!==1)throw Error('Command filtering failed');
      search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();
      if(!document.querySelector('#settingsDialog').open||atlasSettings.current()!=='Appearance')throw Error('Search did not navigate');
      const choose=(id,value)=>{const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));};
      choose('uiTheme','light');choose('uiTextScale','1.3');
      if(document.documentElement.dataset.uiTheme!=='light')throw Error('Theme preview failed');
      atlasCommandMenu.open();search.value='models';search.dispatchEvent(new Event('input'));search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();
      if(document.getElementById('uiTheme').value!=='light')throw Error('Navigation lost unsaved changes');
      document.querySelector('#settingsDialog').close();await wait();
      if(document.documentElement.dataset.uiTheme!=='dark')throw Error('Discarded preview persisted');
      await atlasUi.settings('Appearance');await wait();choose('uiTheme','contrast');choose('uiTextScale','1.15');choose('uiDensity','compact');
      document.getElementById('settingsSave').click();await wait();
      if(__saved.uiTheme!=='contrast'||__saved.uiTextScale!==1.15)throw Error('Appearance not included in save');
      await atlasUi.settings('Appearance');await wait();
      if(document.getElementById('uiTheme').value!=='contrast')throw Error('Saved appearance lost on reopen');
      if(__uiErrors.length)throw Error(__uiErrors.join('; '));
    })()`);
    for (const theme of ['light', 'contrast', 'dark']) {
      await win.webContents.executeJavaScript(
        `document.getElementById('uiTheme').value='${theme}';document.getElementById('uiTextScale').value='1.3';document.getElementById('uiTextScale').dispatchEvent(new Event('change',{bubbles:true}));`,
      );
      for (const width of [1280, 768, 640]) {
        win.setSize(width, 800);
        await new Promise((r) => setTimeout(r, 80));
        const overflow = await win.webContents.executeJavaScript(
          `document.documentElement.scrollWidth>innerWidth||document.getElementById('settingsDialog').scrollWidth>document.getElementById('settingsDialog').clientWidth+2`,
        );
        if (overflow) throw Error('Appearance overflows: ' + theme + ' ' + width);
        fs.writeFileSync(
          path.join(out, 'appearance-' + theme + '-' + width + '.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
    }
    win.setSize(1280, 800);
    await win.webContents.executeJavaScript(
      `document.getElementById('uiTheme').value='light';document.getElementById('uiTheme').dispatchEvent(new Event('change',{bubbles:true}));`,
    );
    const inspection = await win.webContents.executeJavaScript(`(()=>{
      const live=document.getElementById('settingsDialog'), copy=live.cloneNode(true);
      const h2=copy.querySelector('h2'), h1=document.createElement('h1');h1.textContent=h2.textContent;h1.style.cssText='font-size:23px;margin:0';h2.replaceWith(h1);
      [...live.querySelectorAll('select')].forEach((field,index)=>{[...copy.querySelectorAll('select')[index].options].forEach(option=>option.toggleAttribute('selected',option.value===field.value));});
      copy.querySelectorAll('.setting-section[hidden]').forEach(section=>section.remove());
      const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');
      return '<!doctype html><html data-ui-theme="light" data-ui-density="comfortable" style="--atlas-text-scale:1.3"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS Appearance demo</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8'))}+'</style><style>body{margin:0;padding:16px}#settingsDialog{display:flex;position:relative;inset:auto;margin:16px auto;max-width:100%;height:calc(100vh - 64px);box-sizing:border-box}</style></head><body class="atlas-ui"><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';
    })()`);
    fs.writeFileSync(path.join(out, 'inspect.html'), inspection);
    for (const theme of ['light', 'contrast']) {
      await win.webContents.executeJavaScript(
        `atlasAppearanceUi.saved({uiTheme:'${theme}',uiTextScale:1.3});document.getElementById('settingsDialog').close();`,
      );
      await new Promise((r) => setTimeout(r, 80));
      fs.writeFileSync(path.join(out, 'chat-' + theme + '.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`atlasUi.open('tasks','Parallel')`);
      await new Promise((r) => setTimeout(r, 80));
      fs.writeFileSync(path.join(out, 'tasks-' + theme + '.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`atlasUi.hub.close()`);
      await new Promise((r) => setTimeout(r, 40));
    }
    win.setSize(1280, 800);
    await win.webContents.executeJavaScript(
      `document.getElementById('settingsDialog').close();atlasCommandMenu.open();`,
    );
    await new Promise((r) => setTimeout(r, 80));
    fs.writeFileSync(path.join(out, 'search.png'), (await win.webContents.capturePage()).toPNG());
    console.log(
      'PASS: Navigation, embedded tools, keyboard resizing, composers, Ctrl+K search, saved/discarded appearance and three themes at three widths.',
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
