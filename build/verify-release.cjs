const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { version } = require('../package.json');
const archive = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(packaged.version, version);
if (process.env.GITHUB_REF_NAME) assert.equal(process.env.GITHUB_REF_NAME, `v${version}`);
for (const file of ['workspace-service.js', 'workspace-ipc.js', 'workspace-extras.js', 'colab-workspace.js', 'provider-install.js', 'collaboration.js', 'main.js', 'index.html']) {
  assert.ok(asar.extractFile(archive, file).length > 0, `Missing packaged app file: ${file}`);
}
assert.ok(fs.statSync(path.join(__dirname, '..', 'dist', `ATLAS-Setup-${version}.exe`)).size > 0);
console.log(`Verified ATLAS ${version}: installer, Colab workspace and provider installer are packaged.`);
