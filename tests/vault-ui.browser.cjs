const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { offscreenFrame } = require('./fixtures/offscreen-frame.cjs');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-vault-ui-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const mock = `
window.vaultState={folder:'',enabled:false};window.vaultCalls=[];
window.atlas=new Proxy({
getSettings:async()=>({wakeWordEnabled:false,speakResponses:false}),home:async()=>'C:/Projects/ATLAS',latestConversation:async()=>null,jobs:async()=>[],providerAuthStatus:async()=>({}),discoverModels:async()=>({}),updates:async()=>({}),chatMetadata:async()=>({}),
vaultSource:async(request)=>{vaultCalls.push(request);if(request.action==='choose')vaultState={folder:'C:/Notes/Project knowledge',enabled:false};if(request.action==='enable')vaultState.enabled=true;if(request.action==='disable')vaultState.enabled=false;if(request.action==='remove')vaultState={folder:'',enabled:false};return {...vaultState};},
contextPreview:async(request)=>{vaultCalls.push(request);return request.selection.vault&&vaultState.enabled?{sections:[{id:'vault',included:true,label:'Markdown vault excerpts',text:'LOCAL_NOTE_MARKER'}],vaultPreview:'reviewed-receipt',vaultIndexed:{indexed:3,truncated:true,warnings:['Oversize notes skipped'],contextSelection:{omitted:[{path:'other.md'}]},results:[{path:'decision.md',line:1,excerpt:'LOCAL_NOTE_MARKER'}]},note:'Local preview only'}:{sections:[],note:'Vault not selected'};}
},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});
window.__uiErrors=[];window.addEventListener('error',event=>__uiErrors.push(event.message));`;
const timeout = setTimeout(() => {
  console.error('Vault UI timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname.slice(1);
      if (file === '__mock.js') return new Response(mock, { headers: { 'Content-Type': 'application/javascript' } });
      const body = fs.readFileSync(path.join(root, file || 'index.html'));
      return new Response(file ? body : body.toString().replace('<head>', '<head><script src="/__mock.js"></script>'), {
        headers: {
          'Content-Type': !file
            ? 'text/html'
            : file.endsWith('.css')
              ? 'text/css'
              : file.endsWith('.png')
                ? 'image/png'
                : 'application/javascript',
        },
      });
    });
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 900,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') console.error(event.message);
    });
    await win.loadURL('atlas://app/');
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=()=>new Promise(r=>setTimeout(r,80));
      const button=label=>[...document.querySelectorAll('#powerDialog button')].find(node=>node.textContent===label);
      await atlasPower.show('Markdown vault');
      if(!document.querySelector('.power-body').textContent.includes('No Markdown folder'))throw Error('Missing unconfigured state');
      button('Choose / change folder').click();await wait();
      if(!document.querySelector('.power-body').textContent.includes('disabled'))throw Error('Chosen folder must start disabled');
      button('Enable source').click();await wait();
      document.querySelector('#prompt').value='quasar';
      await atlasPower.show('Context');await wait();
      const box=document.querySelector('[data-context="vault"]');
      if(box.checked)throw Error('Vault must default off per chat');
      box.checked=true;box.dispatchEvent(new Event('change'));button('Refresh preview').click();await wait();
      if(atlasPower.selection().vaultPreview!=='reviewed-receipt')throw Error('Preview receipt missing from request selection');
      const text=document.querySelector('.power-body').textContent;
      if(!text.includes('LOCAL_NOTE_MARKER')||!text.includes('scan limited')||!text.includes('Oversize notes skipped')||!text.includes('omitted by context budget'))throw Error('Missing preview/limit disclosure');
      button('Exclude this file').click();await wait();
      if(atlasPower.selection().vaultPreview)throw Error('Exclusion must invalidate preview');
      if(!atlasPower.selection().vaultFiles.includes('decision.md'))throw Error('Separate vault exclusions missing');
      if(atlasPower.selection().files.length)throw Error('Vault exclusion changed project exclusions');
      button('Refresh preview').click();await wait();
      button('Clear vault exclusions (1)').click();await wait();
    })()`);
    for (const width of [1440, 768, 390]) {
      win.setContentSize(width, 900);
      for (const view of ['Markdown vault', 'Context']) {
        await win.webContents.executeJavaScript(`atlasPower.show(${JSON.stringify(view)})`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await win.webContents.executeJavaScript(
          `(()=>{const body=document.querySelector('.power-body');if(body.scrollWidth>body.clientWidth+2)throw Error('Vault panel overflow');if(__uiErrors.length)throw Error(__uiErrors.join(String.fromCharCode(10)));})()`,
        );
        fs.writeFileSync(
          path.join(temp, view.replaceAll(' ', '-') + '-' + width + '.png'),
          (await offscreenFrame(win)).toPNG(),
        );
      }
    }
    await win.webContents.executeJavaScript(`(async()=>{
      await atlasPower.show('Markdown vault');
      const button=label=>[...document.querySelectorAll('#powerDialog button')].find(node=>node.textContent===label);
      button('Disable source').click();await new Promise(r=>setTimeout(r,80));
      if(vaultState.enabled)throw Error('Disable failed');
      button('Remove source').click();await new Promise(r=>setTimeout(r,80));
      if(vaultState.folder)throw Error('Remove failed');
    })()`);
    clearTimeout(timeout);
    console.log(
      'PASS: vault configuration, opt-in, preview receipt, separate exclusions, limit disclosure and responsive layouts. Screenshots: ' +
        temp,
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
