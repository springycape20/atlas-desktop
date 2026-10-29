const { spawn } = require('node:child_process'),
  { randomUUID } = require('node:crypto');
function runShell(cwd, { signal, onStart, onOutput, onBusy, spawnProcess = spawn, timeoutMs = 3600000 } = {}) {
  const marker = 'ATLAS_DONE_' + randomUUID().replaceAll('-', '');
  return new Promise((resolve) => {
    const child = spawnProcess(
      process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
      process.platform === 'win32' ? ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'] : [],
      { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
    );
    let pending = '',
      settled = false;
    const output = (part) => {
      pending += part.toString();
      let index;
      while ((index = pending.indexOf(marker)) >= 0) {
        onOutput(pending.slice(0, index));
        pending = pending.slice(index + marker.length).replace(/^\r?\n/, '');
        onBusy(false);
      }
      const keep = marker.length - 1;
      if (pending.length > keep) {
        onOutput(pending.slice(0, -keep));
        pending = pending.slice(-keep);
      }
    };
    const finish = (status, exitCode, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      if (pending) onOutput(pending);
      resolve({ status, exitCode, error });
    };
    const stop = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawnProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill();
        }
      }
    };
    const timer = setTimeout(stop, timeoutMs);
    timer.unref();
    child.stdout.on('data', output);
    child.stderr.on('data', (part) => onOutput(part.toString()));
    child.stdin.on('error', () => {});
    child.once('error', (error) => finish('failed', null, error.message));
    child.once('close', (code) => finish(signal?.aborted ? 'cancelled' : code === 0 ? 'passed' : 'failed', code));
    onStart({
      pid: child.pid,
      write: (text) => {
        onBusy(true);
        if (process.platform === 'win32') {
          const encoded = Buffer.from(text, 'utf8').toString('base64');
          child.stdin.write(
            "try { . ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
              encoded +
              "')))) } catch { Write-Output $_ } finally { Write-Output '" +
              marker +
              "' }\n",
          );
        } else {
          child.stdin.write(text + "\nprintf '\\n" + marker + "\\n'\n");
        }
      },
    });
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
  });
}
module.exports = { runShell };
