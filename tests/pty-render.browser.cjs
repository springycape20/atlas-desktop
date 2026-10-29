const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: 'atlas', privileges: { standard: true, secure: true } }]);
app.whenReady().then(async () => {
  const controller = new AbortController();
  let done;
  try {
    protocol.handle('atlas', async (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/')
        return new Response(
          '<html><head><link rel="stylesheet" href="/node_modules/@xterm/xterm/css/xterm.css"></head><body style="background:#0c0f10"><div id="term"></div><script src="/node_modules/@xterm/xterm/lib/xterm.js"></script><script>window.term=new Terminal({cols:80,rows:24,fontFamily:"Consolas",fontSize:13});term.open(document.getElementById("term"));window.write=text=>new Promise(resolve=>term.write(text,resolve));window.snapshot=()=>({y:term.buffer.active.cursorY,x:term.buffer.active.cursorX,lines:Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i).translateToString(true))});</script></body></html>',
          { headers: { 'Content-Type': 'text/html' } },
        );
      return new Response(await fs.readFile(path.join(__dirname, '..', pathname)), {
        headers: { 'Content-Type': pathname.endsWith('.css') ? 'text/css' : 'application/javascript' },
      });
    });
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 600,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadURL('atlas://app/');
    let handle,
      pending = Promise.resolve(),
      output = '',
      busy;
    done = require('../pty-session').runPty(os.tmpdir(), {
      signal: controller.signal,
      timeoutMs: 20000,
      onBusy: (value) => (busy = value),
      onStart: (value) => (handle = value),
      onOutput: (text) => {
        output += text;
        pending = pending.then(() => win.webContents.executeJavaScript('write(' + JSON.stringify(text) + ')'));
      },
    });
    for (let i = 0; i < 100 && !output.includes('> '); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 200));
    await pending;
    const before = await win.webContents.executeJavaScript('snapshot()');
    handle.write('echo hi');
    await new Promise((r) => setTimeout(r, 700));
    await pending;
    const after = await win.webContents.executeJavaScript('snapshot()');
    assert.equal(after.y, before.y, 'Typing must remain on the prompt row: ' + JSON.stringify({ before, after }));
    assert(
      after.lines.some((line) => /> echo hi\s*$/.test(line)),
      'Command must follow the visible prompt: ' + JSON.stringify(after),
    );
    assert.equal(busy, false, 'Prompt detection must still mark the shell idle');
    for (const cols of [60, 100]) {
      handle.write('\r');
      for (let i = 0; i < 100 && busy; i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal(busy, false, 'Command completion must restore idle state');
      await win.webContents.executeJavaScript('term.resize(' + cols + ',24)');
      handle.resize(cols, 24);
      await new Promise((r) => setTimeout(r, 200));
      await pending;
      const prompt = await win.webContents.executeJavaScript('snapshot()');
      handle.write('echo hi');
      await new Promise((r) => setTimeout(r, 350));
      await pending;
      const typed = await win.webContents.executeJavaScript('snapshot()');
      assert.equal(typed.y, prompt.y, 'Typing moved after resize to ' + cols);
      assert(typed.lines.some((line) => /> echo hi\s*$/.test(line)));
      assert(!typed.lines.some((line) => line.includes('ATLAS_PROMPT_')));
    }
    await fs.mkdir(path.join(__dirname, '../.handover'), { recursive: true });
    await fs.writeFile(
      path.join(__dirname, '../.handover/pty-typing-fixed.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log('PASS: Real PowerShell typed input stays beside the rendered xterm prompt.');
    controller.abort();
    await done;
    app.exit(0);
  } catch (error) {
    controller.abort();
    await done;
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('PTY render test timed out');
  app.exit(1);
}, 25000).unref();
