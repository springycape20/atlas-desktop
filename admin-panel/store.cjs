const fs = require('node:fs/promises'),
  path = require('node:path');
const { validate, aggregate } = require('../statistics-schema');
const { periods } = require('../statistics-report');
function createReportStore(directory, { now = Date.now } = {}) {
  const file = path.join(directory, 'reports.json'),
    store = require('../atomic-store').createAtomicStore(file);
  let serial = Promise.resolve();
  const save = async (rows) => {
    await store.save({ schema: 1, reports: rows });
    await store.flush();
  };
  async function read() {
    let data;
    try {
      data = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw Error('Cannot read the local report store. Preserve it before attempting recovery.');
    }
    if (
      data?.schema !== 1 ||
      !Array.isArray(data.reports) ||
      data.reports.length > 5000 ||
      Object.keys(data).sort().join('|') !== 'reports|schema'
    )
      throw Error('Invalid local report store.');
    const rows = data.reports.map(validate),
      allowed = periods(now()),
      kept = rows.filter((row) => allowed.includes(row.period));
    if (rows.length !== kept.length) await save(kept);
    return kept;
  }
  async function action(request) {
    const rows = await read();
    if (request.action === 'list') return rows;
    if (request.action === 'clear') {
      await save([]);
      return { removed: rows.length };
    }
    if (request.action === 'remove') {
      const kept = rows.filter((row) => row.reportId !== request.id);
      await save(kept);
      return { removed: rows.length - kept.length };
    }
    if (request.action === 'summary') return aggregate(rows);
    if (request.action !== 'import') throw Error('Unknown report-store action.');
    if (!Array.isArray(request.paths) || request.paths.length > 100)
      throw Error('Import up to 100 report files at a time.');
    const result = { accepted: 0, duplicates: 0, rejected: 0, expired: 0, capacity: 0 };
    let totalBytes = 0;
    const ids = new Map(rows.map((row) => [row.reportId, JSON.stringify(row)])),
      allowed = periods(now());
    for (const location of request.paths) {
      let handle;
      try {
        handle = await fs.open(location, 'r');
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('Invalid file size.');
        totalBytes += stat.size;
        if (totalBytes > 10 * 1024 * 1024) throw Error('Import byte budget exceeded.');
        const bytes = Buffer.alloc(Math.min(stat.size, 1024 * 1024) + 1),
          { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 1024 * 1024) throw Error('Report exceeds limit.');
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)));
        let incoming;
        if (value?.schema === 'atlas-statistics-batch/v1') {
          if (
            Object.keys(value).sort().join('|') !== 'reports|schema' ||
            !Array.isArray(value.reports) ||
            value.reports.length > 1000
          )
            throw Error('Invalid snapshot.');
          incoming = value.reports.map(validate);
        } else {
          if (bytesRead > 8192) throw Error('Individual report exceeds limit.');
          incoming = [validate(value)];
        }
        for (const report of incoming) {
          if (!allowed.includes(report.period)) {
            result.expired++;
            continue;
          }
          const canonical = JSON.stringify(report);
          if (ids.has(report.reportId)) {
            if (ids.get(report.reportId) !== canonical) throw Error('Conflicting receipt.');
            result.duplicates++;
            continue;
          }
          if (rows.length >= 5000) {
            result.capacity++;
            continue;
          }
          rows.push(report);
          ids.set(report.reportId, canonical);
          result.accepted++;
        }
      } catch {
        result.rejected++;
      } finally {
        if (handle) await handle.close();
      }
    }
    await save(rows);
    return result;
  }
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createReportStore };
