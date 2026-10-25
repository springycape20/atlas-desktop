const { execFile } = require('node:child_process'),
  path = require('node:path');
function powershell(script, run = execFile) {
  return new Promise((resolve, reject) => {
    run(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 12000, maxBuffer: 512 * 1024 },
      (error, stdout) => (error ? reject(Error('Could not track the Windows controller processes.')) : resolve(stdout)),
    );
  });
}
async function capture(pid, run) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw Error('Windows controller process ID is unavailable.');
  const raw = await powershell(
    `$ErrorActionPreference='Stop';$all=@(Get-CimInstance Win32_Process);$ids=[System.Collections.Generic.HashSet[int]]::new();[void]$ids.Add(${pid});do{$added=$false;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)-and $ids.Add([int]$p.ProcessId)){$added=$true}}}while($added);$rows=@($all|Where-Object {$ids.Contains([int]$_.ProcessId)}|ForEach-Object {@{pid=[int]$_.ProcessId;created=$_.CreationDate.ToUniversalTime().Ticks.ToString()}});ConvertTo-Json -InputObject $rows -Compress`,
    run,
  );
  const rows = JSON.parse(raw.trim() || '[]');
  if (
    !Array.isArray(rows) ||
    !rows.some((row) => row.pid === pid) ||
    rows.length > 100 ||
    rows.some((row) => !Number.isSafeInteger(row.pid) || row.pid < 1 || !/^\d+$/.test(row.created))
  )
    throw Error('Cannot identify the Windows controller process tree safely.');
  return rows;
}
async function terminate(rows, run) {
  if (
    !Array.isArray(rows) ||
    rows.some((row) => !Number.isSafeInteger(row.pid) || row.pid < 1 || !/^\d+$/.test(row.created))
  )
    throw Error('Invalid controller process snapshot.');
  if (!rows.length) return;
  const encoded = Buffer.from(JSON.stringify(rows), 'utf8').toString('base64');
  await powershell(
    `$ErrorActionPreference='Stop';$rows=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')));foreach($row in $rows){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$row.pid);if($p-and $p.CreationDate.ToUniversalTime().Ticks.ToString()-eq $row.created){Stop-Process -Id ([int]$row.pid) -Force -ErrorAction SilentlyContinue}}`,
    run,
  );
}
module.exports = { capture, terminate };
