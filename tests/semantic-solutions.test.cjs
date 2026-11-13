const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createSemanticSolutions, normalise } = require('../semantic-solutions');
const tasks = [
  {
    id: 'a',
    status: 'completed',
    cwd: 'C:/demo',
    prompt: 'Repair the updater',
    result: { output: 'Fix installer restart' },
  },
  { id: 'b', status: 'completed', cwd: 'C:/demo', prompt: 'Render kittens', result: { output: 'Cat pictures' } },
];
const response = (texts) =>
  new Response(
    JSON.stringify({
      data: texts.map((t, index) => ({ index, embedding: /cat|kitten|feline/i.test(t) ? [0, 1] : [1, 0] })),
    }),
  );
test('local semantic retrieval uses embeddings, explicit review and unchanged sources', async () => {
  let rows = structuredClone(tasks),
    calls = [];
  const s = createSemanticSolutions({
    tasks: () => rows,
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      return response(JSON.parse(opts.body).input);
    },
  });
  const preview = await s.action({ action: 'preview', cwd: 'C:/demo' });
  assert.equal(calls.length, 0);
  await assert.rejects(
    s.action({ action: 'build', cwd: 'C:/demo', token: preview.token, base: 'http://127.0.0.1:1/v1', model: 'embed' }),
    /approve/,
  );
  const index = await s.action({
    action: 'build',
    cwd: 'C:/demo',
    token: preview.token,
    consent: true,
    base: 'http://localhost:11434/v1',
    model: 'embed',
  });
  const result = await s.action({ action: 'search', cwd: 'C:/demo', id: index.id, query: 'feline artwork' });
  assert.equal(result.results[0].id, 'b');
  assert(calls.every((c) => c.url === 'http://127.0.0.1:11434/v1/embeddings' && c.opts.redirect === 'error'));
  rows[1].result.output = 'changed';
  const stale = await s.action({ action: 'search', cwd: 'C:/demo', id: index.id, query: 'feline artwork' });
  assert.equal(stale.stale, 1);
  assert(!stale.results.some((r) => r.id === 'b'));
  await s.action({ action: 'clear' });
  await assert.rejects(
    s.action({ action: 'search', cwd: 'C:/demo', id: index.id, query: 'anything' }),
    /Build an index/,
  );
});
test('semantic search rejects external endpoints, malformed vectors and stale review', async () => {
  let rows = structuredClone(tasks),
    calls = 0;
  const s = createSemanticSolutions({
    tasks: () => rows,
    fetch: async () => {
      calls++;
      return response(['x']);
    },
  });
  const p = await s.action({ action: 'preview' });
  await assert.rejects(
    s.action({ action: 'build', token: p.token, consent: true, base: 'https://example.com/v1', model: 'embed' }),
    /loopback/,
  );
  assert.equal(calls, 0);
  rows[0].prompt = 'changed';
  await assert.rejects(
    s.action({ action: 'build', token: p.token, consent: true, base: 'http://127.0.0.1/v1', model: 'embed' }),
    /sources changed/,
  );
  for (const vector of [[0, 0], [1, NaN], [Infinity, 1], [], [1]]) assert.throws(() => normalise(vector));
});
