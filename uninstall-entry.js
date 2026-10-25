const { execFile } = require('node:child_process'),
  path = require('node:path');
// electron-builder names the per-user uninstall entry after a UUID derived from the appId.
const ELECTRON_BUILDER_NAMESPACE = '50e065bc-3134-11e6-9bab-38c9862bdaf3';
function uninstallKey(appId) {
  const { UUID } = require('builder-util-runtime');
  return (
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' +
    UUID.v5(appId, UUID.parse(ELECTRON_BUILDER_NAMESPACE))
  );
}
function reg(args, run) {
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  return new Promise((resolve, reject) =>
    run(exe, args, { windowsHide: true, timeout: 10000 }, (error, stdout) => (error ? reject(error) : resolve(stdout))),
  );
}
// After in-app updates the Windows Apps list could keep showing an older version, which
// running the installer directly never reproduced. The installed app corrects its own
// entry, and only when that entry belongs to this installation.
async function syncUninstallVersion({ appId, productName, version, installDir, run = execFile }) {
  const key = uninstallKey(appId),
    values = {};
  for (const line of (await reg(['query', key], run)).split(/\r?\n/)) {
    const match = line.match(/^\s+(\S+)\s+REG_\w+\s+(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  if (
    !String(values.UninstallString || '')
      .toLowerCase()
      .includes(path.resolve(installDir).toLowerCase())
  )
    return { changed: false, reason: 'entry belongs to another installation' };
  if (values.DisplayVersion === version) return { changed: false };
  for (const [name, value] of [
    ['DisplayVersion', version],
    ['DisplayName', productName + ' ' + version],
  ])
    await reg(['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], run);
  return { changed: true, from: values.DisplayVersion };
}
module.exports = { syncUninstallVersion, uninstallKey };
