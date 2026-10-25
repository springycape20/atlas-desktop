const { spawn } = require('node:child_process');
const path = require('node:path');

let installation;
function installClaudeCode() {
  if (installation) return installation;
  installation = new Promise((resolve, reject) => {
    const executable = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
    env.PSModulePath = path.join(path.dirname(executable), 'Modules');
    // Anthropic's documented native installer; no admin rights or Node installation needed.
    const script =
      "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { Invoke-RestMethod 'https://claude.ai/install.ps1' | Invoke-Expression } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }";
    const child = spawn(
      executable,
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, shell: false, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const capture = (data) => {
      output = (output + data).slice(-3000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const timer = setTimeout(() => {
      if (child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('error', () => child.kill());
      }
      reject(new Error('Claude Code installation timed out. Check your internet connection and try again.'));
    }, 10 * 60_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error('Claude Code installation failed. ' + output.trim()));
    });
  }).finally(() => {
    installation = null;
  });
  return installation;
}

module.exports = { installClaudeCode };
