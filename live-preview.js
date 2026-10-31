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
  let browserErrors = [],
    lastRun = null,
    baseline = null,
    profileBaseline = null;
  const key = '__atlasPick' + randomUUID().replaceAll('-', '');
  const state = () => ({
    open: Boolean(win && !win.isDestroyed()),
    cwd: root,
    running: Boolean(child),
    url: origin || '',
    output,
    selected,
    browserErrors,
    lastRun,
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
  async function capturePreview() {
    try {
      return await win.webContents.capturePage();
    } catch {
      throw Error('ATLAS could not capture the preview window. Make sure it is open and visible, then try again.');
    }
  }
  async function open(cwd, value) {
    const url = previewUrl(value);
    cwd = await guard.assertProject(cwd);
    if (child && root !== cwd) throw Error('Stop the current project server before switching projects.');
    root = cwd;
    origin = url.origin;
    selected = null;
    browserErrors = [];
    lastRun = null;
    baseline = null;
    profileBaseline = null;
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
    win.webContents.on('console-message', (details) => {
      if (details && typeof details === 'object' && ['error', 'warning'].includes(details.level))
        browserErrors = browserErrors
          .concat({ level: details.level, message: String(details.message || '').slice(0, 2000), at: Date.now() })
          .slice(-40);
    });
    win.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame)
        browserErrors = browserErrors
          .concat({ level: 'error', message: String(code) + ': ' + String(description).slice(0, 1000), at: Date.now() })
          .slice(-40);
    });
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
    try {
      await win.loadURL(url.href);
    } catch (error) {
      if (win && !win.isDestroyed()) win.destroy();
      throw Error(
        'Nothing could be loaded from ' +
          url.href +
          '. Start the project server, then open the preview. (' +
          String(error.code || error.message).slice(0, 100) +
          ')',
      );
    }
    return state();
  }
  async function start(cwd, request) {
    if (child) throw Error('Stop the current preview server first.');
    cwd = await guard.assertProject(cwd);
    const recipe = await require('./preview-recipes').previewRecipe(cwd, request);
    if (
      !(await approve(
        'Start a local development server?',
        cwd +
          '\n\nRuns ' +
          recipe.executable +
          '\n' +
          recipe.args.join(' ') +
          '\nProject configuration and plugins execute with your account permissions. No dependencies are installed.',
      ))
    )
      return { cancelled: true };
    root = cwd;
    output = '';
    stopped = false;
    child = spawnProcess(recipe.executable, recipe.args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, BROWSER: 'none', NEXT_TELEMETRY_DISABLED: '1', FLASK_DEBUG: '0', FLASK_SKIP_DOTENV: '1' },
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
    return { ...state(), url: recipe.url };
  }
  async function action(request) {
    if (['browser-recipes', 'save-browser-recipe', 'delete-browser-recipe'].includes(request.action)) {
      const cwd = await guard.assertProject(request.cwd),
        file = path.join(directory, 'browser-check-recipes.json');
      const rows = JSON.parse(
        await fs.readFile(file, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return '[]';
          throw error;
        }),
      );
      if (request.action === 'browser-recipes') return rows.filter((row) => row.cwd === cwd);
      let next = rows;
      if (request.action === 'save-browser-recipe') {
        const name = String(request.name || '')
          .trim()
          .slice(0, 100);
        if (!name) throw Error('Give the browser recipe a name.');
        const steps = require('./preview-evidence').cleanSteps(request.steps),
          previous = rows.find((row) => row.cwd === cwd && row.name === name);
        if (rows.length >= 50 && !previous) throw Error('Up to 50 browser recipes can be saved.');
        next = rows.filter((row) => row !== previous).concat({ id: previous?.id || randomUUID(), cwd, name, steps });
      } else next = rows.filter((row) => !(row.cwd === cwd && row.id === request.id));
      const store = require('./atomic-store').createAtomicStore(file);
      await store.save(next);
      await store.flush();
      return next.filter((row) => row.cwd === cwd);
    }
    if (request.action === 'status') return state();
    if (request.action === 'stop') {
      stop();
      return state();
    }
    if (request.action === 'close') {
      if (win && !win.isDestroyed()) win.destroy();
      return state();
    }
    if (request.action === 'start') return start(request.cwd, request);
    if (request.action === 'open') return open(request.cwd, request.url);
    if (!win || win.isDestroyed()) throw Error('Open a live preview first.');
    if ((await guard.assertProject(request.cwd)) !== root)
      throw Error('Switch back to the project used by this preview.');
    if (request.action === 'reload') {
      win.webContents.reload();
      return state();
    }
    if (request.action === 'browser-checks') {
      const { cleanSteps, stepScript } = require('./preview-evidence'),
        steps = cleanSteps(request.steps);
      if (
        !(await approve(
          'Run browser checks in this preview?',
          root +
            '\n' +
            origin +
            '\n\n' +
            JSON.stringify(steps, null, 2) +
            '\nClicks and form input can change data in the local project. These steps execute without a model call.',
        ))
      )
        return { cancelled: true };
      const results = [],
        startedAt = Date.now();
      browserErrors = [];
      for (const step of steps) {
        const started = Date.now();
        try {
          if (Date.now() - startedAt > 60000) throw Error('Browser check time budget reached.');
          if (step.action === 'wait') await new Promise((resolve) => setTimeout(resolve, step.ms));
          else {
            let timer;
            try {
              await Promise.race([
                win.webContents.executeJavaScript(stepScript(step)),
                new Promise((_, reject) => {
                  timer = setTimeout(() => {
                    if (win && !win.isDestroyed()) win.destroy();
                    reject(Error('Preview became unresponsive and was closed.'));
                  }, 5000);
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          }
          results.push({ ...step, status: 'passed', durationMs: Date.now() - started });
        } catch (error) {
          results.push({
            ...step,
            status: 'failed',
            error: String(error.message).slice(0, 1000),
            durationMs: Date.now() - started,
          });
          break;
        }
      }
      lastRun = {
        status:
          results.length === steps.length && results.every((row) => row.status === 'passed') ? 'passed' : 'failed',
        startedAt,
        durationMs: Date.now() - startedAt,
        results,
        browserErrors: [...browserErrors],
        skipped: steps.length - results.length,
      };
      return lastRun;
    }
    if (request.action === 'viewport') {
      if (![390, 768, 1280].includes(request.width)) throw Error('Choose a supported viewport.');
      win.setContentSize(request.width, 720);
      const [actualWidth, actualHeight] = win.getContentSize();
      if (actualWidth !== request.width || actualHeight !== 720)
        win.setContentSize(2 * request.width - actualWidth, 2 * 720 - actualHeight);
      return { width: win.getContentSize()[0], height: win.getContentSize()[1] };
    }
    if (['visual-baseline', 'visual-compare'].includes(request.action)) {
      const image = await capturePreview(),
        png = image.toPNG(),
        url = win.webContents.getURL();
      if (image.isEmpty() || png.length > 8 * 1048576) throw Error('Screenshot is empty or exceeds 8 MiB.');
      if (request.action === 'visual-baseline') {
        baseline = { image, url, at: Date.now() };
        return { saved: true, at: baseline.at, image: image.toDataURL(), size: image.getSize() };
      }
      if (!baseline || baseline.url !== url) throw Error('Capture a baseline for this page first.');
      return {
        ...require('./preview-evidence').comparePixels(baseline.image, image),
        before: baseline.image.toDataURL(),
        after: image.toDataURL(),
        baselineAt: baseline.at,
      };
    }
    if (request.action === 'profile') {
      const sample = await win.webContents.executeJavaScript(
        `(() => {const nav=performance.getEntriesByType('navigation')[0];return {url:location.href,width:innerWidth,height:innerHeight,domNodes:document.getElementsByTagName('*').length,jsHeapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*100)/100:null,loadMs:nav?.loadEventEnd>0?Math.round(nav.loadEventEnd-nav.startTime):null,domReadyMs:nav?.domContentLoadedEventEnd>0?Math.round(nav.domContentLoadedEventEnd-nav.startTime):null};})()`,
      );
      const pid = win.webContents.getOSProcessId(),
        metric = electron.app?.getAppMetrics().find((row) => row.pid === pid);
      const value = {
        ...sample,
        at: Date.now(),
        rendererWorkingSetMB: metric?.memory ? Math.round((metric.memory.workingSetSize / 1024) * 100) / 100 : null,
        rendererCpuPercent: metric?.cpu?.percentCPUUsage ?? null,
      };
      const delta = require('./preview-evidence').profileDelta(profileBaseline, value);
      if (request.baseline === true) profileBaseline = value;
      return {
        ...value,
        delta,
        baselineAt: profileBaseline?.at || null,
        note: 'Navigation timings describe the last page load; CPU is an Electron process sample. Memory may include shared resources. Compare the same URL and viewport under similar conditions; repeat measurements before drawing conclusions.',
      };
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
      const image = await capturePreview(),
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
