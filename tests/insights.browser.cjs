const electron = require('electron'),
  { app } = electron,
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createReport, periods } = require('../statistics-report'),
  { createReportStore } = require('../admin-panel/store.cjs'),
  { createAdminWindow } = require('../admin-panel/window.cjs');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
let win, temp;
const timeout = setTimeout(() => {
  console.error('Insights UI timed out');
  app.exit(1);
}, 60000).unref();
app.whenReady().then(async () => {
  try {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-insights-ui-'));
    const files = [];
    for (let index = 0; index < 8; index++) {
      const jobs = Array.from({ length: 20 + index * 2 }, (_, n) => ({
        status: n % 7 === 0 ? 'failed' : n % 11 === 0 ? 'cancelled' : 'completed',
        endedAt: Date.now(),
        collaboration: n % 2 === 0,
        workspaceId: n % 3 === 0 ? 'not-exported' : null,
        verification: { status: 'passed' },
        environment: { status: n % 3 === 0 ? 'passed' : 'not-run' },
      }));
      const report = createReport({ jobs, version: index % 2 ? '0.8.3' : '0.9.1', period: periods()[0] });
      const file = path.join(temp, index + '.json');
      await fs.writeFile(file, JSON.stringify(report));
      files.push(file);
    }
    let confirm = 1;
    const store = createReportStore(path.join(temp, 'data'));
    win = createAdminWindow({
      electron: {
        ...electron,
        dialog: {
          showOpenDialog: async () => ({ filePaths: files }),
          showMessageBox: async () => ({ response: confirm }),
          showSaveDialog: async () => ({ filePath: path.join(temp, 'summary.json') }),
        },
      },
      directory: temp,
      store,
      show: false,
    });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const run = (code) => win.webContents.executeJavaScript(code),
      wait = async (code) => {
        for (let i = 0; i < 200; i++) {
          if (await run(code)) return;
          await new Promise((r) => setTimeout(r, 15));
        }
        throw Error('Did not reach: ' + code);
      };
    await wait(`document.getElementById('reports').textContent==='0'`);
    assert.equal(await run('typeof require'), 'undefined');
    assert.equal(await run('typeof atlas'), 'undefined');
    assert.equal(await run(`fetch('https://example.invalid').then(()=>false,()=>true)`), true);
    await run(`document.getElementById('import').click()`);
    await wait(`document.getElementById('reports').textContent==='8'`);
    assert.equal(await run(`document.querySelectorAll('#receipts tr').length`), 8);
    await run(`document.getElementById('import').click()`);
    await wait(`document.getElementById('status').textContent.includes('8 duplicates')`);
    assert.equal(await run(`document.getElementById('reports').textContent`), '8');
    await run(`document.getElementById('export').click()`);
    await wait(`document.getElementById('status').textContent.includes('Aggregate summary saved')`);
    const summary = JSON.parse(await fs.readFile(path.join(temp, 'summary.json'), 'utf8'));
    assert.equal(summary.reports, 8);
    assert(!JSON.stringify(summary).includes('reportId'));
    const out = path.join(__dirname, '..', '.handover', 'insights-design');
    await fs.mkdir(out, { recursive: true });
    for (const width of [1280, 768, 640]) {
      win.setContentSize(width, 900);
      await new Promise((r) => setTimeout(r, 100));
      assert(await run('document.documentElement.scrollWidth<=innerWidth+1'));
      await fs.writeFile(path.join(out, 'admin-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    await fs.writeFile(
      path.join(out, 'inspect.html'),
      (await run('document.documentElement.outerHTML'))
        .replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, '')
        .replace(
          /<link[^>]*href="style.css"[^>]*>/,
          '<style>' + (await fs.readFile(path.join(__dirname, '../admin-panel/style.css'), 'utf8')) + '</style>',
        )
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(
          'src="../assets/beacon.png"',
          'src="data:image/png;base64,' +
            (await fs.readFile(path.join(__dirname, '../assets/beacon.png'))).toString('base64') +
            '"',
        ),
    );
    confirm = 0;
    await run(`document.getElementById('clear').click()`);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal((await store.action({ action: 'list' })).length, 8);
    confirm = 1;
    await run(`document.getElementById('clear').click()`);
    await wait(`document.getElementById('reports').textContent==='0'`);
    assert.equal((await store.action({ action: 'list' })).length, 0);
    win.destroy();
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    clearTimeout(timeout);
    console.log(
      'PASS: offline Insights real IPC/imports, duplicate rejection, aggregate export, confirmed deletion, sandbox and no-network policy at three widths.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    win?.destroy();
    app.exit(1);
  }
});
