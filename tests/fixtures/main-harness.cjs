// Runs main.js in a VM with a fake Electron, so tests can drive its IPC handlers and job state.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm'),
  { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..', '..');
async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-main-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}
async function mainHarness(t, options = {}) {
  const dir = await temporary(t),
    events = new Map(),
    updates = [],
    icons = [],
    handlers = new Map();
  const paths = { appData: path.join(dir, 'Roaming'), userData: path.join(dir, 'Roaming', 'ATLAS') };
  let finished;
  const quit = new Promise((resolve) => {
    finished = resolve;
  });
  const localRequire = createRequire(path.join(root, 'main.js'));
  const electron = {
    app: {
      on: (name, fn) => events.set(name, fn),
      whenReady: () => ({ then() {} }),
      getPath: (name) => paths[name] || dir,
      setPath(name, value) {
        paths[name] = value;
      },
      setAppUserModelId() {},
      quit: () => finished(),
    },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    protocol: { registerSchemesAsPrivileged() {} },
  };
  const fakeProcess = {
    platform: 'win32',
    env: { ...process.env, LOCALAPPDATA: path.join(dir, 'Local'), CODEX_EXECUTABLE: path.join(root, 'main.js') },
  };
  const context = vm.createContext({
    console,
    Buffer,
    AbortController,
    process: fakeProcess,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    __dirname: root,
    require: (name) => (name === 'electron' ? electron : options.modules?.[name] || localRequire(name)),
    icons,
    updates,
  });
  const code = await fs.readFile(path.join(root, 'main.js'), 'utf8');
  vm.runInContext(
    code +
      `
    mainWindow = { isDestroyed: () => false, setIcon: (icon) => icons.push(icon), webContents: { send: (_event, patch) => updates.push(patch) } };
    assistantService = require('./assistant-service').createService({ directory: app.getPath('userData'), notify() {} });
    providerHealth = new (require('./provider-health').ProviderHealth)(path.join(app.getPath('userData'),'provider-health.json'));
    globalThis.harness = { activeJobs, jobSnapshots, emitJobs, writeAtlasHistory, readAtlasHistory, assistantService, persistJobs, migrateLegacyUserData, readAppSettings, setupIpc, allowColab:()=>{findClaudeExecutable=()=>process.env.CODEX_EXECUTABLE;mainWindow.webContents.isDestroyed=()=>false;}, sender: mainWindow.webContents };
  `,
    context,
  );
  return { ...context.harness, updates, icons, events, quit, dir, paths, handlers };
}
module.exports = { mainHarness };
