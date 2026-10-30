function focusOutput(value, limit = 2800) {
  limit = Math.max(0, Math.floor(limit));
  const text = String(value || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  if (text.length <= limit) return text;
  const lines = text.split(/\r?\n/),
    selected = new Set();
  for (let i = 0; i < lines.length && selected.size < 80; i++)
    if (/\b(?:error|fail(?:ed|ure)?|exception|traceback|assertion|panic|fatal)\b|^not ok\b/i.test(lines[i]))
      for (let n = Math.max(0, i - 1); n <= Math.min(lines.length - 1, i + 3); n++) selected.add(n);
  const chosen = [...selected]
    .sort((a, b) => a - b)
    .map((i) => lines[i].slice(0, 500))
    .join('\n');
  const body = chosen || text.slice(0, 500) + '\n[…]\n' + text.slice(-Math.max(200, limit - 600));
  const marker = '[Focused excerpt; other output omitted.]\n';
  return (marker + body.slice(0, Math.max(0, limit - marker.length))).slice(0, limit);
}
function checkEvidence(results = [], { limit = 9000, includePassed = false } = {}) {
  limit = Math.max(0, Math.floor(limit));
  const rows = results.slice(0, 24),
    headers = rows.map(
      (row) =>
        String(row.command || 'Check').slice(0, 160) +
        ' · ' +
        row.status +
        ' · exit ' +
        (row.exitCode ?? 'unavailable'),
    );
  const summary =
    headers
      .map(
        (header, index) =>
          header +
          (rows[index].logFile
            ? '\nLocal check log: ' +
              String(rows[index].logFile).slice(0, 320) +
              (rows[index].logLimited ? ' (size capped)' : '')
            : ''),
      )
      .join('\n') + (results.length > 24 ? '\nAdditional checks omitted; inspect the saved report.' : '');
  let remaining = Math.max(0, limit - summary.length - 2);
  const details = rows
    .map((row, index) => {
      const failures = (row.testResults?.tests || [])
        .filter((test) => test.status === 'failed')
        .slice(0, 12)
        .map(
          (test) =>
            test.name +
            (test.file ? ' · ' + test.file + (test.line ? ':' + test.line : '') : '') +
            '\n' +
            String(test.detail || '').slice(0, 500),
        )
        .join('\n');
      const allowance = Math.max(0, remaining - headers[index].length - 3);
      const source = failures
        ? failures + '\n\n' + focusOutput(row.output || row.error, 1800)
        : row.output || row.error;
      const detail = row.status === 'passed' && !includePassed ? '' : focusOutput(source, Math.min(2800, allowance));
      const block = detail ? headers[index] + '\n' + detail : '';
      remaining = Math.max(0, remaining - block.length - 2);
      return block;
    })
    .filter(Boolean)
    .join('\n\n');
  return (summary + (details ? '\n\n' + details : '')).slice(0, limit);
}
module.exports = { focusOutput, checkEvidence };
