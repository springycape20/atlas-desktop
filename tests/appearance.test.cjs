const test = require('node:test');
const assert = require('node:assert/strict');
const { clean, defaults } = require('../appearance');
const { mainHarness } = require('./fixtures/main-harness.cjs');

test('appearance preferences are bounded and keep readable defaults for legacy or invalid settings', () => {
  assert.deepEqual(clean(undefined), defaults);
  assert.deepEqual(clean({ uiTheme: '<script>', uiTextScale: Infinity, uiDensity: 'tiny' }), defaults);
  for (const uiTheme of ['dark', 'light', 'contrast']) assert.equal(clean({ uiTheme }).uiTheme, uiTheme);
  assert.equal(clean({ uiTextScale: 1.3 }).uiTextScale, 1.3);
  assert.equal(clean({ uiMotion: 'reduced' }).uiMotion, 'reduced');
});

test('appearance preferences survive the real settings save and read boundary', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const save = h.handlers.get('atlas:save-settings');
  const get = h.handlers.get('atlas:get-settings');
  assert.deepEqual(clean(await get(event)), defaults);
  await save(event, { uiTheme: 'contrast', uiTextScale: 1.3, uiDensity: 'compact' });
  assert.deepEqual(clean(await get(event)), {
    uiTheme: 'contrast',
    uiTextScale: 1.3,
    uiDensity: 'compact',
    uiMotion: 'system',
  });
  await save(event, { uiTheme: 'invalid', uiTextScale: 0.01 });
  assert.deepEqual(clean(await get(event)), defaults);
});
