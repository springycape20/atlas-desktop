const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
test('idle shells allow chat while executing commands are tracked separately across tabs', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-shell-tabs-'));
  let hooks = [];
  const service = require('../project-terminal').createProjectTerminal({
    approve: async () => true,
    shellRunner: async (_root, options) => {
      hooks.push(options);
      options.onStart({ pid: hooks.length, write: () => options.onBusy(true) });
      return new Promise((resolve) =>
        options.signal.addEventListener('abort', () => resolve({ status: 'cancelled', exitCode: null }), {
          once: true,
        }),
      );
    },
  });
  t.after(async () => {
    service.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });
  const first = await service.action({ action: 'start', cwd: root, shell: true }),
    second = await service.action({ action: 'start', cwd: root, shell: true });
  assert.equal((await service.action({ action: 'list' })).length, 2);
  assert.equal(service.active(), false);
  await service.action({ action: 'input', id: first.id, text: 'echo first' });
  assert(service.active());
  hooks[0].onBusy(false);
  assert.equal(service.active(), false);
  await service.action({ action: 'close', id: second.id });
  assert.equal((await service.action({ action: 'list' })).length, 1);
});
test('persistent shell keeps variables and directories across separate multiline submissions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-shell-')),
    controller = new AbortController();
  let processHandle,
    output = '',
    busy = false;
  const done = require('../shell-session').runShell(root, {
    signal: controller.signal,
    timeoutMs: 15000,
    onStart: (value) => (processHandle = value),
    onOutput: (text) => (output += text),
    onBusy: (value) => (busy = value),
  });
  t.after(async () => {
    controller.abort();
    await done;
    await fs.rm(root, { recursive: true, force: true });
  });
  const wait = async (fn) => {
    for (let n = 0; n < 200; n++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error('Shell did not respond: ' + output);
  };
  const first =
    process.platform === 'win32'
      ? "$atlasValue=41\nWrite-Output 'FIRST_READY'"
      : "atlasValue=41\nprintf 'FIRST_READY\\n'";
  processHandle.write(first);
  await wait(() => !busy && output.includes('FIRST_READY'));
  processHandle.write(
    process.platform === 'win32'
      ? "Write-Output ($atlasValue+1)\nSet-Location ..\nWrite-Output 'SECOND_READY'"
      : "printf '%s\\n' $((atlasValue+1))\ncd ..\nprintf 'SECOND_READY\\n'",
  );
  await wait(() => !busy && output.includes('SECOND_READY'));
  assert.match(output, /42/);
  processHandle.write(process.platform === 'win32' ? 'Write-Output (Get-Location).Path' : 'pwd');
  const expectedDirectory = await fs.realpath(path.dirname(root));
  await wait(() => !busy && output.toLowerCase().includes(expectedDirectory.toLowerCase()));
  assert(!output.includes('ATLAS_DONE_'));
});
