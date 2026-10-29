const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function createProjectServices(
  directory,
  {
    approve,
    runner = require('./project-tools').runCheck,
    guard = require('./project-root').createProjectRootGuard(),
    fetcher = fetch,
  } = {},
) {
  const live = new Map();
  const file = path.join(directory, 'project-services.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let serial = Promise.resolve();
  const read = async () =>
    JSON.parse(
      await fs.readFile(file, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '[]';
        throw error;
      }),
    );
  const state = async () =>
    (await read()).map((row) => {
      const active = live.get(row.id);
      return {
        ...row,
        status: active?.status || 'stopped',
        output: active?.output || '',
        pid: active?.pid,
        ready: active?.ready || false,
        error: active?.error,
      };
    });
  async function action(request = {}) {
    if (!request.action || request.action === 'list') return state();
    if (request.action === 'save') {
      return (serial = serial
        .catch(() => {})
        .then(async () => {
          const rows = await read(),
            cwd = await guard.assertProject(request.cwd);
          if (
            !String(request.name || '').trim() ||
            !String(request.command || '').trim() ||
            request.command.length > 4000
          )
            throw Error('Enter a name and command under 4000 characters.');
          let url = '';
          if (request.url) {
            url = require('./live-preview').previewUrl(request.url).href;
          }
          const row = {
            id: rows.some((r) => r.id === request.id) ? request.id : randomUUID(),
            name: request.name.slice(0, 100),
            cwd,
            command: request.command,
            url,
          };
          if (live.get(row.id)?.status === 'running') throw Error('Stop this service before editing.');
          await store.save([...rows.filter((r) => r.id !== row.id), row].slice(-30));
          await store.flush();
          return row;
        }));
    }
    const row = (await read()).find((row) => row.id === request.id);
    if (!row) throw Error('Service not found.');
    const running = live.get(row.id);
    if (request.action === 'restart') {
      if (running?.status === 'running') {
        running.controller.abort();
        await running.done;
      }
      return action({ ...request, action: 'start' });
    }
    if (request.action === 'stop') {
      running?.controller.abort();
      return state();
    }
    if (request.action === 'remove') {
      if (running?.status === 'running') throw Error('Stop the service first.');
      await store.save((await read()).filter((r) => r.id !== row.id));
      await store.flush();
      return state();
    }
    if (request.action === 'probe') {
      if (!running || running.status !== 'running' || !row.url)
        throw Error('Start a service with a loopback readiness URL.');
      try {
        const response = await fetcher(row.url, { redirect: 'error', signal: AbortSignal.timeout(3000) });
        running.ready = response.ok;
        running.error = response.ok ? '' : 'HTTP ' + response.status;
        await response.body?.cancel();
      } catch (error) {
        running.ready = false;
        running.error = error.message;
      }
      return state();
    }
    if (request.action === 'start') {
      if (running?.status === 'running') throw Error('Service is already running.');
      await guard.assertProject(row.cwd);
      if (
        !(await approve(
          'Start project service?',
          row.cwd +
            '\n' +
            row.command +
            '\nReadiness URL: ' +
            (row.url || 'none') +
            '\nRuns with your account permissions. No service starts automatically.',
        ))
      )
        return { cancelled: true };
      const controller = new AbortController(),
        item = { status: 'running', controller, output: '', ready: false };
      live.set(row.id, item);
      item.done = runner(row.command, row.cwd, {
        signal: controller.signal,
        timeoutMs: 86400000,
        onStart: (p) => (item.pid = p.pid),
        onOutput: (text) => (item.output = (item.output + text).slice(-65536)),
      }).then(
        (result) => Object.assign(item, { status: result.status, error: result.error, exitCode: result.exitCode }),
        (error) => Object.assign(item, { status: 'failed', error: error.message }),
      );
      return state();
    }
    throw Error('Unknown service action.');
  }
  return {
    action,
    dispose: () => {
      for (const item of live.values()) item.controller.abort();
    },
    active: () => [...live.values()].some((r) => r.status === 'running'),
  };
}
module.exports = { createProjectServices };
