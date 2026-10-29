const { structuredPatch, applyPatch } = require('diff');
function selectHunks(before, after, selected) {
  if (typeof before !== 'string' || typeof after !== 'string' || before.length > 524288 || after.length > 524288)
    throw Error('Select a bounded text diff.');
  const patch = structuredPatch('file', 'file', before, after, '', '', { context: 3 });
  if (
    !Array.isArray(selected) ||
    selected.some((index) => !Number.isInteger(index) || index < 0 || index >= patch.hunks.length)
  )
    throw Error('Invalid hunk selection.');
  const wanted = new Set(selected),
    content = applyPatch(before, { ...patch, hunks: patch.hunks.filter((_, index) => wanted.has(index)) });
  if (content === false) throw Error('The selected patch could not be applied.');
  return { content, hunks: patch.hunks.map((hunk, index) => ({ index, ...hunk })), selected: [...wanted] };
}
module.exports = { selectHunks };
