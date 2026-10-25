const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { version } = require('../package.json');
const archive = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
for(const file of ['app-log.js','app-ui.js','integration-service.js','desktop-permissions.js','desktop-action-policy.js','desktop-interaction.js','desktop-overlay.js','powershell-policy.js','integration-processes.js','windows-tool-runtime.js','windows-tool-python.js','startup-lifecycle.js','chat-render.js','parallel-proposals.js','project-context.js','review-context.js','colab-graph.js','colab-graph-ui.js'])assert.ok(asar.extractFile(archive,file).length>0,`Missing application runtime: ${file}`);
assert.ok(asar.extractFile(archive,path.join('node_modules','@modelcontextprotocol','sdk','package.json')).length>0,'Missing MCP SDK runtime');
for (const file of ['claude-connection.js','colab-workspace-reuse.js','colab-answer.js','colab-efficiency.js','verification-cache.js','code-syntax.js','syntax-worker.js','syntax-highlight.js','claude-runtime.js','chat-import.js','transcript-import.js','colab-history.js','project-root.js','provider-catalog.js','assistant-chat.js']) assert.ok(asar.extractFile(archive,file).length>0,`Missing syntax highlighting runtime: ${file}`);
assert.equal(packaged.version, version);
// Only the Windows x64 speech runtime ships; other platforms' binaries are excluded.
const onnx=path.join(path.dirname(archive),'app.asar.unpacked','node_modules','onnxruntime-node','bin','napi-v3');
assert.ok(fs.statSync(path.join(onnx,'win32','x64','onnxruntime_binding.node')).size>0,'Missing Windows x64 speech runtime');
for(const other of ['darwin','linux',path.join('win32','arm64')])assert.ok(!fs.existsSync(path.join(onnx,other)),`Unneeded speech runtime packaged: ${other}`);
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${version}`);
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
