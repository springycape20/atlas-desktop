const test = require('node:test'),
  assert = require('node:assert/strict');
const { cleanSteps, stepScript, comparePixels, profileDelta } = require('../preview-evidence');
test('browser recipes accept only bounded declarative actions', () => {
  assert.deepEqual(
    cleanSteps([
      { action: 'wait', ms: 100 },
      { action: 'fill', selector: '#name', value: 'fixture' },
    ]),
    [
      { action: 'wait', ms: 100 },
      { action: 'fill', selector: '#name', value: 'fixture' },
    ],
  );
  for (const rows of [
    [],
    [{ action: 'eval', value: 'alert(1)' }],
    [{ action: 'wait', ms: 6000 }],
    [{ action: 'fill', selector: '#x' }],
    Array(31).fill({ action: 'wait', ms: 0 }),
  ])
    assert.throws(() => cleanSteps(rows));
  assert(stepScript({ action: 'fill', selector: '#x', value: '"; throw Error("bad")' }).includes('const step='));
});
test('pixel comparison reports changed region and rejects incompatible dimensions', () => {
  const image = (pixels, width = 2) => ({ getSize: () => ({ width, height: 1 }), toBitmap: () => Buffer.from(pixels) });
  const before = image([0, 0, 0, 255, 0, 0, 0, 255]),
    after = image([0, 0, 0, 255, 0, 80, 0, 255]);
  assert.equal(comparePixels(before, after).changedPercent, 50);
  assert.deepEqual(comparePixels(before, after).bounds, { x: 1, y: 0, width: 1, height: 1 });
  assert.equal(comparePixels(before, before).changedPixels, 0);
  assert.throws(() => comparePixels(before, image([0, 0, 0, 255], 1)), /dimensions/);
});
test('profile deltas compare the same URL and viewport and retain missing values', () => {
  const before = { url: 'http://127.0.0.1/', width: 768, height: 720, loadMs: 100, domNodes: 20, jsHeapMB: null };
  assert.equal(profileDelta(before, { ...before, width: 390 }), null);
  assert.deepEqual(profileDelta(before, { ...before, loadMs: 80, domNodes: 22 }), {
    domNodes: 2,
    jsHeapMB: null,
    loadMs: -20,
    domReadyMs: null,
  });
});
