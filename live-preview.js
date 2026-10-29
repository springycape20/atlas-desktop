const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
function previewUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw Error('Use an HTTP development server on localhost or 127.0.0.1.');
  return url;
}
function createLivePreview({ electron, directory, parent, approve, importPaths, spawnProcess = spawn }) {
  const { BrowserWindow, session } = electron,
    guard = require('./project-root').createProjectRootGuard();
  let win,
    root,
    origin,
    child,
    output = '',
    selected = null,
    stopped = false;
  const key = '__atlasPick' + randomUUID().replaceAll('-', '');
  const state = () => ({
    open: Boolean(win && !win.isDestroyed()),
    cwd: root,
    running: Boolean(child),
    url: origin || '',
    output,
    selected,
  });
  const stop = () => {
    stopped = true;
    if (!child) return;
    if (process.platform === 'win32' && child.pid) {
      const kill = spawnProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      kill.on('error', () => child?.kill());
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill();
      }
    }
  };
  async function open(cwd, value) {
    const url = previewUrl(value);
    cwd = await guard.assertProject(cwd);
    if (child && root !== cwd) throw Error('Stop the current project server before switching projects.');
    root = cwd;
    origin = url.origin;
    selected = null;
    if (win && !win.isDestroyed()) win.destroy();
    const isolated = session.fromPartition('atlas-preview-' + randomUUID());
    isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on('will-download', (event) => event.preventDefault());
    isolated.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try {
        const target = new URL(details.url);
        allowed =
          target.origin === origin ||
          (target.protocol === 'ws:' && target.host === new URL(origin).host) ||
          ['data:', 'blob:'].includes(target.protocol);
      } catch {}
      callback({ cancel: !allowed });
    });
    const bounds = parent()?.getBounds?.();
    win = new BrowserWindow({
      title: 'ATLAS · Live project preview',
      width: 850,
      height: 720,
      ...(bounds ? { x: bounds.x + Math.max(100, bounds.width - 500), y: bounds.y + 40 } : {}),
      webPreferences: {
        session: isolated,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
      },
    });
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, target) => {
      try {
        if (previewUrl(target).origin !== origin) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    win.webContents.on('will-redirect', (event, target) => {
      try {
        if (previewUrl(target).origin !== origin) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    await win.loadURL(url.href);
    return state();
  }
  async function start(cwd) {
    if (child) throw Error('Stop the current preview server first.');
    cwd = await guard.assertProject(cwd);
    const vite = await fs.realpath(path.join(cwd, 'node_modules/vite/bin/vite.js')).catch(() => null);
    if (!vite || !require('./project-files').within(cwd, vite))
      throw Error(
        'Automatic start supports an already installed Vite project. Start other servers yourself, then open their local URL here.',
      );
    let node;
    for (const folder of (process.env.PATH || '').split(path.delimiter)) {
      if (!path.isAbsolute(folder)) continue;
      const candidate = path.join(folder, process.platform === 'win32' ? 'node.exe' : 'node');
      if (
        await fs.stat(candidate).then(
          (s) => s.isFile(),
          () => false,
        )
      ) {
        node = candidate;
        break;
      }
    }
    if (!node) throw Error('Install Node.js and add it to PATH before starting a Vite preview.');
    if (
      !(await approve(
        'Start a local development server?',
        cwd +
          '\n\nRuns installed Vite with Node.js on 127.0.0.1:5173. Project configuration and plugins execute with your account permissions. No dependencies are installed.',
      ))
    )
      return { cancelled: true };
    root = cwd;
    output = '';
    stopped = false;
    child = spawnProcess(node, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
      cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const current = child;
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (part) => {
        output = (output + part.toString().replace(/\x1b\[[0-9;]*m/g, '')).slice(-32000);
      });
    child.once('error', (error) => {
      output += '\n' + error.message;
      if (child === current) child = null;
    });
    child.once('close', (code) => {
      output += '\nPreview server ' + (stopped ? 'stopped.' : 'exited (' + code + ').');
      if (child === current) child = null;
    });
    return { ...state(), url: 'http://127.0.0.1:5173/' };
  }
  async function action(request) {
    if (request.action === 'status') return state();
    if (request.action === 'stop') {
      stop();
      return state();
    }
    if (request.action === 'close') {
      if (win && !win.isDestroyed()) win.destroy();
      return state();
    }
    if (request.action === 'start') return start(request.cwd);
    if (request.action === 'open') return open(request.cwd, request.url);
    if (!win || win.isDestroyed()) throw Error('Open a live preview first.');
    if ((await guard.assertProject(request.cwd)) !== root)
      throw Error('Switch back to the project used by this preview.');
    if (request.action === 'reload') {
      win.webContents.reload();
      return state();
    }
    if (request.action === 'inspect') {
      selected = null;
      await win.webContents.executeJavaScript(
        `(() => { const key=${JSON.stringify(key)}; if(window[key]?.handler)document.removeEventListener('click',window[key].handler,true); const handler=e=>{e.preventDefault();e.stopImmediatePropagation();const el=e.target;const parts=[];let current=el;for(let n=0;current&&n<5;n++,current=current.parentElement){let part=current.tagName.toLowerCase();if(current.id){parts.unshift(part+'#'+CSS.escape(current.id));break;}const siblings=current.parentElement?[...current.parentElement.children].filter(x=>x.tagName===current.tagName):[];if(siblings.length>1)part+=':nth-of-type('+(siblings.indexOf(current)+1)+')';parts.unshift(part);}window[key]={value:{selector:parts.join(' > '),text:(el.textContent||'').trim().slice(0,500)},handler:null};document.removeEventListener('click',handler,true);};window[key]={handler};document.addEventListener('click',handler,true);})()`,
      );
      win.focus();
      return { picking: true };
    }
    if (request.action === 'capture') {
      const picked = await win.webContents.executeJavaScript(`window[${JSON.stringify(key)}]?.value || null`);
      selected =
        picked && typeof picked.selector === 'string'
          ? { selector: picked.selector.slice(0, 1000), text: String(picked.text || '').slice(0, 500) }
          : null;
      const image = await win.webContents.capturePage(),
        location = path.join(directory, 'preview-' + randomUUID() + '.png');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(location, image.toPNG());
      try {
        return { attachments: await importPaths([location]), selected, cwd: root };
      } finally {
        await fs.unlink(location).catch(() => {});
      }
    }
    throw Error('Unknown preview action.');
  }
  let serial = Promise.resolve();
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
    dispose() {
      stop();
      if (win && !win.isDestroyed()) win.destroy();
    },
  };
}
module.exports = { previewUrl, createLivePreview };
