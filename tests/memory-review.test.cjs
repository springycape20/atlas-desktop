const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { createService } = require('../assistant-service');
const DAY = 86400000;
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-memory-review-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const clock = { at: 1000 * DAY };
  return { directory, clock, service: createService({ directory, notify() {}, now: () => clock.at }) };
}
const byText = (rows, text) => rows.find((row) => row.text === text);
test('memory review flags duplicates, old memories and missing project folders', (t) => {
  const { directory, clock, service } = fixture(t);
  const project = path.join(directory, 'project');
  fs.mkdirSync(project);
  service.memory('save', { text: 'Old note' });
  clock.at += 181 * DAY;
  service.memory('save', { text: 'Use  tabs' });
  service.memory('save', { text: 'use tabs' });
  service.memory('save', { text: 'Project note', projectFolder: project });
  fs.rmSync(project, { recursive: true });
  const { rows, limit } = service.memory('review');
  assert.equal(limit, 100);
  assert.equal(byText(rows, 'Old note').old, true);
  assert.equal(byText(rows, 'Use  tabs').old, false);
  assert.equal(byText(rows, 'Use  tabs').duplicate, false);
  assert.equal(byText(rows, 'use tabs').duplicate, true);
  assert.equal(byText(rows, 'Project note').missingFolder, true);
  assert.equal(byText(rows, 'Old note').missingFolder, false);
  assert.equal(byText(rows, 'Old note').sent, undefined);
});
test('memory review shows exactly what a message would send', (t) => {
  const { directory, service } = fixture(t);
  const project = path.join(directory, 'project'),
    other = path.join(directory, 'other');
  fs.mkdirSync(project);
  fs.mkdirSync(other);
  service.memory('save', { text: 'Prefer short answers', category: 'preference' });
  service.memory('save', { text: 'Uses the payments service', category: 'project' });
  service.memory('save', { text: 'Unrelated', category: 'task' });
  service.memory('save', { text: 'Only in the other project', projectFolder: other });
  const prompt = 'Fix payments';
  const { rows } = service.memory('review', { prompt, cwd: project });
  const sent = rows.filter((row) => row.sent).map((row) => row.text);
  assert.deepEqual(sent.sort(), ['Prefer short answers', 'Uses the payments service']);
  const context = service.context(prompt, project);
  for (const text of sent) assert(context.includes(text));
  assert(!context.includes('Unrelated'));
  assert(!context.includes('other project'));
});
test('reviewing memories changes nothing on disk', async (t) => {
  const { directory, service } = fixture(t);
  service.memory('save', { text: 'Keep me' });
  await service.flush();
  const file = path.join(directory, 'assistant-data.json'),
    before = fs.readFileSync(file, 'utf8');
  assert.equal(service.memory('review').rows.length, 1);
  await service.flush();
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(service.memory('list')[0].duplicate, undefined);
});
