const test = require('node:test');
const assert = require('node:assert/strict');
const { installScript, URL, SHA256 } = require('../uv-runtime');
test('runtime installation verifies a pinned archive before extracting or copying executables', () => {
  const script = installScript("C:\\test folder\\user's tools");
  assert.match(URL, /^https:\/\/github\.com\/astral-sh\/uv\/releases\/download\/\d+\.\d+\.\d+\//);
  assert.match(SHA256, /^[a-f0-9]{64}$/);
  assert(script.includes(URL) && script.includes(SHA256));
  assert(script.indexOf('Get-FileHash') < script.indexOf('Expand-Archive'));
  assert(script.indexOf('Expand-Archive') < script.indexOf('Copy-Item'));
  assert(!script.includes('Invoke-Expression'));
  assert(script.includes("user''s tools"));
  assert(script.indexOf('Unsafe temporary cleanup path') < script.indexOf('Remove-Item'));
});
