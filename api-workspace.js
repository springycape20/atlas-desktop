const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function createApiWorkspace(directory, { approve, fetcher = fetch } = {}) {
  const file = path.join(directory, 'api-requests.json'),
    store = require('./atomic-store').createAtomicStore(file);
  const list = async () =>
    JSON.parse(
      await fs.readFile(file, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '[]';
        throw error;
      }),
    );
  return {
    async action(request = {}) {
      if (!request.action || request.action === 'list') return list();
      if (request.action === 'save') {
        const rows = await list(),
          url = new URL(request.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw Error('Use an HTTP URL without embedded credentials.');
        const value = {
          id: request.id || randomUUID(),
          name: String(request.name || 'Request').slice(0, 100),
          method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method)
            ? request.method
            : 'GET',
          url: url.href,
          body: String(request.body || '').slice(0, 262144),
        };
        await store.save([...rows.filter((row) => row.id !== value.id), value].slice(-100));
        await store.flush();
        return value;
      }
      if (request.action === 'remove') {
        await store.save((await list()).filter((row) => row.id !== request.id));
        await store.flush();
        return list();
      }
      if (request.action === 'send') {
        const row = (await list()).find((row) => row.id === request.id);
        if (!row) throw Error('Save the request first.');
        let headers = {};
        try {
          headers = JSON.parse(request.headers || '{}');
        } catch {
          throw Error('Headers must be a JSON object.');
        }
        if (!headers || typeof headers !== 'object' || Array.isArray(headers) || JSON.stringify(headers).length > 16000)
          throw Error('Invalid headers.');
        if (
          !(await approve(
            'Send this HTTP request?',
            row.method +
              ' ' +
              row.url +
              '\n\n' +
              row.body.slice(0, 1000) +
              '\n\nRequest headers may contain credentials. Headers are used once and are not saved. Redirects are blocked.',
          ))
        )
          return { cancelled: true };
        const started = Date.now(),
          response = await fetcher(row.url, {
            method: row.method,
            headers,
            body: ['GET', 'HEAD'].includes(row.method) ? undefined : row.body,
            redirect: 'error',
            signal: AbortSignal.timeout(30000),
          });
        const reader = response.body?.getReader();
        let chunks = [],
          size = 0,
          limited = false;
        if (reader)
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (size + value.length > 1048576) {
              limited = true;
              await reader.cancel();
              break;
            }
            chunks.push(value);
            size += value.length;
          }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.concat(chunks).toString('utf8'),
          durationMs: Date.now() - started,
          limited,
        };
      }
      throw Error('Unknown API workspace action.');
    },
  };
}
module.exports = { createApiWorkspace };
