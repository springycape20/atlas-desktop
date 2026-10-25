const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');

// Electron UI tests keep their profile folder locked until the process exits, so they
// cannot delete it themselves. Each run removes its own leftovers from earlier runs
// instead; recent folders are kept in case another run is still using them.
function removeStaleTempFolders(prefix, maxAgeMs = 10 * 60 * 1000) {
  const root = os.tmpdir();
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith(prefix)) continue;
    const folder = path.join(root, name);
    try {
      if (Date.now() - fs.statSync(folder).mtimeMs > maxAgeMs)
        fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {}
  }
}
module.exports = { removeStaleTempFolders };
