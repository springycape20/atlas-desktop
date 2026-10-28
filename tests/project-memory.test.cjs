const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { createService } = require('../assistant-service');
test('project memory never leaks into another project and survives restart', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-memory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const a = path.join(root, 'a'),
    b = path.join(root, 'b');
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  const service = createService({ directory: root });
  service.memory('save', { text: 'Use the cobalt convention', category: 'preference', projectFolder: a });
  service.memory('save', { text: 'Global preference', category: 'preference' });
  service.memory('save', {
    text: 'Keep persistence behind repository interfaces',
    category: 'decision',
    projectFolder: a,
  });
  assert.match(service.context('An unrelated request', a), /repository interfaces/);
  assert.doesNotMatch(service.context('An unrelated request', b), /repository interfaces/);
  assert.match(service.context('cobalt', a), /cobalt/);
  assert.doesNotMatch(service.context('cobalt', b), /cobalt/);
  assert.match(service.context('anything', b), /Global preference/);
  await service.flush();
  assert.match(createService({ directory: root }).context('cobalt', a), /cobalt/);
});
