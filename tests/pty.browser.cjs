const { app } = require('electron'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-pty-')),
    controller = new AbortController();
  let handle,
    output = '';
  try {
    const done = require('../pty-session').runPty(root, {
      signal: controller.signal,
      timeoutMs: 15000,
      onStart: (value) => (handle = value),
      onOutput: (text) => (output += text),
      onBusy: () => {},
      ...(process.env.ATLAS_PTY_PACKAGE_ROOT
        ? { spawnProcess: require(process.env.ATLAS_PTY_PACKAGE_ROOT).spawn }
        : {}),
    });
    await new Promise((r) => setTimeout(r, 900));
    handle.resize(100, 30);
    handle.write("Write-Output ('PTY_' + 'NATIVE_OK')\r");
    for (let n = 0; n < 100 && !output.includes('PTY_NATIVE_OK'); n++) await new Promise((r) => setTimeout(r, 50));
    if (!output.includes('PTY_NATIVE_OK')) throw Error('PTY output missing: ' + output);
    controller.abort();
    await done;
    console.log('PASS: Electron native PTY spawn, resize, input, ANSI output and stop.');
    app.exit(0);
  } catch (error) {
    controller.abort();
    console.error(error);
    app.exit(1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
