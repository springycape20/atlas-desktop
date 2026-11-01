const test = require('node:test'),
  assert = require('node:assert/strict');
const { createPresence } = require('../desktop-presence');
function fixture({ taken = [] } = {}) {
  const trays = [],
    registered = new Map();
  const win = {
    visible: true,
    focused: true,
    minimized: false,
    isDestroyed: () => false,
    isVisible: () => win.visible,
    isFocused: () => win.focused,
    isMinimized: () => win.minimized,
    restore: () => (win.minimized = false),
    show: () => (win.visible = true),
    focus: () => (win.focused = true),
    hide: () => ((win.visible = false), (win.focused = false)),
    minimize: () => ((win.minimized = true), (win.focused = false)),
  };
  const app = { quits: 0, quit: () => app.quits++ };
  class Tray {
    constructor() {
      trays.push(this);
    }
    setToolTip() {}
    setContextMenu(menu) {
      this.menu = menu;
    }
    on(name, run) {
      this[name] = run;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const presence = createPresence({
    app,
    Tray,
    Menu: { buildFromTemplate: (items) => items },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    globalShortcut: {
      register: (key, run) => !taken.includes(key) && Boolean(registered.set(key, run)),
      unregister: (key) => registered.delete(key),
    },
    getWindow: () => win,
    iconPath: 'icon.png',
  });
  return { presence, trays, registered, win, app };
}
test('tray and hotkey are off unless turned on', () => {
  const { presence, trays, registered } = fixture();
  assert.deepEqual(presence.apply({}), {});
  assert.equal(presence.keepOnClose(), false);
  assert.equal(trays.length, 0);
  assert.equal(registered.size, 0);
});
test('the tray is created once, removed when off, and can quit', () => {
  const { presence, trays, win, app } = fixture();
  presence.apply({ trayEnabled: true });
  presence.apply({ trayEnabled: true });
  assert.equal(trays.length, 1);
  assert.equal(presence.keepOnClose(), true);
  win.hide();
  trays[0].click();
  assert.equal(win.visible, true);
  trays[0].menu.find((item) => item.label === 'Quit ATLAS').click();
  assert.equal(app.quits, 1);
  presence.apply({ trayEnabled: false });
  assert.equal(trays[0].destroyed, true);
  assert.equal(presence.keepOnClose(), false);
});
test('the hotkey brings ATLAS forward, then hides it with the tray or minimizes it without', () => {
  const { presence, registered, win } = fixture();
  presence.apply({ globalHotkey: 'Ctrl+Alt+A' });
  const press = registered.get('Ctrl+Alt+A');
  press();
  assert.equal(win.minimized, true);
  press();
  assert.equal(win.minimized, false);
  assert.equal(win.focused, true);
  presence.apply({ trayEnabled: true, globalHotkey: 'Ctrl+Alt+A' });
  press();
  assert.equal(win.visible, false);
  press();
  assert.equal(win.visible, true);
});
test('changing or clearing the hotkey releases the old one', () => {
  const { presence, registered } = fixture();
  presence.apply({ globalHotkey: 'Ctrl+Alt+A' });
  presence.apply({ globalHotkey: 'Ctrl+Alt+Space' });
  assert.deepEqual([...registered.keys()], ['Ctrl+Alt+Space']);
  presence.apply({ globalHotkey: '' });
  assert.equal(registered.size, 0);
});
test('a shortcut another app owns is reported, and a later save can retry it', () => {
  const taken = ['Ctrl+Alt+A'];
  const { presence, registered } = fixture({ taken });
  assert.match(presence.apply({ globalHotkey: 'Ctrl+Alt+A' }).hotkeyError, /in use by another app/);
  assert.equal(registered.size, 0);
  taken.length = 0;
  assert.deepEqual(presence.apply({ globalHotkey: 'Ctrl+Alt+A' }), {});
  assert.equal(registered.size, 1);
});
test('a shortcut outside the list is never registered', () => {
  const { presence, registered } = fixture();
  assert.deepEqual(presence.apply({ globalHotkey: 'Alt+F4' }), {});
  assert.equal(registered.size, 0);
});
test('dispose releases everything', () => {
  const { presence, trays, registered } = fixture();
  presence.apply({ trayEnabled: true, globalHotkey: 'Ctrl+Alt+A' });
  presence.dispose();
  assert.equal(trays[0].destroyed, true);
  assert.equal(registered.size, 0);
});
