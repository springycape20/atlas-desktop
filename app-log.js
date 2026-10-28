const fs = require('node:fs'),
  path = require('node:path'),
  util = require('node:util');
function redactDiagnostic(value) {
  return String(value)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/(\b(?:proxy-)?authorization\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(
      /(["'\x60]?(?:access[_-]?token|refresh[_-]?token|(?:auth[_-]?)?token|api[_-]?key|password|secret|authorization)["'\x60]?\s*[:=]\s*)(["'\x60])(?:\\[\s\S]|(?!\2)[^\\])*(?:\2|\\?$)/gi,
      '$1$2[REDACTED]$2',
    )
    .replace(
      /((?:["'\x60]?)(?:access[_-]?token|refresh[_-]?token|(?:auth[_-]?)?token|api[_-]?key|password|secret|authorization)["'\x60]?\s*[:=]\s*["'\x60]?)[^\s"'\x60,}\]]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}
// Append timestamped lines to a small log in the app's data folder, so startup and
// runtime problems can be diagnosed afterwards. One rotated copy is kept.
function createAppLog(file, { limit = 1024 * 1024 } = {}) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.statSync(file).size > limit) fs.renameSync(file, file + '.old');
  } catch {}
  const write = (level, args) => {
    try {
      fs.appendFileSync(
        file,
        new Date().toISOString() + ' ' + level + ' ' + redactDiagnostic(util.format(...args)) + '\n',
      );
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
          const formatted = util.format(...args),
            redacted = redactDiagnostic(formatted);
          if (redacted === formatted) original(...args);
          else original(redacted);
        };
      }
    },
  };
}
module.exports = { createAppLog, redactDiagnostic };
