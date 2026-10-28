const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { version } = require('../package.json');
require('./verify-package.cjs')
  .verifyPackage()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
const archive = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
for (const file of [
  'app-log.js',
  'settings-nav.js',
  'uninstall-entry.js',
  'app-ui.js',
  'integration-service.js',
  'desktop-permissions.js',
  'desktop-action-policy.js',
  'desktop-interaction.js',
  'desktop-overlay.js',
  'powershell-policy.js',
  'integration-processes.js',
  'windows-tool-runtime.js',
  'windows-tool-python.js',
  'startup-lifecycle.js',
  'chat-render.js',
  'parallel-proposals.js',
  'project-context.js',
  'review-context.js',
  'colab-graph.js',
  'colab-graph-ui.js',
])
  assert.ok(asar.extractFile(archive, file).length > 0, `Missing application runtime: ${file}`);
assert.ok(
  asar.extractFile(archive, path.join('node_modules', '@modelcontextprotocol', 'sdk', 'package.json')).length > 0,
  'Missing MCP SDK runtime',
);
for (const file of [
  'claude-connection.js',
  'colab-workspace-reuse.js',
  'colab-answer.js',
  'colab-efficiency.js',
  'verification-cache.js',
  'code-syntax.js',
  'syntax-worker.js',
  'syntax-highlight.js',
  'claude-runtime.js',
  'chat-import.js',
  'transcript-import.js',
  'colab-history.js',
  'project-root.js',
  'provider-catalog.js',
  'assistant-chat.js',
])
  assert.ok(asar.extractFile(archive, file).length > 0, `Missing syntax highlighting runtime: ${file}`);
assert.equal(packaged.version, version);
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${version}`);
for (const file of [
  'model-catalog.js',
  'app-updates.js',
  'settings-discovery.js',
  'workspace-service.js',
  'workspace-ipc.js',
  'workspace-extras.js',
  'colab-workspace.js',
  'provider-install.js',
  'collaboration.js',
  'task-notifications.js',
  'provider-usage.js',
  'provider-usage-ui.js',
  'change-tracker.js',
  'change-ipc.js',
  'change-editor.js',
  'approval-manager.js',
  'claude-control.js',
  'task-queue.js',
  'project-tools.js',
  'plugin-discovery.js',
  'productivity-ipc.js',
  'productivity-ui.js',
  'main.js',
  'index.html',
]) {
  assert.ok(asar.extractFile(archive, file).length > 0, `Missing packaged app file: ${file}`);
}
assert.ok(fs.statSync(path.join(__dirname, '..', 'dist', `ATLAS-Setup-${version}.exe`)).size > 0);

const manifest = require('js-yaml').load(fs.readFileSync(path.join(__dirname, '..', 'dist', 'latest.yml'), 'utf8'));
assert.equal(manifest.version, version, 'Updater manifest version differs from the app');
assert.ok(
  manifest.files.some((file) => decodeURIComponent(file.url) === `ATLAS-Setup-${version}.exe`),
  'Updater manifest does not reference this installer',
);
assert.ok(
  fs.statSync(path.join(__dirname, '..', 'dist', `ATLAS-Setup-${version}.exe.blockmap`)).size > 0,
  'Missing updater blockmap',
);
assert.ok(
  asar.extractFile(archive, path.join('node_modules', 'electron-updater', 'package.json')).length > 0,
  'Missing updater runtime',
);
const updateConfig = require('js-yaml').load(
  fs.readFileSync(path.join(path.dirname(archive), 'app-update.yml'), 'utf8'),
);
if (process.env.GITHUB_REF_TYPE === 'tag') {
  require('./release-policy.cjs').assertPublicRelease({
    review: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'legal', 'release-review.json'))),
    lockHash: require('node:crypto')
      .createHash('sha256')
      .update(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json')))
      .digest('hex'),
    lock: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'))),
  });
  if (process.env.SIGNING === 'true') {
    assert.equal(process.env.ATLAS_REQUIRE_SIGNATURE, '1', 'Signed releases must verify signatures');
    const publishers = Array.isArray(updateConfig.publisherName)
      ? updateConfig.publisherName
      : [updateConfig.publisherName];
    assert.ok(publishers.includes(process.env.UPDATER_PUBLISHER), 'Updater must pin the verified signing publisher');
  }
}
assert.equal(updateConfig.provider, 'github');
assert.equal(updateConfig.owner, 'springycape20');
assert.equal(updateConfig.repo, 'atlas-desktop');
console.log(`Verified ATLAS ${version}: installer, app files, updater runtime, feed, blockmap and release manifest.`);

assert.ok(
  asar.extractFile(archive, path.join('node_modules', 'diff', 'package.json')).length > 0,
  'Missing change editor diff runtime',
);

// Packaged ATLAS must not run arbitrary scripts as Node.js; check the built executable itself.
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
getCurrentFuseWire(path.join(__dirname, '..', 'dist', 'win-unpacked', 'ATLAS.exe'))
  .then((wire) => {
    for (const fuse of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments'])
      assert.equal(String.fromCharCode(wire[FuseV1Options[fuse]]), '0', `${fuse} must be disabled in ATLAS.exe`);
    for (const fuse of ['EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar'])
      assert.equal(String.fromCharCode(wire[FuseV1Options[fuse]]), '1', `${fuse} must be enabled in ATLAS.exe`);
    console.log('Verified ATLAS.exe fuses: run-as-Node, NODE_OPTIONS and --inspect are disabled.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// The updater rejects a download whose hash differs from latest.yml, so it must describe this exact file.
const installerPath = path.join(__dirname, '..', 'dist', `ATLAS-Setup-${version}.exe`),
  listed = manifest.files.find((file) => decodeURIComponent(file.url) === `ATLAS-Setup-${version}.exe`);
assert.equal(
  listed.sha512,
  require('node:crypto').createHash('sha512').update(fs.readFileSync(installerPath)).digest('base64'),
  'latest.yml sha512 does not match the installer',
);
assert.equal(listed.size, fs.statSync(installerPath).size, 'latest.yml size does not match the installer');
console.log('Verified latest.yml matches the installer byte for byte.');

// Once SignPath signing is configured, every release must be validly signed by the SignPath Foundation.
if (process.env.ATLAS_REQUIRE_SIGNATURE === '1') {
  for (const file of [installerPath, path.join(__dirname, '..', 'dist', 'win-unpacked', 'ATLAS.exe')]) {
    const script = `$s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; @{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress`;
    const result = JSON.parse(
      require('node:child_process').execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        {
          encoding: 'utf8',
        },
      ),
    );
    assert.equal(result.status, 'Valid', `${path.basename(file)} is not validly signed: ${result.status}`);
    assert.match(result.subject, /SignPath Foundation/, `${path.basename(file)} is signed by ${result.subject}`);
    console.log(`Verified signature on ${path.basename(file)}: ${result.subject}`);
  }
}
