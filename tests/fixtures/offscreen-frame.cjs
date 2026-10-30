// Offscreen windows already produce complete bitmap frames. Wait for a fresh
// paint instead of asking Chromium to capture a hidden compositor surface.
async function offscreenFrame(win) {
  await win.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  );
  return new Promise((resolve, reject) => {
    const contents = win.webContents;
    const timer = setTimeout(() => {
      contents.removeListener('paint', paint);
      reject(Error('No nonempty offscreen frame after invalidation: ' + JSON.stringify(win.getContentBounds())));
    }, 3000);
    function paint(_event, _dirty, bitmap) {
      if (!bitmap || bitmap.isEmpty()) return;
      clearTimeout(timer);
      contents.removeListener('paint', paint);
      resolve(bitmap);
    }
    contents.on('paint', paint);
    contents.invalidate();
  });
}
module.exports = { offscreenFrame };
