const test = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events'),
  { createDesktopOverlay, html } = require('../desktop-overlay');
function fixture(load = () => Promise.resolve()) {
  const created = [],
    screen = new EventEmitter();
  let displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
  screen.getAllDisplays = () => displays;
  class Window {
    constructor(options) {
      this.options = options;
      this.visible = false;
      this.dead = false;
      this.webContents = { setWindowOpenHandler() {}, on() {} };
      created.push(this);
    }
    setIgnoreMouseEvents(value) {
      this.ignoresMouse = value;
    }
    setAlwaysOnTop(value) {
      this.onTop = value;
    }
    loadURL(value) {
      this.url = value;
      return load();
    }
    setBounds(value) {
      this.bounds = value;
    }
    isVisible() {
      return this.visible;
    }
    showInactive() {
      this.visible = true;
      this.shown = (this.shown || 0) + 1;
    }
    hide() {
      this.visible = false;
    }
    isDestroyed() {
      return this.dead;
    }
    destroy() {
      this.dead = true;
      this.visible = false;
    }
  }
  const overlay = createDesktopOverlay({ BrowserWindow: Window, screen });
  return {
    overlay,
    created,
    screen,
    displays: (value) => {
      displays = value;
    },
  };
}
test('screen border is transparent, nonfocusable, click-through and retained between task actions', async () => {
  const f = fixture();
  await f.overlay.begin({ jobId: 'one', owner: 'colab:one' });
  await f.overlay.begin({ jobId: 'one', owner: 'colab:one' });
  assert.equal(f.created.length, 1);
  const window = f.created[0];
  assert(window.visible && window.ignoresMouse && window.onTop);
  assert.equal(window.options.focusable, false);
  assert.equal(window.options.transparent, true);
  assert.equal(window.options.skipTaskbar, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.shown, 1);
  assert(html.includes('Atlas is controlling this PC'));
  f.overlay.end('one');
  assert(!window.visible);
  await f.overlay.begin({ jobId: 'two', owner: 'colab:one' });
  assert.equal(f.created.length, 1);
  assert(window.visible);
  f.overlay.close();
  assert(window.dead);
});
test('revocation, task cancellation and app close remove the appropriate borders', async () => {
  const f = fixture(),
    controller = new AbortController();
  await f.overlay.begin({ jobId: 'one', owner: 'colab:one', signal: controller.signal });
  await f.overlay.begin({ jobId: 'two', owner: 'colab:two' });
  controller.abort();
  assert(f.created[0].visible);
  f.overlay.endOwner('colab:two');
  assert(!f.created[0].visible);
  await assert.rejects(f.overlay.begin({ jobId: 'cancelled', signal: controller.signal }));
  f.overlay.close();
  assert(f.created[0].dead);
  await assert.rejects(f.overlay.begin({ jobId: 'closed' }));
});
test('borders follow multiple displays and layout changes without taking focus', async () => {
  const f = fixture();
  f.displays([
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, bounds: { x: -1280, y: 0, width: 1280, height: 720 } },
  ]);
  await f.overlay.begin({ jobId: 'one' });
  assert.equal(f.created.length, 2);
  assert.equal(f.created[1].bounds.x, -1280);
  f.displays([{ id: 2, bounds: { x: 0, y: 0, width: 1280, height: 720 } }]);
  f.screen.emit('display-removed');
  await new Promise((resolve) => setImmediate(resolve));
  assert(f.created[0].dead);
  assert.equal(f.created[1].bounds.x, 0);
  f.overlay.close();
  assert.equal(f.screen.listenerCount('display-removed'), 0);
});

test('a cancelled task cannot destroy another task’s border while the renderer is loading', async () => {
  let ready;
  const waiting = new Promise((resolve) => {
      ready = resolve;
    }),
    f = fixture(() => waiting),
    controller = new AbortController();
  const first = f.overlay.begin({ jobId: 'first', owner: 'colab:first', signal: controller.signal });
  const second = f.overlay.begin({ jobId: 'second', owner: 'colab:second' });
  controller.abort();
  ready();
  await assert.rejects(first);
  await second;
  assert(f.created[0].visible);
  assert(!f.created[0].dead);
  f.overlay.close();
});
