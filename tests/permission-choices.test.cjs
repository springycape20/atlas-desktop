const test = require('node:test'),
  assert = require('node:assert/strict');
const { createApprovalManager, codexApproval } = require('../approval-manager');
const { createClaudeControl } = require('../claude-control');
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('Allow remembers only the identical request in the same task and provider', async () => {
  const manager = createApprovalManager(),
    request = { jobId: 'one', provider: 'codex', title: 'Run command?', details: 'npm test' };
  const pending = manager.ask(request),
    row = manager.list()[0];
  assert.deepEqual(row.choices, ['Allow', 'Allow once', 'Deny']);
  assert.match(row.permissionScope, /exact request for this task/);
  assert(!('rememberKey' in row));
  manager.answer(row.id, 'Allow');
  assert.equal(await pending, 'Allow');
  assert.equal(await manager.ask(request), 'Allow');
  assert.equal(manager.list().length, 0);
  for (const change of [{ details: 'npm install' }, { jobId: 'two' }, { provider: 'claude' }]) {
    const next = manager.ask({ ...request, ...change });
    assert.equal(manager.list().length, 1);
    manager.answer(manager.list()[0].id, 'Deny');
    assert.equal(await next, 'Deny');
  }
  manager.cancelJob('one');
  const next = manager.ask(request);
  assert.equal(manager.list().length, 1);
  manager.answer(manager.list()[0].id, 'Deny');
  await next;
});
test('Allow once and Deny never approve the next request', async () => {
  const manager = createApprovalManager(),
    request = { jobId: 'one', provider: 'claude', title: 'File access', details: 'a.txt' };
  for (const choice of ['Allow once', 'Deny', 'Allow once']) {
    const next = manager.ask(request);
    assert.equal(manager.list().length, 1);
    manager.answer(manager.list()[0].id, choice);
    assert.equal(await next, choice);
  }
});
test('desktop Allow delegates remembering to the chat permission service', async () => {
  const manager = createApprovalManager(),
    request = { jobId: 'one', provider: 'codex', title: 'Screenshot', desktopOwner: 'colab:one', remember: false };
  const first = manager.ask(request);
  assert.match(manager.list()[0].permissionScope, /this chat/);
  manager.answer(manager.list()[0].id, 'Allow');
  await first;
  const next = manager.ask(request);
  assert.equal(manager.list().length, 1);
  manager.answer(manager.list()[0].id, 'Deny');
  await next;
});
test('Allow supports Codex commands and permission requests without broadening provider scope', async () => {
  const manager = createApprovalManager(),
    job = { id: 'one' };
  const command = codexApproval(manager, job, 'item/commandExecution/requestApproval', { command: 'npm test' });
  manager.answer(manager.list()[0].id, 'Allow');
  assert.deepEqual(await command, { decision: 'accept' });
  assert.deepEqual(
    await codexApproval(manager, job, 'item/commandExecution/requestApproval', { command: 'npm test' }),
    { decision: 'accept' },
  );
  const permissions = { network: { enabled: true } },
    access = codexApproval(manager, job, 'item/permissions/requestApproval', { permissions });
  manager.answer(manager.list()[0].id, 'Allow');
  assert.deepEqual(await access, { permissions, scope: 'turn' });
});
test('Claude Allow remembers exact tool input, while changed input still asks', async () => {
  const manager = createApprovalManager(),
    writes = [],
    control = createClaudeControl({ manager, job: { id: 'one' }, write: (line) => writes.push(JSON.parse(line)) });
  const send = (id, command) =>
    control.push(
      JSON.stringify({
        type: 'control_request',
        request_id: id,
        request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command } },
      }) + '\n',
    );
  send('a', 'npm test');
  manager.answer(manager.list()[0].id, 'Allow');
  await tick();
  send('b', 'npm test');
  await tick();
  assert.equal(manager.list().length, 0);
  assert.equal(writes.length, 2);
  assert(writes.every((row) => row.response.response.behavior === 'allow'));
  send('c', 'npm install');
  manager.answer(manager.list()[0].id, 'Deny');
  await tick();
  assert.equal(writes[2].response.response.behavior, 'deny');
});
test('ordinary questions retain their options and never become permissions', async () => {
  const manager = createApprovalManager(),
    next = manager.ask({
      jobId: 'one',
      provider: 'claude',
      title: 'Pick a colour',
      choices: ['Blue', 'Green'],
      textInput: true,
    });
  assert.deepEqual(manager.list()[0].choices, ['Blue', 'Green']);
  assert.equal(manager.list()[0].permissionScope, undefined);
  manager.answer(manager.list()[0].id, 'Blue');
  assert.deepEqual(await next, { choice: 'Blue', text: '' });
});
