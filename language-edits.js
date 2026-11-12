(function (root) {
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
  function offsetAt(text, point) {
    const lines = text.split('\n');
    if (
      !point ||
      !Number.isInteger(point.line) ||
      !Number.isInteger(point.character) ||
      point.line < 0 ||
      point.line >= lines.length ||
      point.character < 0 ||
      point.character > lines[point.line].replace(/\r$/, '').length
    )
      throw Error('Invalid completion range.');
    return lines.slice(0, point.line).reduce((n, line) => n + line.length + 1, 0) + point.character;
  }
  function snippet(value) {
    let text = '',
      stops = [];
    for (let i = 0; i < value.length;) {
      if (value[i] === '\\' && /[\\$},]/.test(value[i + 1] || '')) {
        text += value[i + 1];
        i += 2;
        continue;
      }
      if (value[i] !== '$') {
        text += value[i++];
        continue;
      }
      const simple = value.slice(i).match(/^\$(\d+)/),
        braced = value.slice(i).match(/^\$\{(\d+)(?::([^{}]*)|\|([^{}]*)\|)?\}/);
      const match = simple || braced;
      if (!match) {
        if (/[A-Za-z_{]/.test(value[i + 1] || '')) throw Error('Unsupported snippet variable or transformation.');
        text += value[i++];
        continue;
      }
      const replacement = simple
        ? ''
        : (braced[2] ?? braced[3]?.match(/^(?:\\.|[^,])*/)[0] ?? '').replace(/\\([\\$},])/g, '$1');
      stops.push({ index: Number(match[1]), start: text.length, end: text.length + replacement.length });
      text += replacement;
      i += match[0].length;
    }
    stops.sort((a, b) => (a.index || Infinity) - (b.index || Infinity));
    return { text, selection: stops[0] ? [stops[0].start, stops[0].end] : [text.length, text.length] };
  }
  function completionChange(text, cursor, item) {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length || item.command)
      throw Error('Invalid completion.');
    const position = (offset) => {
      const lines = text.slice(0, offset).split('\n');
      return { line: lines.length - 1, character: lines.at(-1).length };
    };
    const word = text.slice(0, cursor).match(/[\w$]*$/)[0];
    const range = item.textEdit?.range ||
      item.textEdit?.replace || { start: position(cursor - word.length), end: position(cursor) };
    const start = offsetAt(text, range.start),
      end = offsetAt(text, range.end);
    if (start > cursor || end < cursor) throw Error('Completion does not cover the requested cursor.');
    const raw = item.textEdit?.newText ?? item.insertText ?? item.text ?? item.label;
    if (typeof raw !== 'string' || raw.length > 10000) throw Error('Completion text exceeds limits.');
    const expanded = item.insertTextFormat === 2 ? snippet(raw) : { text: raw, selection: [raw.length, raw.length] };
    const extras = item.additionalTextEdits || [];
    if (!Array.isArray(extras) || extras.length > 100) throw Error('Too many completion edits.');
    let shift = 0;
    for (const edit of extras)
      if (offsetAt(text, edit.range.end) <= start)
        shift += edit.newText.length - (offsetAt(text, edit.range.end) - offsetAt(text, edit.range.start));
    const next = editText(text, [...extras, { range, newText: expanded.text }]);
    if (new TextEncoder().encode(next).length > 262144 || next.includes('\0'))
      throw Error('Completion exceeds editor text limits.');
    return { text: next, selection: expanded.selection.map((n) => n + start + shift) };
  }
  const api = { editText, completionChange, snippet, offsetAt };
  if (typeof module === 'object') module.exports = api;
  else root.atlasLanguageEdits = api;
})(globalThis);
