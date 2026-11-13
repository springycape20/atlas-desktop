const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('native dock reuses isolated preferences, clamps geometry and closes its own contents', () => {
  let options,
    bounds,
    visible,
    removed = 0,
    closed = 0;
  class View {
    constructor(value) {
      options = value;
      this.webContents = { isDestroyed: () => false, close: () => closed++ };
    }
    setVisible(v) {
      visible = v;
    }
    setBounds(v) {
      bounds = v;
    }
  }
  const parent = {
    isDestroyed: () => false,
    getContentSize: () => [1000, 700],
    contentView: {
      addChildView() {},
      removeChildView() {
        removed++;
      },
    },
  };
  const prefs = { sandbox: true, contextIsolation: true, nodeIntegration: false };
  const dock = require('../preview-dock').createPreviewDock({
    WebContentsView: View,
    parent: () => parent,
    webPreferences: prefs,
  });
  assert.deepEqual(options.webPreferences, { ...prefs, backgroundThrottling: false });
  assert.equal(visible, false);
  dock.dockLayout({ x: -100, y: 650, width: 2000, height: 400, visible: true });
  assert.deepEqual(bounds, { x: 0, y: 650, width: 1000, height: 50 });
  assert.equal(visible, true);
  dock.dockLayout({ visible: false });
  assert.equal(visible, false);
  assert.deepEqual(
    bounds,
    { x: 0, y: 650, width: 1000, height: 50 },
    'hiding a native preview must preserve its capture geometry',
  );
  dock.destroy();
  dock.destroy();
  assert.equal(removed, 1);
  assert.equal(closed, 1);
});
test('docked screenshot capture releases its debugger on success and failure', async () => {
  let attached = false,
    fail = false;
  class View {
    constructor() {
      this.webContents = {
        isDestroyed: () => false,
        debugger: {
          isAttached: () => attached,
          attach() {
            attached = true;
          },
          detach() {
            attached = false;
          },
          async sendCommand(command, args) {
            assert.equal(command, 'Page.captureScreenshot');
            assert.equal(args.captureBeyondViewport, true);
            if (fail) throw Error('capture failed');
            return { data: Buffer.from('image').toString('base64') };
          },
        },
      };
    }
    setVisible() {}
    setBounds() {}
  }
  const dock = require('../preview-dock').createPreviewDock({
    WebContentsView: View,
    nativeImage: { createFromBuffer: (bytes) => bytes.toString() },
    parent: () => ({ isDestroyed: () => false, contentView: { addChildView() {} } }),
    webPreferences: {},
  });
  assert.equal(await dock.capturePage(), 'image');
  assert.equal(attached, false);
  fail = true;
  await assert.rejects(dock.capturePage(), /capture failed/);
  assert.equal(attached, false);
});
