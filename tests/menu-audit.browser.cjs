// Drives the real main process against a throwaway profile with sample records. Provider CLIs cannot
// start and web requests are blocked, so no real account or data is touched. Approvals are refused
// unless AUDIT_APPROVE=1. Set AUDIT_CLICKS=0 to skip clicking buttons, AUDIT_OUT to keep screenshots.
const electron = require('electron');
const { app, dialog, shell, session, BrowserWindow } = electron;
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  util = require('node:util'),
  cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const approving = process.env.AUDIT_APPROVE === '1';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-menu-audit-'));
const out = process.env.AUDIT_OUT || path.join(temp, 'report');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
const home = path.join(temp, 'home'),
  project = path.join(temp, 'work', 'demo');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(path.join(project, 'src'), { recursive: true });
fs.writeFileSync(path.join(project, 'package.json'), '{"name":"demo","scripts":{"test":"node -v"}}');
fs.writeFileSync(path.join(project, 'src', 'a.js'), 'export const a = 1;\n');
cp.spawnSync('git', ['init', '-q'], { cwd: project });
const git = path.dirname(cp.execSync('where git').toString().split(/\r?\n/)[0]);
Object.assign(process.env, {
  USERPROFILE: home,
  HOME: home,
  APPDATA: path.join(home, 'Roaming'),
  LOCALAPPDATA: path.join(home, 'Local'),
  PATH: git + ';' + path.dirname(process.execPath) + ';' + process.env.SystemRoot + '\\System32',
});
app.setPath('home', home);
app.setPath('appData', path.join(home, 'Roaming'));
app.setPath('userData', path.join(home, 'Local', 'ATLAS'));
const external = [];
const blocked = (command, args) => /codex|claude/i.test(String(command) + ' ' + JSON.stringify(args || []));
for (const name of ['spawn', 'execFile']) {
  const real = cp[name];
  cp[name] = function (command, args, ...rest) {
    if (blocked(command, args)) {
      external.push('blocked ' + name + ': ' + command);
      return real.call(this, 'atlas-audit-missing-cli', [], ...rest);
    }
    return real.call(this, command, args, ...rest);
  };
  const custom = real[util.promisify.custom];
  if (custom)
    cp[name][util.promisify.custom] = function (command, args, ...rest) {
      if (blocked(command, args)) {
        external.push('blocked ' + name + ': ' + command);
        return custom.call(this, 'atlas-audit-missing-cli', [], ...rest);
      }
      return custom.call(this, command, args, ...rest);
    };
}
dialog.showMessageBox = async (...args) => {
  const options = args.find((row) => row && row.message);
  external.push('dialog: ' + (options?.message || ''));
  const cancel = options?.cancelId ?? 0;
  const accept = (options?.buttons || []).findIndex((_, index) => index !== cancel);
  return { response: approving && accept >= 0 ? accept : cancel, checkboxChecked: false };
};
dialog.showMessageBoxSync = () => 0;
dialog.showErrorBox = (title, detail) => external.push('errorBox: ' + title + ' ' + detail);
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showSaveDialog = async () => ({ canceled: true });
for (const name of ['openExternal', 'openPath', 'showItemInFolder', 'trashItem'])
  shell[name] = async (value) => {
    external.push('shell.' + name + ': ' + value);
    return '';
  };
