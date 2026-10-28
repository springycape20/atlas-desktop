const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');

test('continuous microphone use defaults off and legacy defaults require renewed consent', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const get = () => h.handlers.get('atlas:get-settings')(event);
  let settings = await get();
  assert.equal(settings.wakeWordEnabled, false);
  assert.equal(settings.autoListenReplies, false);
  await fs.mkdir(h.paths.userData, { recursive: true });
  const file = path.join(h.paths.userData, 'settings.json');
  await fs.writeFile(file, JSON.stringify({ wakeWordEnabled: true, autoListenReplies: true }));
  settings = await get();
  assert.equal(settings.wakeWordEnabled, false);
  assert.equal(settings.autoListenReplies, false);
  await h.handlers.get('atlas:save-settings')(event, { ...settings, wakeWordEnabled: true, autoListenReplies: true });
  settings = await get();
  assert.equal(settings.wakeWordEnabled, true);
  assert.equal(settings.autoListenReplies, true);
  assert.equal(settings.microphoneConsentVersion, 1);
});
