const { randomUUID } = require('node:crypto');
function createProjectTerminal({
  approve,
  runner = require('./project-tools').runCheck,
  guard = require('./project-root').createProjectRootGuard(),
  busy = () => false,
  shellRunner = require('./shell-session').runShell,
}) {
  const sessions = new Map();
  let starting = false;
  const snapshot = (row) => ({
    id: row.id,
    cwd: row.cwd,
    command: row.command,
    status: row.status,
    pid: row.pid,
    output: row.output,
    exitCode: row.exitCode,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    error: row.error,
    shell: row.shell,
    pty: row.pty,
    sequence: row.sequence || 0,
    bufferStart: (row.sequence || 0) - row.output.length,
    executing: row.executing,
  });
  async function action(request = {}) {
    if (!request.action || request.action === 'list') return [...sessions.values()].map(snapshot);
    const row = sessions.get(request.id);
    if (request.action === 'start') {
      if (starting || [...sessions.values()].filter((row) => row.status === 'running').length >= 6)
        throw Error('Up to six terminal sessions can run at once.');
      if (busy()) throw Error('Finish active ATLAS tasks before starting a terminal command.');
      const command =
        request.shell === true
          ? process.platform === 'win32'
            ? 'PowerShell'
            : 'Shell'
          : typeof request.command === 'string'
            ? request.command.trim()
            : '';
      if (!command || command.length > 4000 || command.includes('\0'))
        throw Error('Enter a command under 4000 characters.');
      starting = true;
      try {
        const cwd = await guard.assertProject(request.cwd),
          seconds = Number(request.timeoutSeconds || 300);
        if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600)
          throw Error('Choose a time limit from 10 to 3600 seconds.');
        if (!(await approve({ cwd, command, timeoutSeconds: seconds, pty: request.pty === true })))
          return { cancelled: true };
        if (busy()) throw Error('An ATLAS task started while approval was open.');
        const controller = new AbortController(),
          row = {
            id: randomUUID(),
            cwd,
            command,
            status: 'running',
            output: '',
            startedAt: Date.now(),
            exitCode: null,
            controller,
            shell: request.shell === true,
            pty: request.pty === true,
            sequence: 0,
            executing: false,
          };
        sessions.set(row.id, row);
        while (sessions.size > 20) {
          const old = [...sessions.values()].find((item) => item.status !== 'running');
          if (!old) break;
          sessions.delete(old.id);
        }
        row.done = Promise.resolve()
          .then(() =>
            (row.pty
              ? (_command, root, options) => require('./pty-session').runPty(root, options)
              : row.shell
                ? (_command, root, options) => shellRunner(root, options)
                : runner)(command, cwd, {
              signal: controller.signal,
              timeoutMs: seconds * 1000,
              interactive: true,
              onStart: (process) => {
                row.pid = process.pid;
                row.write = process.write;
                row.resize = process.resize;
              },
              onBusy: (value) => {
                row.executing = value;
              },
              onOutput: (text) => {
                const value = row.pty ? text : text.replace(/\x1b\[[0-9;]*m/g, '');
                row.sequence += value.length;
                row.output = (row.output + value).slice(-65536);
              },
            }),
          )
          .then(
            (result) => {
              Object.assign(row, {
                status: result.status,
                exitCode: result.exitCode,
                error: result.error,
                endedAt: Date.now(),
              });
            },
            (error) => {
              row.status = 'failed';
              row.error = error.message;
              row.endedAt = Date.now();
            },
          );
        return snapshot(row);
      } finally {
        starting = false;
      }
    }
    if (!row) throw Error('Terminal session is no longer available.');
    if (request.action === 'resize') {
      if (!row.pty || !row.resize) throw Error('This session does not support PTY sizing.');
      const cols = Number(request.cols),
        rows = Number(request.rows);
      if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || cols > 400 || rows < 3 || rows > 200)
        throw Error('Invalid terminal dimensions.');
      row.resize(cols, rows);
      return { resized: true };
    }
    if (request.action === 'stop') {
      row.controller.abort();
      return snapshot(row);
    }
    if (request.action === 'close') {
      row.controller.abort();
      await row.done;
      sessions.delete(row.id);
      return { removed: true };
    }
    if (request.action === 'input') {
      if (row.status !== 'running' || !row.write) throw Error('This command is not accepting input.');
      if (typeof request.text !== 'string' || request.text.length > 4000 || request.text.includes('\0'))
        throw Error('Input is limited to 4000 characters.');
      // Input may contain commands when the launched process is a shell, so it needs its own approval.
      if (row.pty) {
        if (busy()) throw Error('Finish active AI work before typing into this terminal.');
        if (row.status === 'running') row.write(request.text);
        return snapshot(row);
      }
      if (row.shell && row.executing) throw Error('Wait for the current command, or stop this session.');
      if (busy()) throw Error('Finish active ATLAS tasks before sending terminal input.');
      if (await approve({ cwd: row.cwd, command: row.command, input: request.text })) {
        if (busy() || (row.shell && row.executing))
          throw Error('Another command or task started while approval was open.');
        if (row.status === 'running') row.write(request.text + '\n');
      }
      return snapshot(row);
    }
    if (request.action === 'remove') {
      if (row.status === 'running') throw Error('Stop the command before removing it.');
      sessions.delete(row.id);
      return { removed: true };
    }
    throw Error('Unknown terminal action.');
  }
  return {
    action,
    active: () =>
      [...sessions.values()].some((row) => row.status === 'running' && (!row.shell || row.executing)) || starting,
    dispose: () => {
      for (const row of sessions.values()) row.controller.abort();
    },
  };
}
module.exports = { createProjectTerminal };
