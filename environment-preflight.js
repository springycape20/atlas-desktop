const { execFile } = require('node:child_process'),
  { promisify } = require('node:util');
const allowed = {
  node: ['node', ['--version']],
  python: ['python', ['--version']],
  git: ['git', ['--version']],
  go: ['go', ['version']],
  cargo: ['cargo', ['--version']],
  npm:
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '& npm.cmd --version']]
      : ['npm', ['--version']],
};
function meets(actual, requirement) {
  const match = String(requirement).match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+){0,2})$/);
  if (!match) throw Error('Use a version such as >=22 or =3.12.');
  const a = (actual.match(/\d+(?:\.\d+){0,2}/)?.[0] || '0').split('.').map(Number),
    b = match[2].split('.').map(Number);
  let diff = 0;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) {
      diff = (a[i] || 0) - b[i];
      break;
    }
  }
  return { '>=': diff >= 0, '<=': diff <= 0, '>': diff > 0, '<': diff < 0, '=': diff === 0 }[match[1] || '>='];
}
async function preflight(cwd, requirements, { run = promisify(execFile) } = {}) {
  const rows = [];
  for (const line of String(requirements || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)) {
    const match = line.match(/^(node|python|git|go|cargo|npm)\s*(.*)$/i);
    if (!match) throw Error('Supported tools: node, python, git, go, cargo, npm. Use one per line.');
    const name = match[1].toLowerCase(),
      required = match[2] || '>=0';
    try {
      const [exe, args] = allowed[name];
      const value = await run(exe, args, { cwd, windowsHide: true, timeout: 10000, maxBuffer: 65536, shell: false });
      const version = String(value.stdout || value.stderr || '').trim();
      rows.push({ name, required, version, status: meets(version, required) ? 'passed' : 'failed' });
    } catch (error) {
      rows.push({ name, required, status: 'failed', error: error.message.slice(0, 300) });
    }
  }
  return {
    status:
      rows.length && rows.every((row) => row.status === 'passed')
        ? 'passed'
        : rows.length
          ? 'failed'
          : 'not-configured',
    results: rows,
  };
}
module.exports = { preflight, meets };
