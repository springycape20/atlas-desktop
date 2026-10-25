const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const validId = /^[A-Za-z0-9._:/-]{1,100}$/;
const defaults = {
  codex: [],
  claude: ['opus', 'sonnet', 'haiku'].map((id) => ({ id, name: 'Claude ' + id + ' · latest' })),
};
function normalize(rows) {
  return [
    ...new Map(
      (Array.isArray(rows) ? rows : []).flatMap((row) => {
        const id = row.id || row.value;
        if (typeof id !== 'string' || !validId.test(id) || row.hidden) return [];
        return [[id, { id, name: String(row.name || row.displayName || id).slice(0, 150) }]];
      }),
    ).values(),
  ].slice(0, 300);
}
// Initialization only: no user prompt or inference request is submitted.
async function claudeModels(executable, spawnProcess = spawn) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-models-'));
  try {
    return await new Promise((resolve, reject) => {
      const launch = require('./claude-runtime').launch(executable, [
        '--print',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
        '--settings',
        '{"disableAllHooks":true}',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--tools',
        '',
      ]);
      const child = spawnProcess(launch.executable, launch.args, {
        env: launch.env,
        cwd,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let settled = false;
      const finish = (error, rows) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdin.end();
        child.kill();
        error ? reject(error) : resolve(rows);
      };
      const timer = setTimeout(() => finish(Error('Claude model discovery timed out.')), 15000);
      child.stdin.on('error', (error) => finish(error));
      child.stderr.on('data', () => {});
      createInterface({ input: child.stdout }).on('line', (line) => {
        try {
          const row = JSON.parse(line);
          if (row.type === 'control_response' && row.response?.request_id === 'atlas-models') {
            if (row.response.subtype !== 'success') return finish(Error('Claude could not list models.'));
            const models = normalize(row.response.response?.models);
            finish(models.length ? null : Error('Claude returned no models.'), models);
          }
        } catch {}
      });
      child.once('error', (error) => finish(error));
      child.once('exit', () => finish(Error('Claude model discovery closed before returning models.')));
      child.stdin.write(
        JSON.stringify({
          type: 'control_request',
          request_id: 'atlas-models',
          request: { subtype: 'initialize', hooks: {} },
        }) + '\n',
      );
      // Windows can retain the working-directory handle briefly after child.kill().
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
function createModelCatalog({ directory, discover, now = Date.now }) {
  const file = path.join(directory, 'model-catalog.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let cache = {},
    loaded,
    inflight = {};
  const load = () =>
    (loaded ||= (async () => {
      try {
        cache = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch {}
    })());
  async function get(provider, refresh = false) {
    if (!Object.hasOwn(defaults, provider)) throw Error('Unknown model provider.');
    await load();
    if (inflight[provider]) return inflight[provider];
    if (!refresh && cache[provider]?.checkedAt && now() - cache[provider].checkedAt < 3600000) return cache[provider];
    inflight[provider] = (async () => {
      try {
        const models = normalize(await discover(provider));
        if (!models.length) throw Error('No models reported.');
        cache[provider] = { models, checkedAt: now(), stale: false };
        await fs.mkdir(directory, { recursive: true });
        await store.save(cache);
      } catch (error) {
        cache[provider] = {
          models: normalize(cache[provider]?.models || defaults[provider]),
          checkedAt: cache[provider]?.checkedAt || 0,
          stale: true,
          error: String(error.message).slice(0, 250),
        };
      }
      return structuredClone(cache[provider]);
    })().finally(() => {
      delete inflight[provider];
    });
    return inflight[provider];
  }
  return { get };
}
module.exports = { createModelCatalog, claudeModels, normalize };
