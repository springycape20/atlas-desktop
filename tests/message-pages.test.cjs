const test = require('node:test'),
  assert = require('node:assert/strict');
const { messagePage } = require('../chat-render');
test('language edits use UTF-16/CRLF positions and reject overlaps', () => {
  const { editText } = require('../language-edits');
  assert.equal(
    editText('😀x\r\ny', [
      { range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } }, newText: 'ok' },
    ]),
    '😀ok\r\ny',
  );
  const edit = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: 'z' };
  assert.throws(() => editText('abc', [edit, edit]), /Overlapping/);
});
test('long message pages cover complete history once and search messages outside the current page', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({ content: i === 2 ? 'ancient needle' : 'message ' + i }));
  const first = messagePage(rows);
  assert.equal(first.indices.length, 150);
  assert.equal(first.indices.at(-1), 9999);
  const seen = new Set();
  for (let p = 0; p < first.pages; p++)
    for (const index of messagePage(rows, '', p).indices) {
      assert(!seen.has(index));
      seen.add(index);
    }
  assert.equal(seen.size, 10000);
  assert.deepEqual(messagePage(rows, 'ancient needle').indices, [2]);
  assert.equal(messagePage(rows, 'missing').total, 0);
  assert.equal(messagePage(rows, '', 999).page, first.pages - 1);
});
