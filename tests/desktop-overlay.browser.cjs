// Offscreen render only: never displays a border on the user's desktop.
const { app, BrowserWindow } = require('electron'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createDesktopOverlay } = require('../desktop-overlay');
require('./temp-cleanup.cjs').removeStaleTempFolders('atlas-overlay-render-');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-overlay-render-'));
app.setPath('userData', directory);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let overlay;
  try {
    function RenderWindow(options) {
      const win = new BrowserWindow({
        ...options,
        show: false,
        webPreferences: { ...options.webPreferences, offscreen: true },
      });
      let visible = false;
      win.showInactive = () => {
        visible = true;
      };
      win.hide = () => {
        visible = false;
      };
      win.isVisible = () => visible;
      return win;
    }
    overlay = createDesktopOverlay({
      BrowserWindow: RenderWindow,
      screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 900, height: 500 } }] },
    });
    await overlay.begin({ jobId: 'render-only', owner: 'colab:test' });
    const win = overlay.windows()[0];
    const actual = await win.webContents.executeJavaScript(
      `({text:document.body.innerText,background:getComputedStyle(document.body).backgroundColor,border:getComputedStyle(document.querySelector('.border')).borderWidth,center:document.elementFromPoint(innerWidth/2,innerHeight/2)?.className})`,
    );
    assert(actual.text.includes('Atlas is controlling this PC'));
    assert.equal(actual.background, 'rgba(0, 0, 0, 0)');
    assert.equal(actual.border, '3px');
    assert.equal(win.isFocusable(), false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (process.env.ATLAS_OVERLAY_CAPTURE)
      fs.writeFileSync(process.env.ATLAS_OVERLAY_CAPTURE, (await win.webContents.capturePage()).toPNG());
    overlay.end('render-only');
    assert.equal(win.isVisible(), false);
    console.log(
      'PASS: Control border renders with the requested label and transparent center, ignores focus, and hides when the task ends. No desktop input was sent.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    overlay?.close();
    app.exit(process.exitCode || 0);
  }
});
