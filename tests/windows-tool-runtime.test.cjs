const test = require('node:test'),
  assert = require('node:assert/strict'),
  runtime = require('../windows-tool-runtime'),
  { windowsPreset } = require('../integration-service');
test('managed Windows runtime is pinned to an immutable source and verified archive hash', () => {
  assert.match(runtime.REVISION, /^[a-f0-9]{40}$/);
  assert.match(runtime.SHA256, /^[a-f0-9]{64}$/);
  assert(runtime.SOURCE.includes(runtime.REVISION + '.zip#sha256=' + runtime.SHA256));
  const spec = { ...windowsPreset };
  const info = runtime.apply(spec);
  assert.deepEqual(windowsPreset.args, ['--python', '3.14', 'windows-mcp', 'serve']);
  assert.deepEqual(spec.args, ['--python', '3.14', '--from', runtime.SOURCE, 'windows-mcp', 'serve']);
  assert.equal(info.revision, runtime.REVISION);
});
test('custom package, interpreter and integration overrides are never silently pinned', () => {
  assert(runtime.isManagedPreset(windowsPreset));
  for (const row of [
    { ...windowsPreset, args: ['--python', 'custom.exe', 'windows-mcp', 'serve'] },
    { ...windowsPreset, args: ['--from', 'custom-package', 'windows-mcp', 'serve'] },
    { ...windowsPreset, args: [...windowsPreset.args, '--port', '8001'] },
    { ...windowsPreset, id: 'custom' },
  ])
    assert(!runtime.isManagedPreset(row));
});
test('takeover requires the real server to explicitly confirm disabled control before an action', () => {
  assert.equal(runtime.assertDisabled({ structuredContent: { enabled: false, state: 'disabled' } }).enabled, false);
  assert.equal(
    runtime.assertDisabled({ content: [{ type: 'text', text: '{"enabled":false,"state":"disabled"}' }] }).state,
    'disabled',
  );
  for (const row of [
    { structuredContent: { enabled: true, state: 'ready' } },
    { structuredContent: { enabled: 'false', state: 'disabled' } },
    { structuredContent: { enabled: false, state: 'user' } },
    { isError: true, structuredContent: { enabled: false, state: 'disabled' } },
    { content: [{ type: 'text', text: 'unparseable' }] },
    null,
  ])
    assert.throws(() => runtime.assertDisabled(row), /No desktop action was submitted/);
});
