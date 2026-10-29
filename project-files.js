const fs = require('node:fs/promises'),
  path = require('node:path'),
  { fileURLToPath } = require('node:url');
const deniedParts = new Set([
  '.git',
  '.aws',
  '.ssh',
  '.codex',
  '.claude',
  '.agents',
  '.handover',
  '.azure',
  '.gnupg',
  '.kube',
  'node_modules',
  '.venv',
  'venv',
]);
const textTypes = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.htm',
  '.css',
  '.py',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.svg',
  '.csv',
  '.log',
  '.sql',
  '.sh',
  '.ps1',
  '.bat',
  '.cmd',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.cs',
]);
const within = (root, file) => {
  const rel = path.relative(root, file);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
};
function allowed(relative) {
  return (
    !relative.split(/[\\/]/).some((part) => deniedParts.has(part.toLowerCase())) &&
    !/(?:^|[\\/])(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|auth\.json|credentials[^\\/]*\.json|id_(?:rsa|ed25519)[^\\/]*|secrets\.[^\\/]*)$|\.(?:pem|key|pfx|p12|token)$/i.test(
      relative,
    )
  );
}
function referencePath(value) {
  let text = String(value || '').trim();
  if (text.length > 3000 || /[\x00-\x1f\x7f]/.test(text)) throw Error('Invalid project file path.');
  if (/^file:/i.test(text)) {
    const url = new URL(text);
    if (url.hostname || url.search) throw Error('Only local project files are supported.');
    url.hash = '';
    text = fileURLToPath(url);
  } else text = text.replace(/#L\d+(?:-L?\d+)?$/, '').replace(/:\d+(?::\d+)?$/, '');
  if (/^[\\/]{2}|^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[A-Za-z]:[\\/]/.test(text))
    throw Error('Only files inside this project are supported.');
  if (text.replace(/^[A-Za-z]:/, '').includes(':')) throw Error('Alternate file streams are not supported.');
  return text || '.';
}
function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
function createProjectFiles({
  guard = require('./project-root').createProjectRootGuard(),
  denied = async () => [],
} = {}) {
  async function resolve(root, reference) {
    const base = await guard.assertProject(root),
      requested = path.resolve(base, referencePath(reference));
    if (!within(base, requested) || !allowed(path.relative(base, requested)))
      throw Error('This file is outside the project or is private.');
    for (const value of await denied()) {
      const canonical = await fs.realpath(value).catch(() => path.resolve(value));
      if (within(canonical, requested)) throw Error('Access to this file was denied.');
    }
    const actual = await fs.realpath(requested);
    if (!within(base, actual) || !allowed(path.relative(base, actual)))
      throw Error('This link leaves the project or points to a private file.');
    for (const value of await denied()) {
      const canonical = await fs.realpath(value).catch(() => path.resolve(value));
      if (within(canonical, actual)) throw Error('Access to this file was denied.');
    }
    return { base, actual, relative: path.relative(base, actual).split(path.sep).join('/') };
  }
  async function list(root, reference = '.') {
    const target = await resolve(root, reference),
      stat = await fs.stat(target.actual);
    if (!stat.isDirectory()) throw Error('Choose a project directory.');
    const entries = (await fs.readdir(target.actual, { withFileTypes: true }))
      .filter((row) => allowed(path.join(target.relative, row.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const rows = [];
    for (const item of entries.slice(0, 200)) {
      const relative = path.posix.join(target.relative, item.name);
      try {
        await resolve(target.base, relative);
        rows.push({ name: item.name, path: relative, directory: item.isDirectory() });
      } catch {}
    }
    return { path: target.relative, entries: rows, limited: entries.length > 200 };
  }
  async function read(root, reference) {
    const target = await resolve(root, reference),
      before = await fs.stat(target.actual);
    if (!before.isFile()) throw Error('Choose a project file.');
    const ext = path.extname(target.actual).toLowerCase(),
      max = textTypes.has(ext) ? 256 * 1024 : 8 * 1024 * 1024;
    const info = {
      name: path.basename(target.actual),
      path: target.relative,
      size: before.size,
      modifiedAt: before.mtimeMs,
      kind: 'binary',
    };
    if (before.size > max) return { ...info, message: 'This file is too large for an inline preview.' };
    const handle = await fs.open(target.actual, 'r');
    let bytes;
    try {
      const opened = await handle.stat();
      if (opened.ino !== before.ino || opened.dev !== before.dev || !opened.isFile())
        throw Error('File changed. Try again.');
      bytes = Buffer.alloc(Math.min(opened.size, max) + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      bytes = bytes.subarray(0, offset);
      if (bytes.length > max) throw Error('File grew beyond the preview limit.');
      const after = await handle.stat();
      if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs)
        throw Error('The file changed while reading. Refresh the preview.');
      await resolve(target.base, target.relative);
    } finally {
      await handle.close();
    }
    const mime = imageType(bytes);
    if (mime) return { ...info, kind: 'image', mime, preview: 'data:' + mime + ';base64,' + bytes.toString('base64') };
    if (textTypes.has(ext) && !bytes.includes(0)) {
      try {
        return {
          ...info,
          kind: ['.html', '.htm'].includes(ext) ? 'html' : 'text',
          text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        };
      } catch {}
    }
    return { ...info, message: 'Inline preview is unavailable for this file type. Use Show in folder to access it.' };
  }
  async function search(root, query, contents = false) {
    query = String(query || '')
      .trim()
      .toLowerCase()
      .slice(0, 200);
    if (!query) return { entries: [], limited: false };
    const entries = [],
      queue = ['.'];
    let visited = 0,
      bytes = 0;
    while (queue.length && visited < 2000 && entries.length < 100 && bytes < 8 * 1024 * 1024) {
      const folder = await list(root, queue.shift());
      for (const item of folder.entries) {
        if (++visited > 2000 || entries.length >= 100) break;
        if (item.directory) {
          if (item.path.split('/').length < 12) queue.push(item.path);
          continue;
        }
        if (item.path.toLowerCase().includes(query)) entries.push(item);
        else if (contents && bytes < 8 * 1024 * 1024) {
          try {
            const value = await read(root, item.path);
            bytes += value.size;
            if (typeof value.text !== 'string') continue;
            const lines = value.text.split('\n'),
              line = lines.findIndex((row) => row.toLowerCase().includes(query));
            if (line >= 0) entries.push({ ...item, line: line + 1, excerpt: lines[line].trim().slice(0, 180) });
          } catch {}
        }
      }
    }
    return {
      entries,
      limited: queue.length > 0 || visited >= 2000 || entries.length >= 100 || bytes >= 8 * 1024 * 1024,
    };
  }
  return { resolve, list, read, search };
}
module.exports = { createProjectFiles, referencePath, allowed, within, imageType };
