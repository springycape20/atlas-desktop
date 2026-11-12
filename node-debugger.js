const path = require('node:path'),
  { pathToFileURL, fileURLToPath } = require('node:url'),
  { spawn } = require('node:child_process');
async function resolveNodeExecutable(
  explicit,
  { env = process.env, self = process.execPath, electron = Boolean(process.versions.electron) } = {},
) {
  const fs = require('node:fs/promises'),
    name = process.platform === 'win32' ? 'node.exe' : 'node';
  if (
    explicit &&
    (typeof explicit !== 'string' || !path.isAbsolute(explicit) || path.basename(explicit).toLowerCase() !== name)
  )
    throw Error('Choose an absolute path to a Node.js executable.');
  const search = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  const candidates = explicit
    ? [explicit]
    : !electron
      ? [self]
      : search
          .split(path.delimiter)
          .map((folder) => folder.trim().replace(/^"|"$/g, ''))
          .filter((folder) => path.isAbsolute(folder))
          .map((folder) => path.join(folder, name));
  for (const candidate of candidates) {
    if (path.basename(candidate).toLowerCase() !== name) continue;
    try {
      const actual = await fs.realpath(candidate);
      if (electron && actual.toLowerCase() === self.toLowerCase()) continue;
      if ((await fs.stat(actual)).isFile()) return actual;
    } catch {}
  }
  throw Error(
    'Node.js was not found. Install it separately or enter its absolute executable path. ATLAS does not download a debugger runtime.',
  );
}
function createNodeDebugger({
  approve,
  busy = () => false,
  files = require('./project-files').createProjectFiles(),
  executable,
  spawnProcess = spawn,
}) {
  let child,
    socket,
    root,
    paused,
    output = '',
    error = '',
    sequence = 0,
    timer,
    breakpoints = [],
    generation = 0;
  const pending = new Map(),
    scripts = new Map();
  function rejectPending(message) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error(message));
    }
    pending.clear();
  }
  async function stop() {
    generation++;
    clearTimeout(timer);
    socket?.close();
    socket = null;
    paused = null;
    rejectPending('Debugger stopped.');
    const owned = child;
    if (owned) {
      let stopTimer;
      const closed = new Promise((resolve) => owned.once('close', resolve));
      if (process.platform === 'win32' && owned.pid) {
        const killer = spawnProcess('taskkill.exe', ['/PID', String(owned.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => owned.kill());
      } else {
        try {
          process.kill(-owned.pid, 'SIGTERM');
        } catch {
          owned.kill();
        }
      }
      await Promise.race([
        closed,
        new Promise((resolve) => {
          stopTimer = setTimeout(resolve, 3000);
        }),
      ]);
      clearTimeout(stopTimer);
      if (child === owned && owned.exitCode === null) throw Error('Debug process is still stopping. Try Stop again.');
    }
    if (child === owned) child = null;
    breakpoints = [];
  }
  function call(method, params = {}) {
    if (socket?.readyState !== 1) return Promise.reject(Error('Debugger is not connected.'));
    return new Promise((resolve, reject) => {
      const id = ++sequence,
        timeout = setTimeout(() => {
          pending.delete(id);
          reject(Error('Debugger request timed out.'));
        }, 5000);
      pending.set(id, { resolve, reject, timer: timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function safePath(url) {
    try {
      const file = await files.resolve(root, fileURLToPath(url));
      return file.relative;
    } catch {
      return null;
    }
  }
  async function state() {
    const frames = [];
    for (const [index, frame] of (paused?.callFrames || []).slice(0, 40).entries())
      frames.push({
        index,
        name: String(frame.functionName || '(anonymous)').slice(0, 200),
        path: await safePath(frame.url || scripts.get(frame.location.scriptId)),
        line: frame.location.lineNumber + 1,
        column: frame.location.columnNumber + 1,
        scopes: frame.scopeChain
          .map((scope, index) => ({ index, type: scope.type }))
          .filter((scope) => ['local', 'closure', 'block', 'catch', 'script'].includes(scope.type)),
      });
    return {
      active: Boolean(child),
      connected: socket?.readyState === 1,
      paused: Boolean(paused),
      reason: paused?.reason || '',
      cwd: root,
      output,
      error,
      frames,
      breakpoints,
    };
  }
  async function start(request) {
    if (child || busy()) throw Error('Stop active tasks, terminals and debugging before starting.');
    const cwd = await require('./project-root').createProjectRootGuard().assertProject(request.cwd),
      file = await files.resolve(cwd, request.path);
    if (!/\.(?:[cm]?js)$/i.test(file.relative))
      throw Error('Choose a JavaScript, CommonJS or ES module entry file. TypeScript must be compiled first.');
    const args = request.args || [];
    if (
      !Array.isArray(args) ||
      args.length > 30 ||
      args.some((value) => typeof value !== 'string' || value.length > 1000 || value.includes('\0'))
    )
      throw Error('Use up to 30 text arguments.');
    const runtime = await resolveNodeExecutable(executable || request.executable);
    if (
      !(await approve(
        'Debug this Node.js project?',
        cwd +
          '\n\nNode.js: ' +
          runtime +
          '\n\nEntry: ' +
          file.relative +
          '\nArguments: ' +
          JSON.stringify(args) +
          '\n\nProject code runs with your account permissions and may change files or access the network. The inspector listens only on loopback. No dependencies are installed. Stop the session when finished.',
      ))
    )
      return { cancelled: true };
    if (child || busy()) throw Error('Another task started; stop it before debugging.');
    root = cwd;
    scripts.clear();
    output = '';
    error = '';
    paused = null;
    breakpoints = [];
    const currentGeneration = ++generation;
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawnProcess(runtime, ['--inspect-brk=127.0.0.1:0', file.actual, ...args], {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const owned = child;
    timer = setTimeout(() => {
      error = 'Debugger time limit reached (30 minutes).';
      void stop().catch((value) => {
        error = value.message;
      });
    }, 1800000).unref();
    owned.once('close', () => {
      if (child === owned) {
        child = null;
        paused = null;
        socket?.close();
        socket = null;
        clearTimeout(timer);
        rejectPending('Debug process exited.');
      }
    });
    try {
      const url = await new Promise((resolve, reject) => {
        let stderr = '',
          settled = false;
        const timeout = setTimeout(() => reject(Error('Node inspector did not start within 10 seconds.')), 10000);
        const fail = (value) => {
          clearTimeout(timeout);
          reject(value);
        };
        owned.once('error', fail);
        owned.once('close', () => {
          if (!settled) fail(Error('Debug process exited before connecting.'));
        });
        owned.stdout.on('data', (part) => {
          output = (output + part.toString()).slice(-32000);
        });
        owned.stderr.on('data', (part) => {
          output = (output + part.toString()).slice(-32000);
          stderr = (stderr + part.toString()).slice(-8000);
          const match = stderr.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/i);
          if (match && !settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(match[1]);
          }
        });
      });
      if (generation !== currentGeneration) throw Error('Debugger was stopped.');
      socket = new WebSocket(url);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('Inspector connection timed out.')), 5000);
        socket.addEventListener(
          'open',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        socket.addEventListener(
          'error',
          () => {
            clearTimeout(timeout);
            reject(Error('Inspector connection failed.'));
          },
          { once: true },
        );
      });
      socket.addEventListener('message', (event) => {
        try {
          if (typeof event.data !== 'string' || event.data.length > 8 * 1048576) {
            error = 'Inspector response exceeded the size limit.';
            void stop().catch(() => {});
            return;
          }
          const row = JSON.parse(event.data);
          if (row.method === 'Debugger.scriptParsed' && scripts.size < 10000)
            scripts.set(row.params.scriptId, String(row.params.url || '').slice(0, 3000));
          if (row.id) {
            const request = pending.get(row.id);
            if (request) {
              clearTimeout(request.timer);
              pending.delete(row.id);
              row.error ? request.reject(Error(row.error.message)) : request.resolve(row.result);
            }
          } else if (row.method === 'Debugger.paused') paused = row.params;
          else if (row.method === 'Debugger.resumed') paused = null;
        } catch {}
      });
      socket.addEventListener('close', () => rejectPending('Inspector disconnected.'));
      await call('Runtime.enable');
      await call('Debugger.enable');
      await call('Runtime.runIfWaitingForDebugger');
      return state();
    } catch (value) {
      error = value.message;
      await stop();
      throw value;
    }
  }
  async function action(request = {}) {
    if (request.action === 'status') return state();
    if (request.action === 'stop') {
      await stop();
      return state();
    }
    if (request.action === 'start') return start(request);
    if (!child) throw Error('Start a debug session first.');
    if ((await require('./project-root').createProjectRootGuard().assertProject(request.cwd)) !== root)
      throw Error('Return to the debug session project.');
    if (request.action === 'breakpoint-add') {
      const file = await files.resolve(root, request.path),
        line = request.line;
      if (
        !/\.(?:[cm]?js)$/i.test(file.relative) ||
        !Number.isInteger(line) ||
        line < 1 ||
        line > 1000000 ||
        breakpoints.length >= 100
      )
        throw Error('Use a JavaScript file and a valid line (100 breakpoints maximum).');
      const result = await call('Debugger.setBreakpointByUrl', {
        url: pathToFileURL(file.actual).href,
        lineNumber: line - 1,
      });
      breakpoints.push({ id: result.breakpointId, path: file.relative, line });
      return state();
    }
    if (request.action === 'breakpoint-remove') {
      const row = breakpoints.find((row) => row.id === request.id);
      if (!row) throw Error('Breakpoint not found.');
      await call('Debugger.removeBreakpoint', { breakpointId: row.id });
      breakpoints = breakpoints.filter((item) => item !== row);
      return state();
    }
    if (request.action === 'variables') {
      const frame = paused?.callFrames?.[request.frame],
        scope = frame?.scopeChain?.[request.scope];
      if (!scope || !['local', 'closure', 'block', 'catch', 'script'].includes(scope.type))
        throw Error('Select a paused local scope.');
      const result = await call('Runtime.getProperties', {
        objectId: scope.object.objectId,
        ownProperties: true,
        generatePreview: false,
      });
      return {
        variables: (result.result || []).slice(0, 100).map((row) => ({
          name: row.name.slice(0, 200),
          value: row.value
            ? String(row.value.value ?? row.value.unserializableValue ?? row.value.description ?? row.value.type).slice(
                0,
                2000,
              )
            : '(accessor; not invoked)',
        })),
      };
    }
    const methods = {
      pause: 'Debugger.pause',
      resume: 'Debugger.resume',
      'step-over': 'Debugger.stepOver',
      'step-into': 'Debugger.stepInto',
      'step-out': 'Debugger.stepOut',
    };
    if (!methods[request.action]) throw Error('Unknown debugger action.');
    if (request.action !== 'pause' && !paused) throw Error('Wait until execution is paused.');
    await call(methods[request.action]);
    return state();
  }
  let serial = Promise.resolve();
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
    active: () => Boolean(child),
    dispose: stop,
  };
}
module.exports = { createNodeDebugger, resolveNodeExecutable };
