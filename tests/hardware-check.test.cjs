const test = require('node:test'),
  assert = require('node:assert/strict'),
  { assess, check } = require('../hardware-check');
test('hardware estimates preserve unknown GPUs and do not promise fit below free RAM', async () => {
  const unit = 1073741824;
  assert.equal(assess({ totalBytes: 16 * unit, freeBytes: 3 * unit }, 4).ramFits, false);
  assert.throws(() => assess({ totalBytes: unit, freeBytes: unit }, NaN), /size/);
  const value = await check(4, {
    system: { totalmem: () => 16 * unit, freemem: () => 10 * unit, cpus: () => [{ model: 'Fixture' }] },
    run: async () => ({ stdout: 'Fixture GPU, 8192, 4096' }),
  });
  assert.equal(value.ramFits, true);
  assert.equal(value.gpuFits, false);
  assert.equal(value.gpus[0].freeGiB, 4);
  const missing = await check(4, {
    system: { totalmem: () => unit, freemem: () => unit, cpus: () => [] },
    run: async () => {
      throw Error('missing');
    },
  });
  assert.deepEqual(missing.gpus, []);
});
