// Starts the real main process once per scenario on a throwaway profile, with damaged or oversized records.
// Provider CLIs are blocked, and the prompt used is one ATLAS answers itself.
const cp = require('node:child_process');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const assert = require('node:assert/strict');
const scenario = process.env.ATLAS_DATA_SCENARIO;
const { app, dialog, shell, BrowserWindow, globalShortcut } = require('electron');
if (!scenario) parent();
else child();

function parent() {
  app.whenReady().then(() => {
    let failed = false;
    for (const name of [
      'damaged-chats',
      'many-chats',
      'long-chat',
      'damaged-assistant',
      'bad-restore',
      'failed-start',
      'auto-backup',
      'recovery-cleanup',
      'chat-branch',
      'memory-review',
      'report-problem',
      'tray',
      'scheduled-task',
    ]) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-data-safety-'));
      const result = cp.spawnSync(process.execPath, [__filename], {
        env: { ...process.env, ATLAS_DATA_SCENARIO: name, ATLAS_DATA_TEMP: temp },
        encoding: 'utf8',
        timeout: 90000,
      });
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      if (result.stdout.includes('PASS: ' + name)) console.log('PASS: ' + name);
      else {
        failed = true;
        console.error('FAIL: ' + name + '\n' + result.stdout + result.stderr + (result.error || ''));
      }
    }
    app.exit(failed ? 1 : 0);
  });
}

