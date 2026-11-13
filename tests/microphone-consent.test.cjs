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
  assert.equal(settings.speakResponses, false);
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

test('spoken replies require an explicit boolean opt-in and unrelated settings never enable voice', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const get = () => h.handlers.get('atlas:get-settings')(event);
  const save = (value) => h.handlers.get('atlas:save-settings')(event, value);
  await save({ speechDetail: 'full' });
  let value = await get();
  assert.equal(value.speakResponses, false);
  assert.equal(value.wakeWordEnabled, false);
  assert.equal(value.autoListenReplies, false);
  await save({ ...value, speakResponses: 'true' });
  assert.equal((await get()).speakResponses, false);
  await save({ ...value, speakResponses: true });
  value = await get();
  assert.equal(value.speakResponses, true);
  assert.equal(value.wakeWordEnabled, false);
  assert.equal(value.autoListenReplies, false);
  await save({ ...value, speakResponses: false });
  assert.equal((await get()).speakResponses, false);
});
