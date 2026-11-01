const HOTKEYS = ['Ctrl+Shift+Space', 'Ctrl+Alt+A', 'Ctrl+Alt+Space'];
function createPresence({ app, Tray, Menu, nativeImage, globalShortcut, getWindow, iconPath }) {
  let tray = null,
    hotkey = '',
    keep = false;
  const current = () => {
    const win = getWindow();
    return win && !win.isDestroyed() ? win : null;
  };
  function show() {
    const win = current();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  function toggle() {
    const win = current();
    if (!win) return;
    if (!win.isVisible() || !win.isFocused()) show();
    else if (keep) win.hide();
    else win.minimize();
  }
  function apply({ trayEnabled, globalHotkey }) {
    keep = trayEnabled === true;
    if (keep && !tray) {
      tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
      tray.setToolTip('ATLAS');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open ATLAS', click: show },
          { type: 'separator' },
          { label: 'Quit ATLAS', click: () => app.quit() },
        ]),
      );
      tray.on('click', show);
    } else if (!keep && tray) {
      tray.destroy();
      tray = null;
    }
    const wanted = HOTKEYS.includes(globalHotkey) ? globalHotkey : '';
    if (wanted === hotkey) return {};
    if (hotkey) globalShortcut.unregister(hotkey);
    hotkey = '';
    if (!wanted) return {};
    // Another app can already own the combination, and only registering can tell.
    if (!globalShortcut.register(wanted, toggle))
      return { hotkeyError: wanted + ' is in use by another app. Choose a different shortcut.' };
    hotkey = wanted;
    return {};
  }
  function dispose() {
    if (hotkey) globalShortcut.unregister(hotkey);
    hotkey = '';
    tray?.destroy();
    tray = null;
  }
  return { apply, show, dispose, keepOnClose: () => keep };
}
module.exports = { createPresence, HOTKEYS };
