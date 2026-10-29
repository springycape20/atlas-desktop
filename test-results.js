function parseTestResults(text) {
  text = String(text || '');
  const limited = text.length > 524288;
  text = text.slice(0, 524288);
  const tests = [];
  if (/<testcase\b/.test(text))
    for (const match of text.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const attr = (name) => match[1].match(new RegExp('\\b' + name + '=["\']([^"\']*)["\']'))?.[1] || '';
      const body = match[2] || '';
      tests.push({
        name: attr('name'),
        suite: attr('classname'),
        status: /<(failure|error)\b/.test(body) ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : 'passed',
        durationMs: Number(attr('time') || 0) * 1000,
        detail: body.replace(/<[^>]*>/g, '').slice(0, 4000),
        file: attr('file'),
        line: Number(attr('line')) || undefined,
      });
    }
  else
    for (const line of text.split(/\r?\n/)) {
      let match = line.match(/^\s*(not ok|ok)\s+\d+\s*(?:-\s*)?(.*)$/);
      if (match)
        tests.push({
          name: match[2].replace(/\s+#.*$/, ''),
          status: /#\s*(SKIP|TODO)/i.test(match[2]) ? 'skipped' : match[1] === 'ok' ? 'passed' : 'failed',
        });
      else if ((match = line.match(/^([^\s]+\.py::[^\s]+)\s+(PASSED|FAILED|SKIPPED|ERROR)\b/)))
        tests.push({
          name: match[1],
          status: match[2] === 'PASSED' ? 'passed' : match[2] === 'SKIPPED' ? 'skipped' : 'failed',
          file: match[1].split('::')[0],
        });
    }
  return {
    format: /<testcase\b/.test(text) ? 'JUnit' : tests.length ? 'TAP / pytest' : 'unrecognised',
    tests: tests.slice(0, 1000),
    limited: limited || tests.length > 1000,
    summary: {
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status === 'failed').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
    },
  };
}
module.exports = { parseTestResults };
