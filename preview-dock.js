// A docked preview uses the same isolated web preferences and network policy as
// the existing preview window. No app preload or renderer bridge is added.
function createPreviewDock({ WebContentsView, nativeImage, parent, webPreferences }) {
  const owner = parent();
  if (!owner || owner.isDestroyed()) throw Error('App window unavailable.');
  const view = new WebContentsView({ webPreferences: { ...webPreferences, backgroundThrottling: false } });
  owner.contentView.addChildView(view);
  let bounds = { x: 0, y: 0, width: 1, height: 1 },
    destroyed = false,
    visible = false;
  view.setVisible(false);
  const layout = (input) => {
    if (destroyed) return;
    if (input.visible !== true) {
      visible = false;
      view.setVisible(false);
      return bounds;
    }
    const [width, height] = owner.getContentSize();
    const x = Math.max(0, Math.min(width - 1, Math.round(Number(input.x) || 0))),
      y = Math.max(0, Math.min(height - 1, Math.round(Number(input.y) || 0)));
    bounds = {
      x,
      y,
      width: Math.max(1, Math.min(width - x, Math.round(Number(input.width) || 1))),
      height: Math.max(1, Math.min(height - y, Math.round(Number(input.height) || 1))),
    };
    view.setBounds(bounds);
    view.setVisible(input.visible === true);
    visible = true;
    return bounds;
  };
  return {
    webContents: view.webContents,
    isDestroyed: () => destroyed || view.webContents.isDestroyed(),
    setMenu() {},
    loadURL: (url) => view.webContents.loadURL(url),
    focus: () => view.webContents.focus(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (!owner.isDestroyed()) owner.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    },
    setContentSize(width, height) {
      layout({ ...bounds, width, height, visible: true });
    },
    getContentSize: () => [bounds.width, bounds.height],
    async capturePage() {
      const debug = view.webContents.debugger;
      if (debug.isAttached()) throw Error('Finish the active preview inspection before capturing.');
      // A hidden native View has no capturable surface. Render it outside the
      // parent's clipped area during capture so review dialogs remain unobscured.
      const hidden = !visible;
      if (hidden) {
        view.setBounds({ ...bounds, x: -bounds.width - 10 });
        view.setVisible(true);
      }
      let timer;
      try {
        debug.attach('1.3');
        const result = await Promise.race([
          debug.sendCommand('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
            fromSurface: true,
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('Preview screenshot timed out.')), 15000);
          }),
        ]);
        if (!result.data || result.data.length > 12 * 1048576)
          throw Error('Preview screenshot exceeded its size limit.');
        return nativeImage.createFromBuffer(Buffer.from(result.data, 'base64'));
      } finally {
        clearTimeout(timer);
        if (debug.isAttached()) debug.detach();
        if (hidden && !destroyed && !view.webContents.isDestroyed()) {
          view.setVisible(visible);
          view.setBounds(bounds);
        }
      }
    },
    dockLayout: layout,
  };
}
module.exports = { createPreviewDock };
