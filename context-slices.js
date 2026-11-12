const { maskSource } = require('./code-intelligence');
function queryWords(value) {
  return [
    ...new Set(
      String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .match(/[a-z0-9]{3,}/g) || [],
    ),
  ].slice(0, 40);
}
function changedRange(before, after) {
  let start = 0,
    end = after.length - 1,
    previous = before.length - 1;
  while (start <= end && start <= previous && before[start] === after[start]) start++;
  while (end >= start && previous >= start && before[previous] === after[end]) {
    end--;
    previous--;
  }
  return start > end ? null : { start, end };
}
function focusedSlice(lines, match, name) {
  match = Math.max(0, match);
  const masked = maskSource(lines.join('\n')).split('\n');
  let chosen;
  for (let start = Math.max(0, match - 120); start <= match; start++) {
    const line = masked[start];
    if (!/(?:\b(?:function|class|def|fn)\s+[\w$]+|\b(?:const|let)\s+[\w$]+\s*=.*(?:=>|function))/.test(line)) continue;
    let end = start;
    if (/\.py$/i.test(name) && /\b(?:def|class)\s/.test(line)) {
      const indent = line.match(/^\s*/)[0].length;
      while (
        end + 1 < lines.length &&
        end - start < 120 &&
        (!lines[end + 1].trim() || lines[end + 1].match(/^\s*/)[0].length > indent)
      )
        end++;
    } else {
      let depth = 0,
        opened = false;
      for (; end < Math.min(lines.length, start + 120); end++) {
        for (const char of masked[end]) {
          if (char === '{') {
            depth++;
            opened = true;
          } else if (char === '}') depth--;
        }
        if (opened && depth === 0) break;
      }
      if (!opened || depth !== 0) continue;
    }
    if (end >= match && (!chosen || end - start < chosen.end - chosen.start)) chosen = { start, end };
  }
  const start = chosen ? Math.max(0, chosen.start - 2) : Math.max(0, match - 2),
    end = chosen ? chosen.end + 1 : Math.min(lines.length, start + 9);
  return {
    line: start + 1,
    excerpt: lines
      .slice(start, end)
      .map((line) => line.slice(0, 500))
      .join('\n')
      .slice(0, 6000),
    reason: chosen ? 'Matching function or class (bounded lexical slice)' : 'Matching lines (bounded excerpt)',
  };
}
module.exports = { queryWords, changedRange, focusedSlice };
