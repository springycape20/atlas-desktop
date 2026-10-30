const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { spawn } = require('node:child_process');

// Servers may rewrite file URIs (file:///C:/ as file:///c%3A/), so compare them as paths.
function documentKey(uri) {
  try {
    const file = fileURLToPath(uri);
    return process.platform === 'win32' ? file.toLowerCase() : file;
  } catch {
    return uri;
  }
}
// A deliberately small stdio LSP client. Project servers run only after native approval.
function createLanguageServer({ directory, files, approve, spawnProcess = spawn, timeoutMs = 10000 }) {
  const guard = require('./project-root').createProjectRootGuard();
  const configFile = path.join(directory, 'language-servers.json');
  const store = require('./atomic-store').createAtomicStore(configFile);
  let live,
    serial = Promise.resolve();
  async function configs() {
    return JSON.parse(
      await fs.readFile(configFile, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '{}';
        throw error;
      }),
    );
  }
  function stop(reason = 'Language server stopped.') {
    const current = live;
    live = null;
    if (!current) return;
    clearTimeout(current.idle);
    for (const row of current.pending.values()) {
      clearTimeout(row.timer);
      row.reject(Error(reason));
    }
    current.pending.clear();
    current.child.kill();
  }
  function send(current, value) {
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...value }));
    current.child.stdin.write(Buffer.concat([Buffer.from('Content-Length: ' + payload.length + '\r\n\r\n'), payload]));
  }
  function request(current, method, params) {
    return new Promise((resolve, reject) => {
      const id = ++current.next;
      const timer = setTimeout(() => {
        current.pending.delete(id);
        reject(Error('Language server request timed out: ' + method));
      }, timeoutMs);
      current.pending.set(id, { resolve, reject, timer });
      send(current, { id, method, params });
    });
  }
  function receive(current, part) {
    current.buffer = Buffer.concat([current.buffer, part]);
    if (current.buffer.length > 4 * 1048576) {
      stop('Language server message limit exceeded.');
      return;
    }
    try {
      while (current.buffer.length) {
        const end = current.buffer.indexOf('\r\n\r\n');
        if (end < 0) {
          if (current.buffer.length > 8192) throw Error('Invalid language server header.');
          return;
        }
        const match = current.buffer
          .subarray(0, end)
          .toString('ascii')
          .match(/^Content-Length:\s*(\d+)\s*$/im);
        if (!match || Number(match[1]) > 2 * 1048576) throw Error('Invalid language server message length.');
        const size = Number(match[1]);
        if (current.buffer.length < end + 4 + size) return;
        const message = JSON.parse(current.buffer.subarray(end + 4, end + 4 + size).toString('utf8'));
        current.buffer = current.buffer.subarray(end + 4 + size);
        if (message.method === 'textDocument/publishDiagnostics' && typeof message.params?.uri === 'string') {
          const key = documentKey(message.params.uri);
          current.diagnostics.delete(key); // Keep the eviction below oldest-report-first.
          current.diagnostics.set(
            key,
            (message.params.diagnostics || []).slice(0, 200).map((row) => ({
              range: row.range,
              severity: row.severity,
              message: String(row.message || '').slice(0, 2000),
            })),
          );
          while (current.diagnostics.size > 20) current.diagnostics.delete(current.diagnostics.keys().next().value);
        } else if (message.method && message.id !== undefined) {
          // Server requests cannot edit files, run commands or open UI through this adapter.
          if (message.method === 'workspace/configuration')
            send(current, { id: message.id, result: (message.params?.items || []).slice(0, 100).map(() => null) });
          else send(current, { id: message.id, error: { code: -32601, message: 'Client operation not supported' } });
        } else if (message.id !== undefined) {
          const pending = current.pending.get(message.id);
          if (!pending) continue;
          current.pending.delete(message.id);
          clearTimeout(pending.timer);
          if (message.error) pending.reject(Error('Language server: ' + String(message.error.message).slice(0, 500)));
          else pending.resolve(message.result);
        }
      }
    } catch (error) {
      stop(error.message);
    }
  }
  async function start(cwd, config) {
    if (live?.cwd === cwd) return live;
    stop();
    const executable = await fs.realpath(config.command);
    if (
      !path.isAbsolute(config.command) ||
      !(await fs.stat(executable)).isFile() ||
      (process.platform === 'win32' && !/\.exe$/i.test(executable))
    )
      throw Error(
        'Choose an installed executable by absolute path (an .exe on Windows). Use node.exe plus a server script argument when needed.',
      );
    if (
      !(await approve(
        'Start this project language server?',
        executable +
          '\nArguments: ' +
          JSON.stringify(config.args) +
          '\nProject: ' +
          cwd +
          '\nThe server can read and change files with your account permissions. Saving settings alone runs nothing.',
      ))
    )
      throw Error('Language server start cancelled.');
    const child = spawnProcess(executable, config.args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const current = {
      cwd,
      child,
      pending: new Map(),
      next: 0,
      buffer: Buffer.alloc(0),
      diagnostics: new Map(),
      documents: new Map(),
      stderr: '',
    };
    live = current;
    child.stdout.on('data', (part) => {
      if (live === current) receive(current, part);
    });
    child.stderr.on('data', (part) => {
      current.stderr = (current.stderr + part.toString()).slice(-2000);
    });
    child.stdin.on('error', () => {
      if (live === current) stop('Language server input closed.');
    });
    child.once('error', (error) => {
      if (live === current) stop(error.message);
    });
    child.once('exit', () => {
      if (live === current) stop('Language server exited.');
    });
    try {
      const initialized = await request(current, 'initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(cwd).href,
        capabilities: {
          general: { positionEncodings: ['utf-16'] },
          textDocument: { publishDiagnostics: {}, definition: { linkSupport: true }, references: {} },
        },
        workspaceFolders: [{ uri: pathToFileURL(cwd).href, name: path.basename(cwd) }],
      });
      if (initialized?.capabilities?.positionEncoding && initialized.capabilities.positionEncoding !== 'utf-16')
        throw Error('This adapter requires UTF-16 language-server positions.');
      current.capabilities = initialized?.capabilities || {};
      send(current, { method: 'initialized', params: {} });
      return current;
    } catch (error) {
      stop();
      throw error;
    }
  }
  async function action(input = {}) {
    if (input.action === 'stop') {
      stop();
      return { running: false };
    }
    const cwd = await guard.assertProject(input.cwd),
      saved = await configs();
    if (input.action === 'settings')
      return { config: saved[cwd] || { command: '', args: [], languageId: '' }, running: live?.cwd === cwd };
    if (input.action === 'save') {
      const config = input.config || {};
      if (
        typeof config.command !== 'string' ||
        !path.isAbsolute(config.command) ||
        config.command.length > 1000 ||
        !Array.isArray(config.args) ||
        config.args.length > 30 ||
        config.args.some((arg) => typeof arg !== 'string' || arg.length > 2000) ||
        !/^[\w+-]{1,50}$/.test(config.languageId || '')
      )
        throw Error('Enter an absolute executable, up to 30 argument strings and a language ID.');
      if (!saved[cwd] && Object.keys(saved).length >= 50)
        throw Error('Up to 50 project language servers can be saved.');
      saved[cwd] = { command: config.command, args: config.args, languageId: config.languageId };
      if (live?.cwd === cwd) stop();
      await store.save(saved);
      await store.flush();
      return { saved: true };
    }
    if (!['definition', 'references', 'diagnostics'].includes(input.action))
      throw Error('Unknown language-server action.');
    if (!saved[cwd]) throw Error('Configure an installed language server for this project first.');
    const target = await files.resolve(cwd, input.path),
      stat = await fs.stat(target.actual);
    if (stat.size > 256000) throw Error('Language-server files are limited to 256 KB.');
    const handle = await fs.open(target.actual, 'r');
    let text;
    try {
      const opened = await handle.stat(),
        buffer = Buffer.alloc(256001);
      if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev)
        throw Error('File changed. Retry the query.');
      let offset = 0;
      while (offset < buffer.length) {
        const part = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!part.bytesRead) break;
        offset += part.bytesRead;
      }
      const after = await handle.stat();
      if (offset > 256000 || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs)
        throw Error('File changed or exceeded 256 KB.');
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
      await files.resolve(cwd, input.path);
    } finally {
      await handle.close();
    }
    if (text.includes('\0')) throw Error('Choose a UTF-8 text file.');
    const lines = text.split(/\r?\n/),
      line = Number(input.line || 1),
      column = Number(input.column || 1);
    if (
      !Number.isInteger(line) ||
      line < 1 ||
      line > lines.length ||
      !Number.isInteger(column) ||
      column < 1 ||
      column > lines[line - 1].length + 1
    )
      throw Error('Choose an existing line and column (starting at 1).');
    const current = await start(cwd, saved[cwd]),
      uri = pathToFileURL(target.actual).href;
    await files.resolve(cwd, input.path);
    clearTimeout(current.idle);
    current.idle = setTimeout(() => {
      if (live === current) stop();
    }, 120000).unref();
    const previous = current.documents.get(uri);
    if (!previous)
      send(current, {
        method: 'textDocument/didOpen',
        params: { textDocument: { uri, languageId: saved[cwd].languageId, version: 1, text } },
      });
    else if (previous.text !== text) {
      // Close/open supports servers that request incremental synchronization, without fabricating edits.
      current.diagnostics.delete(documentKey(uri));
      send(current, { method: 'textDocument/didClose', params: { textDocument: { uri } } });
      send(current, {
        method: 'textDocument/didOpen',
        params: { textDocument: { uri, languageId: saved[cwd].languageId, version: previous.version + 1, text } },
      });
    }
    current.documents.set(uri, { text, version: (previous?.version || 0) + 1 });
    while (current.documents.size > 10) {
      const old = current.documents.keys().next().value;
      send(current, { method: 'textDocument/didClose', params: { textDocument: { uri: old } } });
      current.documents.delete(old);
    }
    if (input.action === 'diagnostics') {
      let rows;
      if (current.capabilities.diagnosticProvider)
        rows = (await request(current, 'textDocument/diagnostic', { textDocument: { uri } }))?.items;
      else {
        await new Promise((resolve) => setTimeout(resolve, 350));
        rows = current.diagnostics.get(documentKey(uri));
      }
      return {
        kind: 'diagnostics',
        path: input.path,
        rows: (rows || []).slice(0, 200).map((row) => ({
          line: (row.range?.start?.line || 0) + 1,
          column: (row.range?.start?.character || 0) + 1,
          severity: row.severity,
          message: String(row.message || '').slice(0, 2000),
        })),
        note: rows
          ? 'Language-server diagnostics; results may update as analysis finishes.'
          : 'No diagnostic report received yet. Refresh after analysis finishes; this does not prove the file is error-free.',
      };
    }
    const value = await request(
      current,
      'textDocument/' + (input.action === 'definition' ? 'definition' : 'references'),
      {
        textDocument: { uri },
        position: { line: line - 1, character: column - 1 },
        ...(input.action === 'references' ? { context: { includeDeclaration: true } } : {}),
      },
    );
    const rows = [];
    for (const row of (Array.isArray(value) ? value : value ? [value] : []).slice(0, 200)) {
      try {
        const absolute = fileURLToPath(row.targetUri || row.uri),
          relative = path.relative(cwd, absolute);
        await files.resolve(cwd, relative);
        const range = row.targetSelectionRange || row.range;
        rows.push({
          path: relative.split(path.sep).join('/'),
          line: (range?.start?.line || 0) + 1,
          column: (range?.start?.character || 0) + 1,
        });
      } catch {
        /* External and denied locations are not exposed by ATLAS. */
      }
    }
    return {
      kind: input.action,
      rows,
      note: 'Up to 200 locations inside this project; external and denied paths are omitted.',
    };
  }
  return {
    action(input) {
      const next = serial.then(() => action(input));
      serial = next.catch(() => {});
      return next;
    },
    dispose: stop,
  };
}
module.exports = { createLanguageServer };
