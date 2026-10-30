const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
// The directory comes from the main process, never from renderer/provider input.
function createCheckLog(directory, limit = 4 * 1024 * 1024) {
  let fd,
    logFile,
    error,
    size = 0,
    limited = false;
  if (directory)
    try {
      fs.mkdirSync(directory, { recursive: true });
      logFile = path.join(directory, randomUUID() + '.log');
      fd = fs.openSync(logFile, 'wx', 0o600);
    } catch (e) {
      error = e.message;
    }
  return {
    write(part) {
      if (fd === undefined) return;
      const bytes = Buffer.from(part),
        available = Math.max(0, limit - size);
      if (bytes.length > available) limited = true;
      try {
        const chunk = bytes.subarray(0, available);
        let offset = 0;
        while (offset < chunk.length) {
          const written = fs.writeSync(fd, chunk, offset);
          if (!written) throw Error('Check log write did not progress.');
          offset += written;
          size += written;
        }
      } catch (e) {
        error = e.message;
      }
    },
    finish() {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch (e) {
          error = e.message;
        }
        fd = undefined;
      }
      return logFile
        ? { logFile, logLimited: limited, ...(error ? { logError: error } : {}) }
        : error
          ? { logError: error }
          : {};
    },
  };
}
module.exports = { createCheckLog };