function child() {
  const temp = process.env.ATLAS_DATA_TEMP,
    home = path.join(temp, 'home'),
    data = path.join(home, 'Local', 'ATLAS'),
    project = path.join(temp, 'demo'),
    conversations = path.join(data, 'conversations.json');
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(project);
  Object.assign(process.env, {
    USERPROFILE: home,
    HOME: home,
    APPDATA: path.join(home, 'Roaming'),
    LOCALAPPDATA: path.join(home, 'Local'),
    PATH: path.dirname(process.execPath) + ';' + process.env.SystemRoot + '\\System32',
  });
  app.setPath('home', home);
  app.setPath('appData', path.join(home, 'Roaming'));
  app.setPath('userData', data);
  const real = cp.spawn;
  cp.spawn = function (command, args, ...rest) {
    const provider = /codex|claude/i.test(String(command) + ' ' + JSON.stringify(args || []));
    return real.call(this, provider ? 'atlas-test-missing-cli' : command, args, ...rest);
  };
  const warnings = [];
  dialog.showMessageBox = async (...args) => {
    const options = args.at(-1);
    warnings.push(options.message + ' ' + (options.detail || ''));
    return { response: ['recovery-cleanup', 'scheduled-task'].includes(scenario) ? 1 : 0 };
  };
  dialog.showErrorBox = (title, detail) => {
    if (scenario === 'failed-start') {
      assert.match(title, /could not start/);
      assert.match(detail, /EISDIR/);
      console.log('PASS: ' + scenario);
    } else console.error(title, detail);
  };
  for (const method of ['openExternal', 'openPath', 'showItemInFolder', 'trashItem']) shell[method] = async () => '';
  app.setLoginItemSettings = () => {};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const turn = (role, content, at) => ({ role, content, provider: '', attachments: [], at });
  const chat = (id, updatedAt, turns = [turn('user', 'hello', updatedAt)]) => ({
    id,
    title: id,
    provider: 'atlas',
    sessions: { codex: '', claude: '' },
    cwd: project,
    updatedAt,
    turns,
  });
  const id = (n) => 'chat-' + String(n).padStart(20, '0');
  const saved = () => JSON.parse(fs.readFileSync(conversations, 'utf8'));
  ({
    'damaged-chats': () => fs.writeFileSync(conversations, '[{"id":"precious","turns":[{"role"'),
    'many-chats': () =>
      fs.writeFileSync(conversations, JSON.stringify(Array.from({ length: 100 }, (_, n) => chat(id(n), n + 1)))),
    'long-chat': () => {
      const turns = Array.from({ length: 90 }, (_, n) => turn(n % 2 ? 'assistant' : 'user', 'turn ' + n, n + 1));
      turns[89].content = 'L'.repeat(20000);
      fs.writeFileSync(conversations, JSON.stringify([chat(id(1), 1, turns)]));
    },
    'damaged-assistant': () => fs.writeFileSync(path.join(data, 'assistant-data.json'), '{"memories":[{"id"'),
    'bad-restore': () =>
      fs.writeFileSync(path.join(data, '.restore-pending.json'), JSON.stringify({ id: 'gone', expected: [] })),
    'failed-start': () => fs.mkdirSync(path.join(data, 'assistant-data.json')),
    'chat-branch': () =>
      fs.writeFileSync(
        conversations,
        JSON.stringify([
          {
            ...chat(id(1), 1, [turn('user', 'first', 1), turn('assistant', 'answer', 2), turn('user', 'later', 3)]),
            sessions: { codex: 'old-session', claude: '' },
          },
        ]),
      ),
    'scheduled-task': () => {
      // The first check waits a minute after start-up. "what's the time" is answered by ATLAS itself.
      // Patched a moment later so the 60-second limit on this scenario keeps its length.
      const wait = global.setTimeout;
      setImmediate(() => {
        global.setTimeout = (run, ms, ...rest) => wait(run, ms === 60000 ? 200 : ms, ...rest);
      });
      fs.writeFileSync(
        path.join(data, 'scheduled-tasks.json'),
        JSON.stringify([
          {
            id: 'seeded',
            conversationId: id(7),
            title: "what's the time",
            prompt: "what's the time",
            cwd: project,
            every: 86400000,
            nextAt: Date.now() - 1000,
            allowEdits: false,
            enabled: true,
            failures: 0,
          },
        ]),
      );
    },
    tray: () => {},
    'report-problem': () => {},
    'memory-review': () =>
      fs.writeFileSync(
        path.join(data, 'assistant-data.json'),
        JSON.stringify({
          memories: [
            { id: 'gone', text: 'Old project note', category: 'project', projectFolder: path.join(temp, 'gone') },
            { id: 'pref', text: 'Prefer short answers', category: 'preference', projectFolder: '' },
            { id: 'copy', text: 'prefer short  answers', category: 'preference', projectFolder: '' },
          ],
        }),
      ),
    'recovery-cleanup': () => {
      for (const name of ['old', 'current'])
        fs.mkdirSync(path.join(data, 'update-recovery', name), { recursive: true });
      fs.writeFileSync(path.join(data, 'update-recovery', 'old', 'ATLAS.exe'), 'x');
      fs.writeFileSync(
        path.join(data, 'update-recovery.json'),
        JSON.stringify({ folder: path.join(data, 'update-recovery', 'current') }),
      );
    },
    'auto-backup': () => {
      fs.writeFileSync(conversations, JSON.stringify([chat(id(1), 1)]));
      // The first automatic backup waits two minutes after start-up.
      const wait = global.setTimeout;
      global.setTimeout = (run, ms, ...rest) => wait(run, ms === 120000 ? 200 : ms, ...rest);
    },
  })[scenario]();
  setTimeout(() => {
    console.error('Timed out');
    app.exit(1);
  }, 60000);
  require('../main.js');
  (async () => {
    await app.whenReady();
    if (scenario === 'failed-start') return;
    let win;
    for (let i = 0; i < 150 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(100);
    assert.ok(win, 'ATLAS opened no window');
    win.setPosition(-4000, 0);
    if (win.webContents.isLoading()) await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const ask = async (conversationId) => {
      const provider = await win.webContents.executeJavaScript(
        `window.atlas.chat({prompt:"what's the time",cwd:${JSON.stringify(project)},conversationId:${JSON.stringify(conversationId)}}).then(r=>r.provider,e=>'ERR '+e.message)`,
      );
      assert.equal(provider, 'local');
    };
    if (scenario === 'damaged-chats') {
      await ask(id(500));
      assert.deepEqual(
        saved().map((row) => row.id),
        [id(500)],
      );
      const kept = fs.readdirSync(data).find((name) => name.startsWith('conversations.json.damaged-'));
      assert.equal(fs.readFileSync(path.join(data, kept), 'utf8'), '[{"id":"precious","turns":[{"role"');
      assert.match(warnings.join(), /saved chats/);
    }
    if (scenario === 'many-chats') {
      await ask(id(500));
      const rows = saved();
      assert.equal(rows.length, 101);
      assert.equal(rows[0].id, id(0));
    }
    if (scenario === 'long-chat') {
      await ask(id(1));
      const [row] = saved();
      assert.equal(row.turns.length, 92);
      assert.equal(row.turns[89].content.length, 20000);
    }
    if (scenario === 'damaged-assistant') {
      assert.ok(fs.readdirSync(data).some((name) => name.startsWith('assistant-data.json.damaged-')));
      assert.match(warnings.join(), /memories, reminders/);
    }
    if (scenario === 'bad-restore') {
      assert.equal(fs.existsSync(path.join(data, '.restore-pending.json')), false);
      assert.match(warnings.join(), /could not restore/);
    }
    if (scenario === 'chat-branch') {
      const made = await win.webContents.executeJavaScript(
        `window.atlas.historyBranch({id:${JSON.stringify(id(1))},count:2})`,
      );
      const [source, branch] = [saved().find((row) => row.id === id(1)), saved().find((row) => row.id === made)];
      assert.equal(source.turns.length, 3);
      assert.equal(source.sessions.codex, 'old-session');
      assert.equal(branch.title, 'Branch: ' + source.title);
      assert.equal(branch.turns.length, 2);
      assert.equal(branch.sessions.codex, '');
      await ask(made);
      assert.equal(saved().find((row) => row.id === made).turns.length, 4);
      assert.equal(saved().find((row) => row.id === id(1)).turns.length, 3);
      const refused = await win.webContents.executeJavaScript(
        `window.atlas.historyBranch({id:${JSON.stringify(id(1))},count:9}).then(()=>'made',e=>e.message)`,
      );
      assert.match(refused, /not available/);
      assert.equal(saved().length, 2);
    }
    if (scenario === 'scheduled-task') {
      const stored = () => JSON.parse(fs.readFileSync(path.join(data, 'scheduled-tasks.json')));
      for (let i = 0; i < 150 && stored()[0].lastStatus !== 'completed'; i++) await sleep(100);
      assert.equal(stored()[0].lastStatus, 'completed', JSON.stringify(stored()[0]));
      assert.ok(stored()[0].nextAt > Date.now(), 'a daily task should move to the next day');
      const chat = saved().find((row) => row.id === id(7));
      assert.equal(chat.turns[0].content, "what's the time");
      assert.equal(chat.turns.length, 2);
      const shown = await win.webContents.executeJavaScript(`(async()=>{
        const wait=()=>new Promise(resolve=>setTimeout(resolve,250)),
          click=(root,text)=>[...root.querySelectorAll('button')].find(node=>node.textContent===text).click(),
          body=()=>document.querySelector('.power-body'),
          field=text=>[...body().querySelectorAll('label')].find(node=>node.textContent.startsWith(text)).querySelector('input,textarea');
        await atlasUi.open('tasks','Scheduled tasks');await wait();
        const first=body().querySelector('details summary').textContent;
        field('What should it do?').value='Summarise the log';
        field('Working folder').value=${JSON.stringify(project)};
        field('First run').value='2099-01-01T09:00';
        click(body(),'Schedule task…');await wait();
        const rows=()=>[...body().querySelectorAll('details')];
        const added=rows().at(-1).querySelector('summary').textContent;
        click(rows().at(-1),'Turn off');await wait();
        const off=rows().at(-1).querySelector('summary').textContent;
        click(rows().at(-1),'Delete');await wait();
        return {first,added,off,count:rows().length};
      })()`);
      assert.match(shown.first, /^On · Every day · next .* read only/);
      assert.match(shown.added, /^On · Every day · next .* read only · Summarise the log/);
      assert.match(shown.off, /^Off/);
      assert.equal(shown.count, 1);
      assert.match(warnings.join(), /Run this task without you\?[^]*uses your model accounts/);
    }
    if (scenario === 'tray') {
      const save = (value) =>
        win.webContents.executeJavaScript(
          `window.atlas.getSettings().then(s=>window.atlas.saveSettings({...s,...${JSON.stringify(value)}}))`,
        );
      const saved = await save({ trayEnabled: true, globalHotkey: 'Ctrl+Alt+Space' });
      assert.equal(saved.trayEnabled, true);
      assert.ok(globalShortcut.isRegistered('Ctrl+Alt+Space') || saved.hotkeyError);
      assert.equal((await save({ globalHotkey: 'Alt+F4' })).globalHotkey, '');
      assert.equal(globalShortcut.isRegistered('Ctrl+Alt+Space'), false);
      win.show();
      win.close();
      await sleep(300);
      assert.equal(win.isDestroyed(), false, 'closing with the tray on destroyed the window');
      assert.equal(win.isVisible(), false);
      app.emit('second-instance');
      await sleep(200);
      assert.equal(win.isVisible(), true);
      await new Promise((resolve) => {
        app.once('will-quit', resolve);
        app.quit();
      });
      assert.equal(win.isDestroyed(), true, 'quit did not close the hidden-on-close window');
    }
    if (scenario === 'report-problem') {
      const opened = [];
      shell.openExternal = async (url) => opened.push(url);
      const typed = 'It crashed in ' + home + '\\secret-project with Bearer abc123def456';
      const shown = await win.webContents.executeJavaScript(`(async()=>{
        const wait=()=>new Promise(resolve=>setTimeout(resolve,250)),
          click=text=>[...document.querySelectorAll('.power-body button')].find(node=>node.textContent===text).click(),
          status=()=>document.querySelector('.power-status').textContent;
        let copied='';
        navigator.clipboard.writeText=async text=>{copied=text;};
        await atlasUi.open('diagnostics','Report a problem');await wait();
        click('Copy report');await wait();const noDraft=status();
        const field=document.querySelector('.power-body textarea');
        click('Prepare report');await wait();const empty=status();
        field.value=${JSON.stringify(typed)};field.dispatchEvent(new Event('input'));
        click('Prepare report');await wait();
        const text=document.querySelector('.power-body pre').textContent;
        click('Copy report');await wait();
        click('Open GitHub issues');await wait();
        return {noDraft,empty,text,copied};
      })()`);
      assert.match(shown.noDraft, /Prepare the report first/);
      assert.match(shown.empty, /Describe the problem first/);
      assert.equal(shown.copied, shown.text);
      const report = JSON.parse(shown.text);
      assert.match(report.description, /It crashed in \[local path\]\\secret-project with Bearer \[REDACTED\]/);
      assert.ok(!shown.text.includes(home));
      assert.ok(!shown.text.includes('abc123def456'));
      assert.equal(report.log, undefined);
      assert.deepEqual(opened, ['https://github.com/springycape20/atlas-desktop/issues/new']);
    }
    if (scenario === 'memory-review') {
      const shown = await win.webContents.executeJavaScript(`(async()=>{
        const wait=()=>new Promise(resolve=>setTimeout(resolve,250)),
          rows=()=>[...document.querySelectorAll('.power-body details')],
          row=text=>rows().find(node=>node.querySelector('summary').textContent.includes(text)),
          click=(root,text)=>[...root.querySelectorAll('button')].find(node=>node.textContent===text).click(),
          field=text=>[...document.querySelectorAll('.power-body label')].find(node=>node.textContent.startsWith(text)).querySelector('input');
        await atlasUi.open('library','Memory review');await wait();
        const summary={all:rows().length,folder:row('Old project note').querySelector('summary').textContent,copy:row('prefer short  answers').querySelector('summary').textContent};
        const filter=document.querySelector('[aria-label="Which memories to show"]');filter.value='flagged';filter.dispatchEvent(new Event('change'));await wait();
        summary.flagged=rows().length;
        filter.value='';filter.dispatchEvent(new Event('change'));await wait();
        field('Check a message').value='hello';field('From project folder').value=${JSON.stringify(project)};
        click(document.querySelector('.power-body'),'Check message');await wait();
        summary.status=document.querySelector('.power-status').textContent;
        summary.sent=row('Prefer short answers').querySelector('summary').textContent;
        click(row('Old project note'),'Use for all projects');await wait();
        const gone=row('prefer short  answers');gone.querySelector('textarea').value='Prefer tables';click(gone,'Save changes');await wait();
        click(row('Prefer short answers'),'Delete');await wait();
        return summary;
      })()`);
      assert.equal(shown.all, 3);
      assert.match(shown.folder, /project folder is gone/);
      assert.match(shown.copy, /same as another memory/);
      assert.equal(shown.flagged, 2);
      assert.match(shown.status, /3 of 100 memories.*would send 2/);
      assert.match(shown.sent, /^Would be sent/);
      await sleep(300);
      const { memories } = JSON.parse(fs.readFileSync(path.join(data, 'assistant-data.json')));
      assert.deepEqual(memories.map((row) => row.text).sort(), ['Old project note', 'Prefer tables']);
      assert.equal(memories.find((row) => row.id === 'gone').projectFolder, '');
    }
    if (scenario === 'recovery-cleanup') {
      await win.webContents.executeJavaScript(`(async()=>{
        const wait=()=>new Promise(resolve=>setTimeout(resolve,300)),
          click=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text).click();
        await atlasUi.open('diagnostics','Backups and recovery');await wait();
        click('Review old recovery copies');await wait();
        const boxes=[...document.querySelectorAll('label')].filter(node=>node.textContent.startsWith('App copy'));
        if(boxes.length!==1)throw Error('Expected one old copy, saw '+boxes.length);
        boxes[0].querySelector('input').click();
        click('Delete selected copies…');await wait();
      })()`);
      assert.match(warnings.join(), /Permanently delete[^]*update-recovery\/old/);
      assert.equal(fs.existsSync(path.join(data, 'update-recovery', 'old')), false);
      assert.equal(fs.existsSync(path.join(data, 'update-recovery', 'current')), true);
    }
    if (scenario === 'auto-backup') {
      const folder = path.join(data, 'auto-backups');
      const made = () =>
        (fs.existsSync(folder) ? fs.readdirSync(folder) : []).filter((n) => n.endsWith('.atlas-backup'));
      for (let i = 0; i < 200 && !made().length; i++) await sleep(100);
      assert.equal(made().length, 1, 'no automatic backup was written');
      const value = require('../local-backups').validate(fs.readFileSync(path.join(folder, made()[0])));
      assert.ok(value.files.some((row) => row.path === 'conversations.json'));
      assert.ok(value.renderer.colab, 'renderer records are missing from the automatic backup');
      const shown = await win.webContents.executeJavaScript(`(async()=>{
        await atlasUi.open('diagnostics','Backups and recovery');
        await new Promise(resolve=>setTimeout(resolve,300));
        const box=[...document.querySelectorAll('label')].find(node=>node.textContent==='Back up automatically once a day').querySelector('input'),
          text=box.closest('label').nextElementSibling;
        const before={checked:box.checked,text:text.textContent};
        box.click();await new Promise(resolve=>setTimeout(resolve,300));
        return {before,after:box.checked};
      })()`);
      assert.equal(shown.before.checked, true);
      assert.match(shown.before.text, /Last automatic backup: .*Keeps the newest 7/);
      assert.equal(shown.after, false);
      assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'auto-backup.json'))).enabled, false);
    }
    console.log('PASS: ' + scenario);
  })()
    .catch((error) => console.error(error))
    .finally(() => {
      if (scenario !== 'failed-start') app.exit(0);
    });
}
