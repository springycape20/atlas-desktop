const http = require('node:http'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  { createHash, timingSafeEqual } = require('node:crypto');
const { validate } = require('../statistics-schema'),
  { periods } = require('../statistics-report');
const secret = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value) =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
function createReceiver({ directory, adminToken, now = Date.now }) {
  if (!secret(adminToken)) throw Error('A random 32-byte admin token is required.');
  const file = path.join(directory, 'receiver.json'),
    store = require('../atomic-store').createAtomicStore(file);
  let serial = Promise.resolve(),
    budget = 60,
    windowAt = now();
  const read = async () => {
    let value;
    try {
      value = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error('Receiver storage unavailable');
      value = { reports: [], deleted: [] };
    }
    if (
      !Array.isArray(value.reports) ||
      !Array.isArray(value.deleted) ||
      value.reports.length > 5000 ||
      value.deleted.length > 5000
    )
      throw Error('Invalid receiver storage');
    const allowed = periods(now());
    return {
      reports: value.reports.filter((row) => allowed.includes(row.report.period)),
      deleted: value.deleted.filter((row) => allowed.includes(row.period)),
    };
  };
  const save = async (value) => {
    await store.save(value);
    await store.flush();
  };
  const reply = (res, code, value) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(value ? JSON.stringify(value) : '');
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.origin || !['/v1/reports', '/v1/admin/reports'].includes(req.url)) return reply(res, 404);
      if (req.method === 'GET' && req.url === '/v1/admin/reports') {
        if (!same(req.headers.authorization, 'Bearer ' + adminToken)) return reply(res, 401);
        const run = serial.then(async () => {
          const data = await read();
          await save(data);
          reply(res, 200, {
            schema: 'atlas-statistics-batch/v1',
            reports: data.reports.map((row) => validate(row.report)),
          });
        });
        serial = run.catch(() => {});
        await run;
        return;
      }
      if (req.url !== '/v1/reports' || !['POST', 'DELETE'].includes(req.method)) return reply(res, 405);
      if (now() - windowAt >= 60000) {
        windowAt = now();
        budget = 60;
      }
      if (--budget < 0) return reply(res, 429);
      if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) return reply(res, 415);
      if (Number(req.headers['content-length']) > 8192) return reply(res, 413);
      let bytes = 0;
      const parts = [];
      for await (const part of req) {
        bytes += part.length;
        if (bytes > 8192) {
          reply(res, 413);
          req.destroy();
          return;
        }
        parts.push(part);
      }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
      const expected = req.method === 'POST' ? 'deleteToken|report' : 'deleteToken|reportId';
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).sort().join('|') !== expected ||
        !secret(body.deleteToken)
      )
        return reply(res, 400);
      const report = req.method === 'POST' ? validate(body.report) : null,
        id = report?.reportId || body.reportId;
      if (!uuid(id)) return reply(res, 400);
      const run = serial.then(async () => {
        const data = await read(),
          digest = hash(body.deleteToken);
        if (report) {
          if (!periods(now()).includes(report.period)) return reply(res, 400);
          if (data.deleted.some((row) => row.reportId === id)) return reply(res, 410);
          const existing = data.reports.find((row) => row.report.reportId === id);
          if (existing)
            return same(existing.deleteHash, digest) && JSON.stringify(existing.report) === JSON.stringify(report)
              ? reply(res, 200, { accepted: true })
              : reply(res, 409);
          if (data.reports.length >= 5000) return reply(res, 503);
          data.reports.push({ report, deleteHash: digest });
          await save(data);
          return reply(res, 201, { accepted: true });
        }
        const existing = data.reports.find((row) => row.report.reportId === id),
          removed = data.deleted.find((row) => row.reportId === id);
        if ((existing && !same(existing.deleteHash, digest)) || (removed && !same(removed.deleteHash, digest)))
          return reply(res, 403);
        if (!removed) {
          if (data.deleted.length >= 5000) return reply(res, 503);
          data.deleted.push({ reportId: id, deleteHash: digest, period: existing?.report.period || periods(now())[0] });
        }
        data.reports = data.reports.filter((row) => row.report.reportId !== id);
        await save(data);
        return reply(res, 204);
      });
      serial = run.catch(() => {});
      await run;
    } catch {
      if (!res.headersSent) reply(res, 400);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  return server;
}
module.exports = { createReceiver };
