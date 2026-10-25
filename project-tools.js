const fs = require('node:fs/promises'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
async function detectProject(folder) {
  const cwd = await fs.realpath(folder);
  if (!(await fs.stat(cwd)).isDirectory()) throw Error('Choose a project folder.');
  const exists = async (name) => Boolean(await fs.stat(path.join(cwd, name)).catch(() => null));
  const types = [],
    checks = [],
    installs = [];
  if (await exists('package.json')) {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8')),
      pm = (await exists('pnpm-lock.yaml')) ? 'pnpm' : (await exists('yarn.lock')) ? 'yarn' : 'npm';
    types.push('Node.js');
    for (const name of ['test', 'lint', 'typecheck', 'build'])
      if (pkg.scripts?.[name] && !/no test specified/.test(pkg.scripts[name])) checks.push(pm + ' run ' + name);
    installs.push(pm === 'npm' && (await exists('package-lock.json')) ? 'npm ci' : pm + ' install');
  }
  if ((await exists('pyproject.toml')) || (await exists('requirements.txt'))) {
    types.push('Python');
    checks.push('python -m pytest');
    if (await exists('requirements.txt')) installs.push('python -m pip install -r requirements.txt');
  }
  if (await exists('Cargo.toml')) {
    types.push('Rust');
    checks.push('cargo test', 'cargo check');
    installs.push('cargo fetch');
  }
  if (await exists('go.mod')) {
    types.push('Go');
    checks.push('go test ./...');
    installs.push('go mod download');
  }
  if (await exists('CMakeLists.txt')) types.push('CMake');
  return { cwd, name: path.basename(cwd), types, checks, installs };
}
function runCheck(command, cwd, { signal, timeoutMs = 120000, spawnProcess = spawn } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let output = '',
      timedOut = false,
      settled = false;
    const executable = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
      args =
        process.platform === 'win32'
          ? [
              '-NoLogo',
              '-NoProfile',
              '-NonInteractive',
              '-OutputFormat',
              'Text',
              '-EncodedCommand',
              Buffer.from(
                '$ErrorActionPreference="Stop"; $ProgressPreference="SilentlyContinue"; ' +
                  command +
                  '\nif ($LASTEXITCODE) { exit $LASTEXITCODE }',
                'utf16le',
              ).toString('base64'),
            ]
          : ['-c', command];
    const child = spawnProcess(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: process.platform !== 'win32',
    });
    const finish = (status, exitCode, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve({
        command,
        status,
        exitCode,
        output: output.slice(-16000),
        error,
        startedAt,
        durationMs: Date.now() - startedAt,
      });
    };
    const stop = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill();
        }
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    timer.unref();
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (part) => {
        output = (output + part.toString()).slice(-16000);
      });
    child.once('error', (error) => finish('failed', null, error.message));
    child.once('close', (code) =>
      finish(signal?.aborted ? 'cancelled' : timedOut ? 'timed-out' : code === 0 ? 'passed' : 'failed', code),
    );
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
  });
}
async function completionChecks(project, cwd, { signal, progress = () => {}, runner = runCheck } = {}) {
  const commands = (project?.checkCommands || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!project?.autoCheck || !commands.length)
    return {
      status: 'not-checked',
      results: [],
      reason: !project?.autoCheck
        ? 'Automatic checks are disabled for this project.'
        : 'No completion checks configured.',
    };
  const results = [];
  for (const cmd of commands) {
    if (signal?.aborted) break;
    progress('Checking: ' + cmd);
    results.push(await runner(cmd, cwd, { signal }));
  }
  return {
    status: signal?.aborted ? 'cancelled' : results.every((row) => row.status === 'passed') ? 'passed' : 'failed',
    results,
  };
}
module.exports = { detectProject, runCheck, completionChecks };
