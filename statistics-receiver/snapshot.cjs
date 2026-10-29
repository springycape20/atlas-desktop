const fs = require('node:fs/promises'),
  path = require('node:path');
(async () => {
  const directory = path.join(__dirname, '../.statistics-demo'),
    token = (await fs.readFile(path.join(directory, 'admin-token'), 'utf8')).trim();
  const response = await fetch('http://127.0.0.1:43127/v1/admin/reports', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw Error('Export not authorised');
  const value = await response.json();
  if (value.schema !== 'atlas-statistics-batch/v1' || !Array.isArray(value.reports)) throw Error('Invalid snapshot');
  value.reports = value.reports.map(require('../statistics-schema').validate);
  const chunks = Math.max(1, Math.ceil(value.reports.length / 1000));
  for (let index = 0; index < chunks; index++) {
    const file = path.join(directory, chunks === 1 ? 'snapshot.json' : 'snapshot-' + (index + 1) + '.json');
    await fs.writeFile(
      file,
      JSON.stringify({ schema: value.schema, reports: value.reports.slice(index * 1000, (index + 1) * 1000) }, null, 2),
      { mode: 0o600 },
    );
  }
  console.log(
    'Saved ' +
      chunks +
      ' snapshot file(s) in .statistics-demo. Import the newly created snapshot files into ATLAS Insights; remove old exported copies separately.',
  );
})().catch(() => {
  console.error('Snapshot unavailable. Start the local receiver first; no report data was printed.');
  process.exitCode = 1;
});