app.relaunch = () => external.push('relaunch');
app.setLoginItemSettings = () => {};
const realExit = app.exit.bind(app);
app.quit = () => external.push('quit');
const report = { approving, main: [], console: [], sections: [], clicks: [], external };
process.on('uncaughtException', (error) => report.main.push('uncaught: ' + error.stack));
process.on('unhandledRejection', (error) => report.main.push('rejection: ' + (error?.stack || error)));
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
function finish() {
  const problems = [...report.main, ...report.console];
  for (const row of report.sections) {
    const name = row.surface + '/' + row.name;
    for (const value of [...(row.probe?.issues || []), ...(row.probe?.bad || []), ...(row.errs || [])])
      problems.push(name + ': ' + value);
    if (row.probe?.__timeout) problems.push(name + ': timed out');
  }
  for (const row of report.clicks) {
    const name = row.surface + '/' + row.name + ' > ' + row.label;
    for (const value of [...(row.bad || []), ...(row.errs || [])]) problems.push(name + ': ' + value);
    if (row.timeout) problems.push(name + ': timed out');
  }
  report.problems = problems;
  report.done = true;
  save();
  console.log(
    `Menu audit: ${report.sections.length} surfaces, ${report.clicks.length} clicks, ${problems.length} problems, approvals ${approving ? 'accepted' : 'refused'}. Report: ${out}`,
  );
  for (const problem of problems) console.error('FAIL ' + problem);
  realExit(problems.length ? 1 : 0);
}
setTimeout(() => {
  console.error('Menu audit timed out');
  report.timedOut = true;
  save();
  realExit(3);
}, 40 * 60000).unref();
require(path.join(root, 'main.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Approved runs also leave out buttons that reach beyond the throwaway project.
const SKIP = approving
  ? /^(close|quit|restart|relaunch|install)|sign in|update|download|setup|provider/i
  : /^(close|quit|restart|relaunch|install)/i;

const PROBE = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  const box = host.getBoundingClientRect(), issues = [];
  for (const el of host.querySelectorAll('button,input,select,textarea,label,h1,h2,h3,p,pre,table,img')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const name = el.tagName + ':' + (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 40);
    if (r.right > box.right + 1 || r.left < box.left - 1) issues.push('outside dialog ' + name);
    if (['BUTTON'].includes(el.tagName) && el.scrollWidth > el.clientWidth + 1) issues.push('clipped ' + name);
    if (['INPUT','TEXTAREA','SELECT'].includes(el.tagName) && !['checkbox','radio','hidden','file'].includes(el.type)) {
      if (r.width < 60) issues.push('tiny control ' + name + ' ' + Math.round(r.width));
      if (!el.closest('label') && !el.getAttribute('aria-label') && !(el.id && document.querySelector('label[for="' + el.id + '"]'))) issues.push('unlabelled ' + el.tagName + ':' + (el.id || el.placeholder || ''));
    }
    if (el.tagName === 'BUTTON' && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.title) issues.push('unnamed button');
  }
  for (const el of host.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (visible(el) && ['auto','scroll'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && !['PRE','TEXTAREA','CODE'].includes(el.tagName)) issues.push('sideways scroll ' + el.tagName + '.' + el.className);
  }
  const text = host.innerText || '';
  const bad = (text.match(/Error invoking remote[^\\n]*|is not a function[^\\n]*|Cannot read[^\\n]*|\\[object [A-Z][a-z]+\\]|\\bundefined\\b[^\\n]*|\\bNaN\\b[^\\n]*|Invalid Date/g) || []).slice(0, 6);
  return { issues: [...new Set(issues)], bad, chars: text.length };
})()`;

const BUTTONS = `(() => {
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  const scope = host.querySelector('#shellHubContent') || host.querySelector('.settings-body') || host;
  const seen = new Set(), out = [];
  for (const b of scope.querySelectorAll('button')) {
    const r = b.getBoundingClientRect(), t = b.textContent.trim();
    if (!r.width || !r.height || b.disabled || !t || seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out;
})()`;

// Long lists and long text are what empty profiles never exercise.
const SEED = `(async () => {
  const long = 'A deliberately long sample entry that should wrap instead of pushing the layout sideways '.repeat(3);
  const unbroken = 'unbroken_' + 'x'.repeat(180);
  for (let n = 0; n < 40; n++) {
    await atlas.memory({ action: 'save', item: { text: 'Memory ' + n + ' ' + (n % 2 ? long : unbroken), category: 'preference' } });
    await atlas.reminders({ action: 'save', item: { title: 'Reminder ' + n + ' ' + (n % 2 ? long : unbroken), dueAt: Date.now() + 86400000 * (n + 1), repeatMinutes: 0 } });
  }
  return true;
})()`;

async function main() {
  await app.whenReady();
  // A real page for Live preview's Open/capture buttons to work against.
  require('node:http')
    .createServer((_req, res) => res.end('<!doctype html><title>Fixture</title><h1 id="a">Fixture page</h1>'))
    .listen(5173, '127.0.0.1');
  session.defaultSession.webRequest.onBeforeRequest((details, done) => {
    const ok =
      /^(atlas|data|blob|devtools|file):/.test(details.url) || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(details.url);
    if (!ok) external.push('network blocked: ' + details.url);
    done({ cancel: !ok });
  });
  let win;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(100);
  if (!win) throw Error('No window');
  win.setPosition(-4000, 0);
  win.setContentSize(1280, 800);
  let where = 'startup';
  win.webContents.on('console-message', (d) => {
    if (['error', 'warning'].includes(d.level)) report.console.push(d.level + ': ' + d.message + ' @' + where);
  });
  win.webContents.on('render-process-gone', (_e, d) => report.main.push('renderer gone ' + d.reason));
  const run = (code) =>
    Promise.race([win.webContents.executeJavaScript(code), sleep(12000).then(() => ({ __timeout: true }))]);
  const shot = async (name) => {
    // Force a fresh frame: captures otherwise lag one section behind on an off-screen window.
    win.webContents.invalidate();
    await sleep(350);
    win.webContents.invalidate();
    await sleep(100);
    // Capture can fail on a window off-screen, which says nothing about the page being audited.
    try {
      await win.webContents.capturePage();
      await sleep(350);
      fs.writeFileSync(
        path.join(out, 'shots', name.replace(/[^\w.-]+/g, '_') + '.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
    } catch (error) {
      (report.missedShots ||= []).push(name + ': ' + error.message);
    }
  };
  await sleep(1500);
  await run(`window.confirm=(m)=>{(window.__dialogs||=[]).push('confirm:'+m);return ${approving}};window.alert=(m)=>{(window.__dialogs||=[]).push('alert:'+m)};window.prompt=(m)=>{(window.__dialogs||=[]).push('prompt:'+m);return null};
    window.__errs=[];addEventListener('error',e=>__errs.push('error: '+e.message+' '+e.filename+':'+e.lineno));addEventListener('unhandledrejection',e=>__errs.push('rejection: '+(e.reason&&e.reason.message||e.reason)));
    window.__toasts=[];new MutationObserver(()=>{const t=document.getElementById('toast').textContent;if(t)__toasts.push(t)}).observe(document.getElementById('toast'),{childList:true,characterData:true,subtree:true});true`);
  await run(SEED);
  const flush = () =>
    run(
      `(()=>{const v={errs:__errs.splice(0),toasts:__toasts.splice(0),dialogs:(window.__dialogs||[]).splice(0)};return v})()`,
    );
  const setProject = () =>
    run(
      `(()=>{cwd=${JSON.stringify(project)};const chat=window.atlasColab?.current?.();if(chat)chat.cwd=${JSON.stringify(project)};return true})()`,
    );
  const closeAll = () =>
    run(
      `[...document.querySelectorAll('dialog[open]')].reverse().forEach(d=>d.close());document.querySelectorAll('[popover]').forEach(p=>{try{p.hidePopover()}catch{}});true`,
    );
  const status = () =>
    run(
      `(()=>{const h=[...document.querySelectorAll('dialog[open]')].at(-1);if(!h)return '';const f=[...h.querySelectorAll('[role=status],.power-status,footer,.workbench-state')].map(e=>e.textContent.trim()).filter(Boolean);return f.join(' | ').slice(0,300)})()`,
    );

  const record = async (surface, name, open) => {
    where = surface + '/' + name;
    await setProject();
    await open();
    await sleep(450);
    const probe = await run(PROBE);
    await shot(surface + '-' + name + '-1280');
    const flushed = await flush();
    report.sections.push({ surface, name, probe, ...flushed, status: await status() });
    save();
    if (process.env.AUDIT_CLICKS === '0') return;
    const labels = (await run(BUTTONS)) || [];
    for (const label of labels.slice(0, 30)) {
      if (SKIP.test(label) || !Array.isArray(labels)) continue;
      where = surface + '/' + name + '/' + label;
      await closeAll();
      await setProject();
      await open();
      await sleep(250);
      await flush();
      if ((await run('cwd')) !== project || app.getPath('userData').indexOf(temp) !== 0)
        throw Error('Audit left the throwaway project at ' + where);
      const clicked = await run(
        `(()=>{const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;const scope=host.querySelector('#shellHubContent')||host.querySelector('.settings-body')||host;const b=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&b.getBoundingClientRect().width>0);if(!b)return false;b.click();return true})()`,
      );
      if (clicked !== true) continue;
      await sleep(600);
      const after = await run(PROBE);
      const f = await flush();
      report.clicks.push({
        surface,
        name,
        label,
        ...f,
        bad: after?.bad,
        status: await status(),
        timeout: after?.__timeout,
      });
      save();
    }
    await closeAll();
    await flush();
  };

  // Tasks, Library, Diagnostics.
  await run(`atlasUi.open('tasks')`);
  await sleep(200);
  const groups = await run(`[...document.querySelectorAll('.shell-hub-groups button')].map(b=>b.textContent)`);
  const names = [];
  for (const group of groups) {
    await run(
      `[...document.querySelectorAll('.shell-hub-groups button')].find(b=>b.textContent===${JSON.stringify(group)}).click()`,
    );
    await sleep(200);
    const row = await run(
      `(()=>{const list=atlasUi.hub.querySelector('[role=tablist]');return list.hidden?[${JSON.stringify(group)}]:[...list.children].map(b=>b.textContent)})()`,
    );
    names.push(...row.map((name) => ['tasks', name]));
  }
  for (const route of ['library', 'diagnostics']) {
    await closeAll();
    await run(`atlasUi.open('${route}')`);
    await sleep(200);
    const row = await run(`[...atlasUi.hub.querySelectorAll('[role=tablist] button')].map(b=>b.textContent)`);
    names.push(...row.map((name) => [route, name]));
  }
  await closeAll();
  for (const [route, name] of names)
    await record(route, name, () =>
      run(`atlasUi.open(${JSON.stringify(route)},${JSON.stringify(name)}).then(()=>true)`),
    );

  // Settings.
  await run(`document.getElementById('settingsOpen').click();true`);
  await sleep(500);
  const settings = await run(`[...document.querySelectorAll('.settings-nav-item')].map(b=>b.dataset.section)`);
  await closeAll();
  for (const name of settings || [])
    await record('settings', name, async () => {
      await run(
        `(()=>{if(!document.getElementById('settingsDialog').open)document.getElementById('settingsOpen').click();return true})()`,
      );
      await sleep(150);
      await run(`atlasSettings.show(${JSON.stringify(name)});true`);
    });

  // Narrow layout pass.
  await closeAll();
  win.setContentSize(390, 800);
  await sleep(300);
  for (const [route, name] of names) {
    where = 'narrow/' + name;
    await setProject();
    await run(`atlasUi.open(${JSON.stringify(route)},${JSON.stringify(name)}).then(()=>true)`);
    await sleep(300);
    report.sections.push({ surface: 'narrow', name, probe: await run(PROBE), ...(await flush()) });
    await shot('narrow-' + route + '-' + name);
    await closeAll();
  }
  finish();
}
main().catch((error) => {
  report.fatal = error.stack;
  console.error(error);
  save();
  realExit(2);
});
