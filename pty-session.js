const { randomUUID } = require('node:crypto');
function runPty(
  cwd,
  { signal, onStart, onOutput, onBusy, timeoutMs = 3600000, spawnProcess = require('node-pty').spawn } = {},
) {
  return new Promise((resolve) => {
    // A zero-width terminal title sequence marks prompt readiness without changing
    // the console cursor coordinates used by PSReadLine to redraw typed input.
    const marker = 'ATLAS_PROMPT_' + randomUUID().replaceAll('-', ''),
      token = '\x1b]0;' + marker + '\x07',
      win = process.platform === 'win32';
    let child;
    try {
      child = spawnProcess(
        win ? 'powershell.exe' : process.env.SHELL || '/bin/sh',
        win
          ? [
              '-NoLogo',
              '-NoProfile',
              '-NoExit',
              '-Command',
              "function global:prompt { [Console]::Write([char]27+']0;" +
                marker +
                "'+[char]7); 'PS '+(Get-Location).Path+'> ' }",
            ]
          : [],
        {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd,
          useConptyDll: process.platform === 'win32',
          env: { ...process.env, TERM: 'xterm-256color' },
        },
      );
    } catch (error) {
      resolve({ status: 'failed', exitCode: null, error: error.message });
      return;
    }
    let pending = '',
      finished = false;
    const stop = () => {
      try {
        child.kill();
      } catch {}
    };
    const timer = setTimeout(stop, timeoutMs);
    timer.unref();
    child.onData((data) => {
      pending += data;
      let at;
      while ((at = pending.indexOf(token)) >= 0) {
        onOutput(pending.slice(0, at));
        pending = pending.slice(at + token.length);
        onBusy(false);
      }
      let keep = Math.min(token.length - 1, pending.length);
      while (keep && !token.startsWith(pending.slice(-keep))) keep--;
      if (pending.length > keep) onOutput(pending.slice(0, pending.length - keep));
      pending = keep ? pending.slice(-keep) : '';
    });
    child.onExit(({ exitCode }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      if (pending) onOutput(pending);
      resolve({ status: signal?.aborted ? 'cancelled' : exitCode === 0 ? 'passed' : 'failed', exitCode });
    });
    onStart({
      pid: child.pid,
      write: (text) => {
        if (/[\r\n]/.test(text)) onBusy(true);
        child.write(text);
      },
      resize: (cols, rows) => child.resize(cols, rows),
    });
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
  });
}
module.exports = { runPty };
