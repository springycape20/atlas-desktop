function editText(text, edits) {
  if (!Array.isArray(edits) || edits.length > 1000) throw Error('Rename has too many edits.');
  const lines = text.split('\n'),
    offsets = [];
  let count = 0;
  for (const line of lines) {
    offsets.push(count);
    count += line.length + 1;
  }
  const offset = (point) => {
    if (
      !point ||
      !Number.isInteger(point.line) ||
      !Number.isInteger(point.character) ||
      point.line < 0 ||
      point.line >= lines.length ||
      point.character < 0 ||
      point.character > lines[point.line].replace(/\r$/, '').length
    )
      throw Error('Invalid rename range.');
    return offsets[point.line] + point.character;
  };
  const rows = edits
    .map((edit) => {
      if (typeof edit.newText !== 'string' || edit.newText.length > 10000) throw Error('Invalid rename text.');
      const start = offset(edit.range?.start),
        end = offset(edit.range?.end);
      if (start > end) throw Error('Invalid rename range.');
      return { start, end, text: edit.newText };
    })
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let boundary = text.length + 1;
  for (const row of rows) {
    if (row.end > boundary || row.start === boundary) throw Error('Overlapping rename edits.');
    boundary = row.start;
    text = text.slice(0, row.start) + row.text + text.slice(row.end);
  }
  return text;
}
module.exports = { editText };
