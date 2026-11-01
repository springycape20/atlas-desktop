// Starts the real main process once per scenario on a throwaway profile, with damaged or oversized records.
// Provider CLIs are blocked, and the prompt used is one ATLAS answers itself.
const cp = require('node:child_process');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const assert = require('node:assert/strict');
const scenario = process.env.ATLAS_DATA_SCENARIO;
const { app, dialog, shell, BrowserWindow } = require('electron');
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
  dialog.showMessageBox = async (options) => {
    warnings.push(options.message + ' ' + (options.detail || ''));
    return { response: 0 };
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
