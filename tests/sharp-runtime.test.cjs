const test = require('node:test'),
  assert = require('node:assert/strict');

// @huggingface/transformers loads sharp as soon as local speech starts, so a broken
// native binary would stop speech even though speech never processes images.
test('the overridden sharp runtime loads and processes images', async () => {
  const sharp = require('sharp'),
    manifest = require('node:path').join(require.resolve('sharp'), '..', '..', 'package.json'),
    { version } = JSON.parse(require('node:fs').readFileSync(manifest, 'utf8'));
  assert.equal(version, require('../package.json').overrides.sharp);
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#336699' } })
    .png()
    .toBuffer();
  const metadata = await sharp(png).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ['png', 4, 3]);
});
