const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { runCheck } = require('../project-tools');

test('PowerShell checks point package managers at their .cmd shims without changing the policy', async () => {
  let launched;
  const child = {
    stdout: { on() {} },
    stderr: { on() {} },
    once(event, fn) {
      if (event === 'close') setImmediate(() => fn(0));
    },
  };
  await runCheck('npm test', process.cwd(), {
    spawnProcess: (executable, args) => {
      launched = { executable, args };
      return child;
    },
  });
  if (process.platform !== 'win32') return assert.deepEqual(launched.args, ['-c', 'npm test']);
  const script = Buffer.from(launched.args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /foreach \(\$shim in 'npm','npx','pnpm','yarn'\)/);
  assert.match(script, /Set-Alias -Name \$shim -Value \$found\.Source/);
  assert(script.indexOf('Set-Alias') < script.indexOf('npm test'), 'the aliases are set before the command runs');
  assert.doesNotMatch(launched.args.join(' '), /ExecutionPolicy/i, 'the execution policy is never changed');
});
test(
  'on Windows, "npm" in a check runs npm.cmd even when an npm.ps1 sits beside it',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-shims-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    await fs.writeFile(path.join(dir, 'npm.ps1'), 'Write-Output "ran npm.ps1"\nexit 9\n');
    await fs.writeFile(path.join(dir, 'npm.cmd'), '@echo ran npm.cmd %*\r\n@exit /b 0\r\n');
    const before = process.env.PATH;
    process.env.PATH = dir + path.delimiter + before;
    t.after(() => (process.env.PATH = before));
    const run = await runCheck('npm test', dir, { timeoutMs: 60000 });
    assert.equal(run.status, 'passed', run.output);
    assert.equal(run.exitCode, 0);
    assert.match(run.output, /ran npm\.cmd test/);
    assert.doesNotMatch(run.output, /ran npm\.ps1/);
    const failing = path.join(dir, 'fail');
    await fs.mkdir(failing);
    await fs.writeFile(path.join(failing, 'npm.cmd'), '@echo failing tests\r\n@exit /b 3\r\n');
    process.env.PATH = failing + path.delimiter + before;
    const failed = await runCheck('npm test', dir, { timeoutMs: 60000 });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.exitCode, 3, 'the shim keeps the real exit code');
  },
);
