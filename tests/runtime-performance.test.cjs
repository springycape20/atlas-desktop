const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRuntimePerformance } = require('../runtime-performance');
const { HistoryClient } = require('../history-client');
test('local metrics retain bounded numeric durations including failed requests', async () => {
  let time = 0;
  const meter = createRuntimePerformance({
    now: () => time++,
    memory: () => ({ rss: 20 * 1048576, heapUsed: 3 * 1048576 }),
  });
  meter.startup(321);
  await assert.rejects(
    meter.measure('provider', async () => {
      throw Error('fixture');
    }),
  );
  for (let i = 0; i < 80; i++) meter.record('knowledge', i);
  const value = meter.snapshot();
  assert.equal(value.startupMs, 321);
  assert.equal(value.mainProcessRssMB, 20);
  assert.equal(value.samples.provider.count, 1);
  assert.equal(value.samples.knowledge.count, 40);
  assert.equal(value.samples.knowledge.latestMs, 79);
});
test('history worker releases idle memory and can restart for a new request', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-idle-history-'));
  const client = new HistoryClient({ home }, { idleMs: 30 });
  t.after(async () => {
    client.close();
    await fs.rm(home, { recursive: true, force: true });
  });
  await client.request('list', { provider: 'codex' });
  const first = client.worker;
  assert.ok(first);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(client.worker, null);
  await client.request('list', { provider: 'codex' });
  assert.ok(client.worker && client.worker !== first);
});
