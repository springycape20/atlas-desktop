const test = require('node:test'),
  assert = require('node:assert/strict'),
  { syncUninstallVersion, uninstallKey } = require('../uninstall-entry');

const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\e2ac7a28-23f2-5087-af63-986863f241cd';
const installDir = 'C:\\Users\\a\\AppData\\Local\\Programs\\atlas-local-desktop';
function fakeReg(entry) {
  const calls = [];
  const run = (_exe, args, _options, done) => {
    calls.push(args);
    if (args[0] === 'query')
      return done(
        null,
        '\r\n' +
          key +
          '\r\n' +
          Object.entries(entry)
            .map(([name, value]) => `    ${name}    REG_SZ    ${value}`)
            .join('\r\n') +
          '\r\n',
      );
    done(null, 'The operation completed successfully.');
  };
  return { calls, run };
}
const options = (run) => ({ appId: 'com.springycape.atlas', productName: 'ATLAS', version: '0.6.11', installDir, run });

test('the uninstall key matches the one electron-builder writes for this appId', () => {
  assert.equal(uninstallKey('com.springycape.atlas'), key);
});
test('a stale Apps-list version is corrected for this installation', async () => {
  const reg = fakeReg({
    DisplayName: 'ATLAS 0.6.8',
    DisplayVersion: '0.6.8',
    UninstallString: `"${installDir}\\Uninstall ATLAS.exe" /currentuser`,
  });
  assert.deepEqual(await syncUninstallVersion(options(reg.run)), { changed: true, from: '0.6.8' });
  assert.deepEqual(reg.calls.slice(1), [
    ['add', key, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', '0.6.11', '/f'],
    ['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'ATLAS 0.6.11', '/f'],
  ]);
});
test('a current entry is left alone', async () => {
  const reg = fakeReg({ DisplayVersion: '0.6.11', UninstallString: `"${installDir}\\Uninstall ATLAS.exe"` });
  assert.deepEqual(await syncUninstallVersion(options(reg.run)), { changed: false, reason: 'already shows 0.6.11' });
  assert.equal(reg.calls.length, 1);
});
test("another installation's entry is never changed", async () => {
  const reg = fakeReg({ DisplayVersion: '0.6.8', UninstallString: '"D:\\Other\\Uninstall ATLAS.exe"' });
  assert.equal((await syncUninstallVersion(options(reg.run))).changed, false);
  assert.equal(reg.calls.length, 1);
});
test('an entry with no uninstaller is reported rather than silently skipped', async () => {
  const reg = fakeReg({ DisplayVersion: '0.6.8' });
  assert.deepEqual(await syncUninstallVersion(options(reg.run)), {
    changed: false,
    reason: 'entry points at no uninstaller, not this installation',
  });
});
