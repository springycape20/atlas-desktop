const { app, BrowserWindow, protocol } = require('electron'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createProjectFiles } = require('../project-files');
const root = path.join(__dirname, '..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-file-ui-')),
  project = path.join(temp, 'project');
fs.mkdirSync(project);
fs.copyFileSync(path.join(root, 'docs/images/assistant.png'), path.join(project, 'preview.png'));
fs.writeFileSync(
  path.join(project, 'README.md'),
  '# Demo project\n\n<script>window.injected=true</script>\nRead-only source.',
);
fs.writeFileSync(
  path.join(project, 'style.css'),
  'body{font:18px system-ui;margin:32px;background:#f1f4f5;color:#17343c}h1{color:rgb(20,64,70)}img{max-width:95%;max-height:260px;object-fit:contain}',
);
fs.writeFileSync(
  path.join(project, 'index.html'),
  '<html><head><link rel="stylesheet" href="style.css"></head><body onload="window.unsafePreview=true"><h1>Project dashboard</h1><p>Local project preview</p><img src="preview.png"><script>window.unsafePreview=true;parent.postMessage("unsafe", "*")</script><iframe src="https://example.invalid"></iframe><a href="https://example.invalid">Remote link</a></body></html>',
);
const answer =
  'Here is your project.\n\n![Project screenshot](preview.png)\n\n[Read the project file](README.md) · [Open page](index.html)\n\n`README.md`\n\n![Remote image](https://example.invalid/track.png)';
