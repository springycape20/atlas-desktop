const fs = require('node:fs'),
  path = require('node:path'),
  util = require('node:util');
// Append timestamped lines to a small log in the app's data folder, so startup and
// runtime problems can be diagnosed afterwards. One rotated copy is kept.
function createAppLog(file, { limit = 1024 * 1024 } = {}) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.statSync(file).size > limit) fs.renameSync(file, file + '.old');
  } catch {}
  const write = (level, args) => {
    try {
      fs.appendFileSync(file, new Date().toISOString() + ' ' + level + ' ' + util.format(...args) + '\n');
    } catch {}
  };
  return {
    file,
    info: (...args) => write('INFO', args),
    warn: (...args) => write('WARN', args),
    error: (...args) => write('ERROR', args),
    // Mirror console output into the log while keeping it on the terminal.
    captureConsole(target = console) {
      for (const [method, level] of [
        ['log', 'INFO'],
        ['warn', 'WARN'],
        ['error', 'ERROR'],
      ]) {
        const original = target[method].bind(target);
        target[method] = (...args) => {
          write(level, args);
          original(...args);
        };
      }
    },
  };
}
module.exports = { createAppLog };
