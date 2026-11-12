const { app } = require('electron'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
app.disableHardwareAcceleration();
let service, folder;
app.whenReady().then(async () => {
  try {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-debugger-package-'));
    await fs.writeFile(path.join(folder, 'main.js'), 'let value = 2;\nvalue++;\nsetTimeout(() => {}, 20000);');
    const archive = path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar');
    let executable;
    service = require(path.join(archive, 'node-debugger.js')).createNodeDebugger({
      approve: async () => true,
      spawnProcess: (command, args, options) => {
        if (args[0]?.startsWith('--inspect-brk')) {
          executable = command;
          assert.equal(
            path.basename(command).toLowerCase(),
            'node.exe',
            'Packaged debugger must use installed Node, never the fused ATLAS/Electron executable',
          );
        }
        return spawn(command, args, options);
      },
    });
    await service.action({ action: 'start', cwd: folder, path: 'main.js' });
    let state;
    for (let attempt = 0; attempt < 100; attempt++) {
      state = await service.action({ action: 'status' });
      if (state.paused) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert(state.paused);
    assert.equal(state.frames[0].path, 'main.js');
    assert(path.isAbsolute(executable));
    await service.action({ action: 'step-over', cwd: folder });
    console.log(
      'PASS: Packaged debugger starts installed Node, pauses and steps without enabling Electron Node/inspect fuses.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await service?.dispose();
    if (folder) await fs.rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    app.exit(process.exitCode || 0);
  }
});
setTimeout(() => {
  console.error('Packaged debugger timed out');
  app.exit(1);
}, 25000).unref();
