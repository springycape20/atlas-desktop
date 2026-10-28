const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
test('removed Kokoro settings migrate to Windows speech without losing other settings', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  await fs.mkdir(h.paths.userData, { recursive: true });
  await fs.writeFile(
    path.join(h.paths.userData, 'settings.json'),
    JSON.stringify({
      voiceEngine: 'kokoro',
      kokoroVoice: 'bm_george',
      codexModel: 'saved-model',
      speakResponses: false,
    }),
  );
  const settings = await h.handlers.get('atlas:get-settings')({
    sender: h.sender,
    senderFrame: { url: 'atlas://app/' },
  });
  assert.equal(settings.voiceEngine, 'windows');
  assert.equal(settings.codexModel, 'saved-model');
  assert.equal(settings.speakResponses, false);
  assert.equal('kokoroVoice' in settings, false);
  assert.equal(h.handlers.has('atlas:kokoro-speak'), false);
});
