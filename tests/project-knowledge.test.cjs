const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createKnowledgeIndex, formatKnowledge } = require('../project-knowledge');
test('knowledge search refreshes changed and removed code, references symbols and excludes credentials', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-knowledge-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let names = ['engine.js', '.env', '.handover/notes.md', 'large.js'];
  await fs.writeFile(
    path.join(root, 'engine.js'),
    "const store = require('./store');\nfunction transcribeAudio() { return 'voice'; }\n",
  );
  await fs.writeFile(path.join(root, '.env'), 'voice=SECRET');
  await fs.writeFile(path.join(root, 'large.js'), 'voice'.repeat(30000));
  const index = createKnowledgeIndex({ listFiles: async () => names });
  let result = await index.search(root, 'transcribeAudio voice');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].path, 'engine.js');
  assert.deepEqual(result.results[0].dependencies, ['./store']);
  assert.ok(result.results[0].symbols.some((s) => s.name === 'transcribeAudio' && s.line === 2));
  assert.match(formatKnowledge(result), /"engine.js":1/);
  assert.equal((await index.search(root, 'voice')).refreshed, 0);
  assert.equal((await index.search(root, 'voice', { excluded: ['engine.js'] })).results.length, 0);
  await fs.writeFile(path.join(root, 'engine.js'), 'function changedAudio() {}');
  result = await index.search(root, 'changedAudio');
  assert.equal(result.refreshed, 1);
  assert.match(result.results[0].excerpt, /changedAudio/);
  names = [];
  assert.equal((await index.search(root, 'voice')).indexed, 0);
});
test('knowledge refuses parent paths and source reached through a symlink', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-knowledge-link-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  await fs.mkdir(project);
  await fs.writeFile(path.join(root, 'outside.js'), 'function privateSecret() {}');
  await fs.symlink(root, path.join(project, 'linked'), 'junction');
  const index = createKnowledgeIndex({ listFiles: async () => ['../outside.js', 'linked/outside.js'] });
  assert.deepEqual((await index.search(project, 'privateSecret')).results, []);
});
