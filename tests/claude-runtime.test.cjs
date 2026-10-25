const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  vm = require('node:vm');
const { findClaude, launch, runtimeEnv, authStatus, command, errorDetail } = require('../claude-runtime');
const home = 'C:\\Users\\Friend Name',
  roaming = home + '\\AppData\\Roaming',
  local = home + '\\AppData\\Local';
function fixture(files, env = {}, savedPath = '') {
  const available = new Set(files.map((file) => file.toLowerCase()));
  return findClaude({
    home,
    platform: 'win32',
    env: { APPDATA: roaming, LOCALAPPDATA: local, USERPROFILE: home, ...env },
    exists: (file) => available.has(file.toLowerCase()),
    savedPath,
  });
}
test('Claude discovery supports native, WinGet and npm-only installations without a current PATH', () => {
  const native = home + '\\.local\\bin\\claude.exe',
    winget = local + '\\Microsoft\\WinGet\\Links\\claude.exe',
    npm = roaming + '\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js';
  assert.equal(fixture([native]), native);
  assert.equal(fixture([winget]), winget);
  assert.equal(fixture([npm]), npm);
  const custom = 'D:\\My Node\\node_modules\\@anthropic-ai\\claude-code\\cli.js';
  assert.equal(fixture([custom], { Path: '"D:\\My Node"' }), custom);
  assert.equal(fixture([custom], {}, 'D:\\My Node'), custom);
  assert.equal(fixture([custom], { CLAUDE_CODE_EXECUTABLE: '"D:\\My Node\\claude.cmd"' }), custom);
  assert.equal(fixture([native], { CLAUDE_CODE_EXECUTABLE: '"' + native + '"' }), native);
  assert.equal(fixture([native], { CLAUDE_CODE_EXECUTABLE: 'C:\\missing\\claude.exe' }), null);
  assert.equal(fixture(['relative\\claude.exe'], { Path: 'relative' }), null);
  assert.equal(fixture([home + '\\claude.exe'], { Path: '.' }), null);
});
test('Claude spawn uses real Node for npm scripts without a shell and preserves argument boundaries', () => {
  const exe = 'C:\\Friend Name\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
    args = ['-p', 'a "quote" & $(value)\nnext'],
    env = { Path: 'C:\\old', KEEP: 'yes' };
  const spec = launch(exe, args, env, {
    execPath: 'C:\\Program Files\\ATLAS\\ATLAS.exe',
    electron: true,
    exists: (file) => file === 'C:\\old\\node.exe',
    platform: 'win32',
    savedPath: 'D:\\Git\\cmd',
  });
  assert.equal(spec.executable, 'C:\\old\\node.exe');
  assert.deepEqual(spec.args, [exe, ...args]);
  assert.equal(spec.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(spec.env.KEEP, 'yes');
  assert.match(spec.env.Path, /D:\\Git\\cmd/);
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  const native = launch('C:\\claude.exe', args, env, { platform: 'win32', savedPath: '' });
  assert.equal(native.executable, 'C:\\claude.exe');
  assert.deepEqual(native.args, args);
  assert.equal(native.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.throws(
    () => launch(exe, args, {}, { electron: true, exists: () => false, platform: 'win32', savedPath: '' }),
    /Node.js could not be found/,
  );
});
test('Windows child PATH includes expanded fresh registry entries and only one case-insensitive PATH key', () => {
  const result = runtimeEnv(
    { PATH: 'C:\\old;.;relative', LOCALAPPDATA: local },
    { platform: 'win32', savedPath: '%LOCALAPPDATA%\\Microsoft\\WinGet\\Links;c:\\OLD\\' },
  );
  assert.equal(Object.keys(result).filter((key) => key.toLowerCase() === 'path').length, 1);
  assert.equal(result.Path, 'C:\\old;' + local + '\\Microsoft\\WinGet\\Links');
});
test('auth status distinguishes missing, signed out, connected and startup failures without account identifiers', async () => {
  assert.equal(
    (
      await authStatus(null, () => {
        throw Error('not called');
      })
    ).status,
    'missing',
  );
  assert.equal((await authStatus('cli', async () => '{"loggedIn":false}')).status, 'signed-out');
  assert.equal(
    (
      await authStatus('cli', async () => {
        throw Object.assign(Error('exit 1'), { stdout: '{"loggedIn":false}' });
      })
    ).status,
    'signed-out',
  );
  const connected = await authStatus('cli', async (_exe, args) => {
    assert.deepEqual(args, ['auth', 'status', '--json']);
    return '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro","email":"private@example.com"}';
  });
  assert.equal(connected.status, 'connected');
  assert(!JSON.stringify(connected).includes('private@example.com'));
  const failed = await authStatus('cli', async () => {
    throw Error('unknown command auth sk-ant-secret private@example.com');
  });
  assert.equal(failed.status, 'error');
  assert.match(failed.detail, /Update Claude Code/);
  assert(!failed.detail.includes('sk-ant-secret'));
  assert(!failed.detail.includes('private@example.com'));
  assert.match(errorDetail(Error('Git Bash not found')), /Git for Windows/);
});
test('npm entry points execute directly and auth warnings on stderr do not break JSON', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas claude runtime '));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'cli.js');
  await fs.writeFile(
    exe,
    'console.error("warning on stderr"); console.log(JSON.stringify({loggedIn:true,authMethod:"test"}));',
  );
  const auth = await authStatus(exe, (file, args, cwd) => command(file, args, cwd, { timeout: 5000 }), dir);
  assert.equal(auth.loggedIn, true);
});
test('diagnostics uses the same npm runtime and stdout-only auth parsing as Settings', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas claude diagnostics '));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'cli.js');
  await fs.writeFile(
    exe,
    'if(process.argv.includes("--version"))console.log("Claude test version");else if(process.argv.includes("--json")){console.error("startup warning");console.log(JSON.stringify({loggedIn:true}));}else process.exit(3);',
  );
  const handlers = new Map();
  require('../workspace-ipc').registerWorkspaceIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    app: { getPath: () => dir },
    trusted: () => true,
    findCodex: () => null,
    findClaude: () => exe,
  });
  const result = await handlers.get('atlas:diagnostics')({}, {}),
    claude = result.results.find((row) => row.name === 'Claude Code');
  assert.equal(claude.installed, true);
  assert.equal(claude.ok, true);
  assert.equal(claude.version, 'Claude test version');
});
test('login uses the resolved npm runtime, quoted PowerShell arguments and an interactive console', async () => {
  const main = await fs.readFile(path.join(__dirname, '..', 'main.js'), 'utf8'),
    start = main.indexOf('function launchProviderLogin('),
    end = main.indexOf('\nfunction pruneJobs', start);
  let invocation;
  const child = new (require('node:events').EventEmitter)();
  child.stderr = new (require('node:stream').PassThrough)();
  child.kill = () => {};
  const context = {
    require: (id) =>
      id === './claude-runtime'
        ? {
            launch: (exe, args) =>
              launch(
                exe,
                args,
                { Path: 'C:\\Windows' },
                {
                  electron: true,
                  exists: (file) => file === 'C:\\Windows\\node.exe',
                  execPath: 'C:\\ATLAS app\\ATLAS.exe',
                  platform: 'win32',
                  savedPath: '',
                },
              ),
          }
        : require(id),
    app: { getPath: () => home },
    path: path.win32,
    existsSync: () => true,
    process: { env: { SystemRoot: 'C:\\Windows' } },
    Buffer,
    setTimeout,
    clearTimeout,
    spawn: (exe, args, options) => {
      invocation = { exe, args, options };
      setImmediate(() => child.emit('close', 0));
      return child;
    },
  };
  vm.runInNewContext(main.slice(start, end), context);
  await context.launchProviderLogin(home + "\\friend's npm\\cli.js", ['auth', 'login'], 'claude');
  const launcher = Buffer.from(invocation.args.at(-1), 'base64').toString('utf16le');
  assert.match(launcher, /Start-Process/);
  assert.match(launcher, /-WindowStyle Normal/);
  assert.match(launcher, /-NoExit/);
  const encoded = launcher.match(/-NoExit -EncodedCommand ([A-Za-z0-9+/=]+)/)[1],
    script = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.match(script, /friend''s npm/);
  assert(!script.includes('ELECTRON_RUN_AS_NODE'));
  assert.match(script, /node\.exe/);
  assert.match(script, /'auth' 'login'/);
  assert.equal(invocation.options.shell, false);
});
