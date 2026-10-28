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
const mock = `window.atlas=new Proxy({getSettings:async()=>({speakResponses:false,wakeWordEnabled:false}),home:async()=>'C:/Projects/Demo',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({}),discoverModels:async()=>({}),chatMetadata:async()=>({}),taskQueue:async()=>({items:[],paused:true,concurrency:1}),workflows:async()=>[],saveSettings:async value=>value},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
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
    await win.webContents.executeJavaScript(`atlasUi.open('tasks','Parallel')`);
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(out, 'tasks.png'), (await win.webContents.capturePage()).toPNG());
    console.log(
      'PASS: Six destinations, embedded Queue/Workflows/Recovery, keyboard resizing and form-linked composers.',
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
