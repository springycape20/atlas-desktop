const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { assertRoot, formatVault } = require('./vault-notes');
function createVaultSource(directory, { search, denied = async () => [] } = {}) {
  const file = path.join(directory, 'markdown-vault.json');
  const store = require('./atomic-store').createAtomicStore(file);
  let config,
    loading,
    revision = 0,
    mutations = Promise.resolve();
  const previews = new Map(); // Only hashes and review identities, never note contents.
  async function settings() {
    if (!loading)
      loading = (async () => {
        try {
          config = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          config = {};
        }
        if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
      })();
    await loading;
    return { folder: typeof config.folder === 'string' ? config.folder : '', enabled: config.enabled === true };
  }
  function configure(action, folder) {
    const operation = mutations.then(() => change(action, folder));
    mutations = operation.catch(() => {});
    return operation;
  }
  async function change(action, folder) {
    await settings();
    let next;
    if (action === 'choose') {
      const root = await assertRoot(folder),
        stat = await fs.stat(root);
      next = { folder: root, enabled: false, identity: { dev: stat.dev, ino: stat.ino } };
    } else if (action === 'remove') next = {};
    else if (action === 'enable' || action === 'disable') {
      if (action === 'enable' && !config.folder) throw Error('Choose a Markdown folder first.');
      next = { ...config, enabled: action === 'enable' };
    } else throw Error('Unknown vault action.');
    // Invalidate immediately, including in-flight scans, before persisting the new state.
    revision++;
    previews.clear();
    config = next;
    await store.save(next);
    return settings();
  }
  async function context(query, selection, { preview = false, scope = '' } = {}) {
    if (!selection.vault) return { text: '', indexed: null };
    const state = await settings();
    if (!selection.vault || !state.enabled || !state.folder) return { text: '', indexed: null };
    const version = revision;
    const excluded = selection.vaultFiles || [];
    const key = JSON.stringify([state.folder, String(query).trim(), excluded, scope]);
    const receipt = previews.get(selection.vaultPreview);
    if (!preview && (!receipt || receipt.key !== key)) throw Error('Refresh the vault Context preview before sending.');
    const scan = await search(state.folder, String(query).trim(), {
      excluded,
      identity: config.identity,
      denied: await denied(),
    });
    if (version !== revision) throw Error('Vault settings changed. Refresh Context preview.');
    const text = formatVault(scan);
    const digest = createHash('sha256').update(text).digest('hex');
    if (!preview && receipt.digest !== digest)
      throw Error('Vault notes changed. Refresh Context preview before sending.');
    let token = selection.vaultPreview;
    if (preview) {
      token = randomUUID();
      previews.set(token, { key, digest });
      if (previews.size > 32) previews.delete(previews.keys().next().value);
    }
    return { text, indexed: scan, token, version };
  }
  function assertCurrent(version) {
    if (version !== undefined && (version !== revision || !config?.enabled))
      throw Error('Vault source changed. Refresh Context preview and start a new request.');
  }
  return { settings, configure, context, assertCurrent };
}
module.exports = { createVaultSource };
