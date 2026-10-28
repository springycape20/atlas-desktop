const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
async function verifyPackage(directory = path.resolve(__dirname, '..', 'dist', 'win-unpacked')) {
  const resources = path.join(directory, 'resources'),
    archive = path.join(resources, 'app.asar');
  const pkg = JSON.parse(asar.extractFile(archive, 'package.json'));
  assert.equal(pkg.version, require('../package.json').version);
  for (const file of [
    'local-data.js',
    'uv-runtime.js',
    'local-model.js',
    'project-knowledge.js',
    'knowledge-worker.cjs',
    'knowledge-client.js',
    'workflow-templates.js',
    'parallel-batches.js',
    'task-recovery.js',
    'ui-shell.js',
    'ui-shell.css',
    'appearance.js',
    'appearance-ui.js',
    'capability-ui.js',
    'command-menu.js',
    'model-policy.js',
    'model-routing-ui.js',
    'hardware-check.js',
    'hardware-ui.js',
    'task-plans.js',
    'planning-ui.js',
    'environment-recipe.js',
    'environment-ui.js',
    'review-center-ui.js',
    'task-progress.js',
    'progress-ui.js',
    'search-results.js',
    'unified-search-ui.js',
  ])
    assert(asar.extractFile(archive, file).length);
  for (const file of asar.listPackage(archive)) {
    assert(
      !/(?:^|[/\\])(?:\.handover|\.setup-cache|\.aws|\.codex|\.agents|\.git|\.env(?:\.[^/\\]+)?)(?:[/\\]|$)/i.test(
        file,
      ),
      'Private path packaged: ' + file,
    );
    assert(
      !/(?:^|[/\\])(?:kokoro-js|phonemizer|sharp|@img|onnxruntime-node|@huggingface)(?:[/\\]|$)/i.test(file),
      'Removed speech dependency packaged: ' + file,
    );
    assert(!/(?:^|[/\\])(?:voice-worker\.cjs|speech-model\.js)$/.test(file), 'Removed speech code packaged: ' + file);
    assert(!/(?:^|[/\\])ATLAS\.lnk$/i.test(file), 'Development shortcut packaged: ' + file);
  }
  const notices = fs.readFileSync(path.join(resources, 'compliance', 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  for (const phrase of ['whisper.cpp-MIT.txt', 'Whisper-model-card.md', 'electron-updater', 'lazy-val-MIT-notice.txt'])
    assert(notices.includes(phrase), 'Missing notice material: ' + phrase);
  for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html'])
    assert(fs.statSync(path.join(directory, name)).size > 1000, 'Missing Electron notice: ' + name);
  assert.deepEqual(
    fs.readdirSync(path.join(resources, 'speech', 'whisper', 'Release')).sort(),
    ['ggml-base.dll', 'ggml-cpu.dll', 'ggml.dll', 'whisper-server.exe', 'whisper.dll'].sort(),
    'Unexpected speech runtime files',
  );
  const inventory = JSON.parse(fs.readFileSync(path.join(resources, 'compliance', 'sbom.cdx.json')));
  const review = JSON.parse(fs.readFileSync(path.join(resources, 'compliance', 'RELEASE-REVIEW.json')));
  assert.deepEqual(review, require('../legal/release-review.json'), 'Packaged review differs from source review');
  assert.equal(inventory.metadata.component.version, pkg.version);
  for (const name of ['kokoro-js', 'phonemizer', 'onnxruntime-node', 'sharp', '@img/sharp-win32-x64'])
    assert(
      !inventory.components.some((component) => component.name === name),
      'Removed component in inventory: ' + name,
    );
  for (const [name, expected] of Object.entries({
    'ggml-tiny.en.bin': '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
    'ggml-small.en-q5_1.bin': 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
  }))
    assert.equal(
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(resources, 'speech', 'models', name)))
        .digest('hex'),
      expected,
      'Speech model checksum mismatch: ' + name,
    );
  assert(fs.statSync(path.join(resources, 'speech', 'whisper', 'Release', 'whisper-server.exe')).size > 0);
  const exe = path.join(directory, 'ATLAS.exe');
  const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
  const wire = await getCurrentFuseWire(exe);
  for (const name of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments'])
    assert.equal(String.fromCharCode(wire[FuseV1Options[name]]), '0', name);
  for (const name of ['EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar'])
    assert.equal(String.fromCharCode(wire[FuseV1Options[name]]), '1', name);
  const headerHash = crypto.createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex');
  const binary = fs.readFileSync(exe);
  assert(
    binary.includes(Buffer.from(headerHash)) || binary.includes(Buffer.from(headerHash, 'utf16le')),
    'Executable does not embed this ASAR header hash',
  );
  console.log(
    `Verified local package ${pkg.version}: notices, npm inventory, pinned speech models, private-path exclusions, binary fuses and ASAR hash.`,
  );
}
module.exports = { verifyPackage };
if (require.main === module)
  verifyPackage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
