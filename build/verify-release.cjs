const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { version } = require('../package.json');
const archive = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(packaged.version, version);
if (process.env.GITHUB_REF_NAME) assert.equal(process.env.GITHUB_REF_NAME, `v${version}`);
for (const file of ['model-catalog.js', 'app-updates.js', 'settings-discovery.js', 'workspace-service.js', 'workspace-ipc.js', 'workspace-extras.js', 'colab-workspace.js', 'provider-install.js', 'collaboration.js', 'task-notifications.js', 'provider-usage.js', 'provider-usage-ui.js', 'change-tracker.js', 'change-ipc.js', 'change-editor.js', 'approval-manager.js', 'claude-control.js', 'task-queue.js', 'project-tools.js', 'plugin-discovery.js', 'productivity-ipc.js', 'productivity-ui.js', 'main.js', 'index.html']) {
  assert.ok(asar.extractFile(archive, file).length > 0, `Missing packaged app file: ${file}`);
}
assert.ok(fs.statSync(path.join(__dirname, '..', 'dist', `ATLAS-Setup-${version}.exe`)).size > 0);

const manifest=require('js-yaml').load(fs.readFileSync(path.join(__dirname,'..','dist','latest.yml'),'utf8'));
assert.equal(manifest.version,version,'Updater manifest version differs from the app');
assert.ok(manifest.files.some(file=>decodeURIComponent(file.url)===`ATLAS-Setup-${version}.exe`),'Updater manifest does not reference this installer');
assert.ok(fs.statSync(path.join(__dirname,'..','dist',`ATLAS-Setup-${version}.exe.blockmap`)).size>0,'Missing updater blockmap');
assert.ok(asar.extractFile(archive,path.join('node_modules','electron-updater','package.json')).length>0,'Missing updater runtime');
const updateConfig=require('js-yaml').load(fs.readFileSync(path.join(path.dirname(archive),'app-update.yml'),'utf8'));
assert.equal(updateConfig.provider,'github');
assert.equal(updateConfig.owner,'springycape20');
assert.equal(updateConfig.repo,'atlas-desktop');
console.log(`Verified ATLAS ${version}: installer, app files, updater runtime, feed, blockmap and release manifest.`);

assert.ok(asar.extractFile(archive,path.join('node_modules','diff','package.json')).length>0,'Missing change editor diff runtime');
