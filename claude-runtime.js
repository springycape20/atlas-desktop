const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { execFile } = require('node:child_process');
let registryCache, registryRead;
// Read Unicode Windows environment values asynchronously, never through a project command.
function refreshWindowsPath(force = false) {
  if (process.platform !== 'win32') return Promise.resolve('');
  if (registryRead) return registryRead;
  if (!force && registryCache && Date.now() - registryCache.at < 30000) return Promise.resolve(registryCache.value);
  const terminal = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const script =
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')";
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  registryRead = new Promise((resolve) =>
    execFile(
      terminal,
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { encoding: 'utf8', windowsHide: true, timeout: 4000, env },
      (error, stdout) => {
        registryCache = { at: Date.now(), value: error ? registryCache?.value || '' : stdout.trim() };
        resolve(registryCache.value);
      },
    ),
  ).finally(() => {
    registryRead = null;
  });
  return registryRead;
}
function savedWindowsPath() {
  void refreshWindowsPath();
  return registryCache?.value || '';
}
function findClaude({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
  exists = (file) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  },
  savedPath,
} = {}) {
  const p = platform === 'win32' ? path.win32 : path,
    lookup = Object.fromEntries(Object.entries(env).map(([key, value]) => [key.toLowerCase(), value]));
  const expand = (value) =>
    String(value || '')
      .replace(/%([^%]+)%/g, (all, key) => lookup[key.toLowerCase()] || all)
      .replace(/^"|"$/g, '');
  const roaming = env.APPDATA || p.join(home, 'AppData', 'Roaming'),
    local = env.LOCALAPPDATA || p.join(home, 'AppData', 'Local');
  const directories = [
    ...(lookup.path || '').split(platform === 'win32' ? ';' : ':'),
    ...(savedPath ?? (platform === 'win32' ? savedWindowsPath(env) : '')).split(platform === 'win32' ? ';' : ':'),
    p.join(roaming, 'npm'),
  ]
    .map(expand)
    .filter((dir) => p.isAbsolute(dir));
  function npm(prefix) {
    return [
      p.join(prefix, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      p.join(prefix, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    ];
  }
  const candidates = env.CLAUDE_CODE_EXECUTABLE
    ? [expand(env.CLAUDE_CODE_EXECUTABLE)]
    : [
        p.join(home, '.local', 'bin', platform === 'win32' ? 'claude.exe' : 'claude'),
        ...(platform === 'win32' ? [p.join(local, 'Microsoft', 'WinGet', 'Links', 'claude.exe')] : []),
        ...directories.flatMap((dir) => [p.join(dir, platform === 'win32' ? 'claude.exe' : 'claude'), ...npm(dir)]),
      ];
  for (let candidate of candidates) {
    if (!candidate || !p.isAbsolute(candidate)) continue;
    // npm shims need a shell on Windows; execute their known package entry point
    // directly instead, preserving arguments and avoiding shell quoting/injection.
    if (/\.(?:cmd|ps1|bat)$/i.test(candidate)) {
      const prefix = p.dirname(candidate);
      candidate = npm(prefix).find(exists);
    }
    if (candidate && exists(candidate)) return candidate;
  }
  return null;
}
function runtimeEnv(env = process.env, { platform = process.platform, savedPath } = {}) {
  if (platform !== 'win32') return env;
  const lookup = Object.fromEntries(Object.entries(env).map(([key, value]) => [key.toLowerCase(), value]));
  const saved = (savedPath ?? savedWindowsPath(env)).replace(
    /%([^%]+)%/g,
    (all, key) => lookup[key.toLowerCase()] || all,
  );
  const next = { ...env };
  for (const key of Object.keys(next)) if (key.toLowerCase() === 'path') delete next[key];
  const entries = [...(lookup.path || '').split(';'), ...saved.split(';')]
    .map((value) => value.replace(/^"|"$/g, ''))
    .filter((value) => path.win32.isAbsolute(value));
  const seen = new Set();
  next.Path = entries
    .filter((value) => {
      const key = value.toLowerCase().replace(/[\\/]+$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(';');
  return next;
}
function launch(
  executable,
  args,
  env = process.env,
  {
    execPath = process.execPath,
    electron = Boolean(process.versions.electron),
    exists = (file) => {
      try {
        return fs.statSync(file).isFile();
      } catch {
        return false;
      }
    },
    ...options
  } = {},
) {
  env = runtimeEnv(env, options);
  if (!/\.[cm]?js$/i.test(executable)) return { executable, args, env };
  const p = (options.platform || process.platform) === 'win32' ? path.win32 : path,
    lookup = Object.fromEntries(Object.entries(env).map(([key, value]) => [key.toLowerCase(), value]));
  const node = electron
    ? [
        p.join(p.dirname(executable), 'node.exe'),
        ...(lookup.path || '')
          .split(p.delimiter)
          .filter((dir) => p.isAbsolute(dir))
          .map((dir) => p.join(dir, p === path.win32 ? 'node.exe' : 'node')),
      ].find(exists)
    : execPath;
  if (!node)
    throw Error(
      'Claude Code was installed through npm but Node.js could not be found. Install Node.js or use the native Claude Code installer, then restart ATLAS.',
    );
  return { executable: node, args: [executable, ...args], env };
}
function errorDetail(error) {
  const message = String(error?.message || error || 'Unknown error')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/(?:sk-ant-[\w-]+|Bearer\s+\S+)/gi, '[redacted]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[account]');
  const hint = /git.bash|bash.*(?:not found|requires)/i.test(message)
    ? ' Check your Git for Windows / Git Bash installation.'
    : /unknown (?:command|option)|unrecognized (?:command|option)/i.test(message)
      ? ' Update Claude Code, then retry.'
      : /ENOENT|not recognized|cannot find/i.test(message)
        ? ' Restart ATLAS after installing Claude Code, or set CLAUDE_CODE_EXECUTABLE to its full path.'
        : '';
  return ('Could not check Claude Code: ' + message.slice(-650) + hint).slice(0, 1000);
}
async function authStatus(executable, execute, cwd) {
  if (!executable)
    return {
      loggedIn: false,
      status: 'missing',
      detail: process.env.CLAUDE_CODE_EXECUTABLE
        ? 'CLAUDE_CODE_EXECUTABLE does not point to a supported Claude Code installation. Correct or remove that variable and restart ATLAS.'
        : 'Claude Code CLI not found. Claude Desktop alone does not provide the CLI used by ATLAS.',
    };
  try {
    const data = JSON.parse(await execute(executable, ['auth', 'status', '--json'], cwd));
    if (typeof data.loggedIn !== 'boolean')
      throw Error('Unrecognized account status response. Update Claude Code and retry.');
    return {
      loggedIn: data.loggedIn,
      status: data.loggedIn ? 'connected' : 'signed-out',
      detail: data.loggedIn
        ? `${data.authMethod || 'Account'}${data.subscriptionType ? ' · ' + data.subscriptionType : ''}`
        : 'Not signed in to Claude Code. Use Sign in; a Claude Desktop login may be separate.',
    };
  } catch (error) {
    // Signed-out CLIs can return a nonzero exit code with valid JSON on stdout.
    try {
      if (JSON.parse(error.stdout).loggedIn === false)
        return {
          loggedIn: false,
          status: 'signed-out',
          detail: 'Not signed in to Claude Code. Use Sign in in Settings.',
        };
    } catch {}
    return { loggedIn: false, status: 'error', detail: errorDetail(error) };
  }
}
async function command(executable, args, cwd, options = {}) {
  const spec = launch(executable, args, options.env || process.env);
  return require('./workspace-service').command(spec.executable, spec.args, cwd, {
    ...options,
    env: { ...spec.env, GIT_TERMINAL_PROMPT: '0' },
  });
}
module.exports = { findClaude, launch, authStatus, errorDetail, runtimeEnv, command, refreshWindowsPath };
