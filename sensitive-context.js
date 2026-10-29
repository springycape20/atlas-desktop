const { createHash } = require('node:crypto');
function inspectSensitive(text) {
  const findings = [];
  const patterns = [
    ['Private key', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g],
    ['API key', /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,})\b/g],
    ['Credential assignment', /\b(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^\s"']{8,}/gi],
    ['Email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ];
  for (const [kind, regex] of patterns)
    for (const match of String(text).matchAll(regex)) {
      if (findings.length >= 100) break;
      findings.push({
        kind,
        line: String(text).slice(0, match.index).split('\n').length,
        preview: match[0].slice(0, 3) + '…',
        fingerprint: createHash('sha256').update(match[0]).digest('hex'),
      });
    }
  return { findings, note: 'Heuristic review only; absence of findings does not prove content is safe.' };
}
module.exports = { inspectSensitive };
