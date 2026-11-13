// Exercise the real worker and source through the packaged ASAR using isolated notes.
const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const temporary = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'atlas-packaged-vault-'));
app.disableHardwareAcceleration();
app.setPath('userData', path.join(temporary, 'profile'));
app.whenReady().then(async () => {
  let client;
  try {
    const archive = path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar');
    const vault = path.join(temporary, 'notes');
    await fs.mkdir(vault);
    const file = path.join(vault, 'decision.md');
    await fs.writeFile(file, 'quasar PACKAGED_VAULT_NOTE');
    client = new (require(path.join(archive, 'knowledge-client.js')).KnowledgeClient)();
    const source = require(path.join(archive, 'vault-source.js')).createVaultSource(path.join(temporary, 'records'), {
      search: (root, query, options) => client.search(root, query, options, 'vault'),
    });
    await source.configure('choose', vault);
    assert.equal((await source.context('quasar', { vault: true })).text, '');
    await source.configure('enable');
    const preview = await source.context('quasar', { vault: true }, { preview: true });
    const selected = { vault: true, vaultPreview: preview.token };
    assert.match(preview.text, /PACKAGED_VAULT_NOTE/);
    assert.equal((await source.context('quasar', selected)).text, preview.text);
    await fs.writeFile(file, 'quasar CHANGED_PACKAGED_NOTE');
    await assert.rejects(source.context('quasar', selected), /notes changed/);
    await source.configure('disable');
    assert.equal((await source.context('quasar', selected)).text, '');
    await source.configure('remove');
    assert.equal(await fs.readFile(file, 'utf8'), 'quasar CHANGED_PACKAGED_NOTE');
    console.log(
      'PASS: Packaged vault worker, read-only source, preview receipt, stale-note rejection and disable/remove.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    client?.close();
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    app.exit(process.exitCode || 0);
  }
});
setTimeout(() => {
  console.error('Packaged vault test timed out');
  app.exit(1);
}, 20000).unref();
