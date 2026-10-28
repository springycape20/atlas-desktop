const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createAppLog } = require('../app-log');
async function folder(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-log-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
test('the log records levels and formatted values in a new logs folder', async (t) => {
  const file = path.join(await folder(t), 'logs', 'atlas.log'),
    log = createAppLog(file);
  log.info('started in %dms', 42);
  log.warn('slow', { step: 'migration' });
  log.error(Error('boom'));
  const text = await fs.readFile(file, 'utf8');
  assert.match(text, /^\d{4}-\d\d-\d\dT[^ ]+ INFO started in 42ms$/m);
  assert.match(text, /WARN slow \{ step: 'migration' \}/);
  assert.match(text, /ERROR Error: boom/);
});
test('a large log is rotated once and a fresh log continues', async (t) => {
  const dir = await folder(t),
    file = path.join(dir, 'atlas.log');
  await fs.writeFile(file, 'x'.repeat(200));
  createAppLog(file, { limit: 100 }).info('after rotation');
  assert.equal((await fs.readFile(file + '.old', 'utf8')).length, 200);
  assert.match(await fs.readFile(file, 'utf8'), /INFO after rotation/);
});
test('captured console output reaches both the log and the original console', async (t) => {
  const file = path.join(await folder(t), 'atlas.log'),
    seen = [],
    target = {
      log: (...a) => seen.push(['log', ...a]),
      warn: (...a) => seen.push(['warn', ...a]),
      error: (...a) => seen.push(['error', ...a]),
    };
  createAppLog(file).captureConsole(target);
  target.error('Could not migrate', 3);
  target.log('ready');
  assert.deepEqual(seen, [
    ['error', 'Could not migrate', 3],
    ['log', 'ready'],
  ]);
  const text = await fs.readFile(file, 'utf8');
  assert.match(text, /ERROR Could not migrate 3/);
  assert.match(text, /INFO ready/);
});
test('logging never throws when the log cannot be written', () => {
  const log = createAppLog(path.join(os.tmpdir(), 'atlas-missing-\0', 'atlas.log'));
  assert.doesNotThrow(() => log.error('still running'));
});

test('diagnostic logs redact labelled credentials, bearer tokens and private keys', async (t) => {
  const file = path.join(await folder(t), 'atlas.log');
  const log = createAppLog(file);
  for (const message of [
    'Authorization: Bearer test-access-value',
    'api_key=example-key-value',
    JSON.stringify({ accessToken: 'example-oauth-value', password: 'example-password-value' }),
    JSON.stringify({ password: 'private phrase with spaces and "quotes"' }),
    '-----BEGIN PRIVATE KEY-----\nexample-private-value\n-----END PRIVATE KEY-----',
  ])
    log.error(message);
  const text = await fs.readFile(file, 'utf8');
  for (const secret of [
    'test-access-value',
    'example-key-value',
    'example-oauth-value',
    'example-password-value',
    'example-private-value',
  ])
    assert(!text.includes(secret), secret);
  assert.match(text, /\[REDACTED\]/);
  assert(!text.includes('private phrase') && !text.includes('spaces and'));
});