const chat = {
  id: 'assistant-preview',
  title: 'Project output preview',
  cwd: project,
  turns: [
    { role: 'user', content: 'Show the project' },
    { role: 'assistant', content: answer },
  ],
};
const mock = `localStorage.setItem('atlas.colab.chats.v1',JSON.stringify({chats:[{id:'colab-preview',title:'Colab project output',cwd:${JSON.stringify(project)},messages:[{id:'preview-message',role:'assistant',content:${JSON.stringify(answer)}}]}],selected:'colab-preview'}));window.fileUiErrors=[];window.addEventListener('error',e=>fileUiErrors.push(e.message));window.atlas=new Proxy({projectFile:async request=>{const response=await fetch('/__file?request='+encodeURIComponent(JSON.stringify(request)));const value=await response.json();if(value.error)throw Error(value.error);return value;},getSettings:async()=>({speakResponses:false,wakeWordEnabled:false}),home:async()=>${JSON.stringify(project)},latestConversation:async()=>null,historyList:async()=>[${JSON.stringify({ ...chat, turns: undefined, provider: 'atlas', turnCount: 2 })}],historyRead:async()=>(${JSON.stringify(chat)}),jobs:async()=>[],taskQueue:async()=>({items:[],paused:true}),providerAuthStatus:async()=>({}),discoverModels:async()=>({}),chatMetadata:async()=>({})},{get:(t,k)=>t[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>[])});`;
app.disableHardwareAcceleration();
new (require('node:vm').Script)(mock);
app.setPath('userData', path.join(temp, 'data'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const files = createProjectFiles(),
  calls = [];
let win;
const timeout = setTimeout(() => {
  console.error('Project-file UI timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', async (request) => {
      const url = new URL(request.url),
        file = url.pathname.slice(1);
      if (file === '__mock.js') return new Response(mock, { headers: { 'Content-Type': 'application/javascript' } });
      if (file === '__file') {
        try {
          const data = JSON.parse(url.searchParams.get('request'));
          calls.push(data);
          const value =
            data.action === 'list'
              ? await files.list(project, data.path)
              : data.action === 'attach'
                ? [{ id: 'attached-project', name: path.basename(data.path), type: 'text', size: 100 }]
                : data.action === 'reveal'
                  ? { revealed: true }
                  : await files.read(project, data.path);
          return Response.json(value);
        } catch (error) {
          return Response.json({ error: error.message });
        }
      }
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
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    const run = (source) => win.webContents.executeJavaScript(source);
    const wait = async (source) => {
      for (let i = 0; i < 150; i++) {
        if (await run(source)) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error('UI did not reach: ' + source);
    };
    await run(
      `(async()=>{await atlasAssistant.ready;await atlasColab.ready;await atlasAssistant.open('assistant-preview');})()`,
    );
    await wait(`Boolean(document.querySelector('.assistant-turn .project-output-card img')?.naturalWidth)`);
    assert.equal(
      await run(
        `(()=>{const target=document.createElement('div');renderAnswer('Version '+String.fromCharCode(96)+'0.9.0'+String.fromCharCode(96),target);return target.querySelectorAll('.project-file-link').length;})()`,
      ),
      0,
    );
    assert.equal(await run(`document.querySelectorAll('img[src^="http"]').length`), 0);
    const shots = path.join(root, '.handover', 'project-file-previews');
    fs.mkdirSync(shots, { recursive: true });
    fs.writeFileSync(path.join(shots, 'chat-output.png'), (await win.webContents.capturePage()).toPNG());
    await run(
      `[...document.querySelectorAll('.assistant-turn .project-file-link')].find(item=>item.textContent==='Read the project file').click()`,
    );
    await wait(
      `document.querySelector('.project-file-source')?.textContent.includes('<script>window.injected=true</script>')`,
    );
    assert.equal(await run('window.injected'), undefined);
    await run(
      `[...document.querySelectorAll('.project-file-tools button')].find(item=>item.textContent==='Attach to next message').click()`,
    );
    await wait(`document.querySelector('.project-file-status').textContent.includes('Attached to the next')`);
    assert(calls.some((call) => call.action === 'attach'));
    fs.writeFileSync(path.join(shots, 'source-preview.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('.project-file-dialog').close();new Promise(r=>setTimeout(r,30))`);
    await run(
      `[...document.querySelectorAll('.assistant-turn .project-file-link')].find(item=>item.textContent==='Open page').click()`,
    );
    await wait(`Boolean(document.querySelector('.project-file-content iframe'))`);
    await new Promise((r) => setTimeout(r, 250));
    const frame = win.webContents.mainFrame.frames.find((item) => item.url === 'about:srcdoc');
    assert(frame, 'Static page frame did not load');
    const page = await run(`document.querySelector('.project-file-content iframe').srcdoc`);
    assert.match(page, /Project dashboard/);
    assert.match(page, /rgb\(20,64,70\)/);
    assert.match(page, /data:image\/png;base64,/);
    assert.doesNotMatch(page, /<script[\s>]|<iframe[\s>]|onload=|href="https:/i);
    assert.equal(await run('window.unsafePreview'), undefined);
    await assert.rejects(frame.executeJavaScript('true'), /Script not run|blocked/i);
    assert.equal(await run(`document.querySelector('.project-file-content iframe').getAttribute('sandbox')`), '');
    fs.writeFileSync(path.join(shots, 'page-preview.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('.project-file-dialog').close();new Promise(r=>setTimeout(r,30))`);
    await run(`atlasColab.selectChat('colab-preview')`);
    await wait(`Boolean(document.querySelector('.colab-message .project-output-card img')?.naturalWidth)`);
    fs.writeFileSync(path.join(shots, 'colab-output.png'), (await win.webContents.capturePage()).toPNG());
    await run(`atlasProjectFiles.browse({scope:'colab',cwd:${JSON.stringify(project)},chatId:'colab-preview'})`);
    await wait(`document.querySelector('.project-file-list')?.textContent.includes('README.md')`);
    await new Promise((r) => setTimeout(r, 120));
    assert(
      await run(`document.querySelector('.project-file-dialog').getBoundingClientRect().height<650`),
      'Small project folders should not stretch the dialog across the whole window.',
    );
    fs.writeFileSync(path.join(shots, 'file-browser.png'), (await win.webContents.capturePage()).toPNG());
    const inspection = await run(
      `(()=>{const copy=document.querySelector('.project-file-dialog').cloneNode(true);const styles=[...document.querySelectorAll('style')].map(item=>item.outerHTML).join('');return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS project file browser</title>'+styles+'<style>'+${JSON.stringify(fs.readFileSync(path.join(root, 'ui-shell.css'), 'utf8'))}+'</style><style>body{margin:0;padding:16px;background:#0c171e;min-height:0;height:auto;overflow:auto}.project-file-dialog{position:relative;inset:auto;margin:0 auto;max-width:100%;height:calc(100vh - 32px);box-sizing:border-box}</style></head><body class="atlas-ui"><main>'+copy.outerHTML.replace('<dialog','<section').replace('</dialog>','</section>')+'</main></body></html>';})()`,
    );
    fs.writeFileSync(path.join(shots, 'inspect.html'), inspection);
    for (const [width, height] of [
      [768, 800],
      [640, 700],
    ]) {
      win.setContentSize(width, height);
      await new Promise((r) => setTimeout(r, 80));
      const bounds = await run(
        `({width:innerWidth,dialog:document.querySelector('.project-file-dialog').getBoundingClientRect().right,overflow:document.documentElement.scrollWidth})`,
      );
      assert(bounds.dialog <= bounds.width + 1 && bounds.overflow <= bounds.width + 1, JSON.stringify(bounds));
    }
    assert.deepEqual(await run('fileUiErrors'), []);
    console.log(
      'PASS: Chat/Colab inline local images, file links, source preview, explicit attachment, isolated static HTML/CSS/assets, file browsing and narrow layout. Screenshots: ' +
        shots,
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
