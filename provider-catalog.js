const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { jsonl } = require('./transcript-import');
const metadataCache = new Map();
const digest = (value) => createHash('sha256').update(value).digest('hex');
function json(file, limit = 4000000) {
  try {
    if (fs.statSync(file).size > limit) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function metadata(provider, base) {
  const cacheKey = provider + ':' + base;
  let stamp = '';
  if (provider === 'codex') {
    try {
      stamp = fs
        .readdirSync(base)
        .filter((name) => /^(?:state_\d+\.sqlite(?:-wal)?|session_index\.jsonl|\.codex-global-state\.json)$/.test(name))
        .map((name) => {
          const stat = fs.statSync(path.join(base, name));
          return name + ':' + stat.mtimeMs + ':' + stat.size;
        })
        .join('|');
    } catch {}
    const cached = metadataCache.get(cacheKey);
    if (cached && cached.stamp === stamp && Date.now() - cached.at < 5000) return cached.value;
  }
  const threads = new Map(),
    workspaces = new Map(),
    warnings = [];
  if (provider === 'codex') {
    try {
      const file = path.join(base, 'session_index.jsonl');
      if (fs.statSync(file).size <= 16000000)
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
          try {
            const row = JSON.parse(line);
            if (row.id && row.thread_name)
              threads.set(row.id, {
                sessionId: row.id,
                title: row.thread_name,
                nativeName: true,
                updatedAt: Date.parse(row.updated_at) || 0,
              });
          } catch {}
        }
    } catch {}
    try {
      const file = fs
        .readdirSync(base)
        .filter((name) => /^state_\d+\.sqlite$/.test(name))
        .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))[0];
      if (file) {
        const { DatabaseSync } = require('node:sqlite'),
          db = new DatabaseSync(path.join(base, file), { readOnly: true });
        try {
          try {
            for (const row of db
              .prepare('SELECT p.id,p.name,r.path FROM projects p LEFT JOIN project_roots r ON p.id=r.project_id')
              .all())
              workspaces.set(row.path || row.id, { id: row.id, name: row.name, cwd: row.path || '', provider });
          } catch {}
          const columns = new Set(
              db
                .prepare('PRAGMA table_info(threads)')
                .all()
                .map((row) => row.name),
            ),
            wanted = [
              'id',
              'name',
              'title',
              'rollout_path',
              'cwd',
              'project_id',
              'source',
              'thread_source',
              'originator',
              'archived',
              'updated_at_ms',
              'updated_at',
            ].filter((name) => columns.has(name));
          for (const row of db.prepare('SELECT ' + wanted.join(',') + ' FROM threads LIMIT 20001').all()) {
            if (threads.size >= 20000) {
              warnings.push('Only the first 20,000 indexed Codex chats could be listed.');
              break;
            }
            if (!row.id) continue;
            const prior = threads.get(row.id) || {},
              project = [...workspaces.values()].find((project) => project.id === row.project_id);
            threads.set(row.id, {
              ...prior,
              sessionId: row.id,
              title: row.name || prior.title || row.title || '',
              nativeName: Boolean(row.name || prior.title || row.title),
              file: row.rollout_path,
              cwd: row.cwd || '',
              workspaceId: row.project_id || '',
              workspaceName: project?.name || '',
              archived: Boolean(row.archived),
              internal:
                row.originator === 'atlas' || /subagent/i.test((row.source || '') + ' ' + (row.thread_source || '')),
              updatedAt: row.updated_at_ms || Number(row.updated_at) * 1000 || prior.updatedAt || 0,
            });
          }
        } finally {
          db.close();
        }
      }
    } catch {
      warnings.push(
        'Codex database metadata could not be read; session names and transcripts are used where available.',
      );
    }
    const state = json(path.join(base, '.codex-global-state.json')) || {},
      labels = state['electron-workspace-root-labels'] || {};
    for (const folder of state['electron-saved-workspace-roots'] || [])
      if (typeof folder === 'string' && !workspaces.has(folder))
        workspaces.set(folder, { id: folder, name: labels[folder] || path.basename(folder), cwd: folder, provider });
    const titles = state['thread-titles']?.titles || {};
    for (const [id, title] of Object.entries(titles))
      if (typeof title === 'string') {
        const old = threads.get(id) || { sessionId: id };
        if (!old.nativeName) threads.set(id, { ...old, title, nativeName: true });
      }
  } else {
    try {
      for (const entry of fs.readdirSync(path.join(base, 'projects'), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const index = json(path.join(base, 'projects', entry.name, 'sessions-index.json'));
        for (const row of index?.entries || []) {
          if (!row.sessionId) continue;
          threads.set(row.sessionId, {
            sessionId: row.sessionId,
            title: row.customTitle || row.summary || row.firstPrompt || '',
            nativeName: Boolean(row.customTitle || row.summary),
            file: row.fullPath,
            cwd: row.projectPath || index.originalPath || '',
            workspaceName: row.projectName || index.projectName || '',
            updatedAt: Date.parse(row.modified || row.created) || 0,
            internal: row.isSidechain === true,
          });
        }
      }
    } catch {}
  }
  const value = { threads, workspaces, warnings };
  if (provider === 'codex') metadataCache.set(cacheKey, { stamp, at: Date.now(), value });
  return value;
}
function peek(provider, file, parse) {
  const stat = fs.statSync(file);
  if (file.endsWith('.zst')) return parse(provider, file);
  const fd = fs.openSync(file, 'r');
  try {
    const length = Math.min(stat.size, 65536),
      start = Buffer.alloc(length);
    fs.readSync(fd, start, 0, length, 0);
    let raw = start.toString('utf8');
    if (stat.size > length) {
      const tail = Buffer.alloc(length);
      fs.readSync(fd, tail, 0, length, stat.size - length);
      raw += '\n' + tail.toString('utf8').split('\n').slice(1).join('\n');
    }
    const value = jsonl(provider, raw, { id: digest(path.resolve(file)), updatedAt: stat.mtimeMs });
    return { ...value, turnCount: stat.size > length ? null : value.turns.length };
  } finally {
    fs.closeSync(fd);
  }
}
function catalog({ provider, base, files, roots, parse }) {
  const { threads, workspaces, warnings } = metadata(provider, base),
    chats = [],
    seen = new Set(),
    byFile = new Map();
  if (files.length >= 20000) warnings.push('Transcript discovery reached its 20,000-file limit.');
  const allowed = (file) =>
    typeof file === 'string' &&
    path.isAbsolute(file) &&
    roots.some((root) => path.resolve(file).startsWith(root + path.sep));
  for (const item of threads.values())
    if (allowed(item.file) && fs.existsSync(item.file)) byFile.set(path.resolve(item.file), item);
  const paths = new Map(files.map((row) => [path.resolve(row.file), row]));
  for (const file of byFile.keys())
    if (!paths.has(file))
      try {
        paths.set(file, { file, modified: fs.statSync(file).mtimeMs });
      } catch {}
  for (const { file, modified } of paths.values()) {
    try {
      let value = byFile.get(path.resolve(file));
      if (!value || provider === 'claude') {
        const header = peek(provider, file, parse);
        const named = value || threads.get(header.sessionId) || {};
        value = {
          ...header,
          ...named,
          title: provider === 'claude' && header.nativeName ? header.title : named.title || header.title,
          nativeName: Boolean(named.nativeName || header.nativeName),
        };
      }
      if (value.sessionId) seen.add(value.sessionId);
      const cwd = value.cwd || '',
        workspaceName =
          value.workspaceName ||
          [...workspaces.values()].find((row) => row.cwd && row.cwd.toLowerCase() === cwd.toLowerCase())?.name ||
          cwd.split(/[\\/]/).filter(Boolean).at(-1) ||
          'No workspace';
      const internal =
        value.internal ||
        /[\\/](?:atlas-local-desktop|ATLAS)[\\/]worktrees[\\/]/i.test(cwd) ||
        /^(?:Complete the requested implementation|<external_codex_code_review|You are reviewing ATLAS)/i.test(
          value.title || '',
        );
      if (!value.title && !value.turns?.length) continue;
      const chat = {
        id: digest(path.resolve(file)),
        sessionId: value.sessionId || '',
        provider,
        title: value.title || 'Untitled conversation',
        cwd,
        workspaceName,
        workspaceId: value.workspaceId || cwd,
        updatedAt: value.updatedAt || modified,
        turnCount: value.turnCount ?? null,
        internal: Boolean(internal),
        archived: Boolean(value.archived),
        importable: fs.statSync(file).size <= 8000000,
        availability: 'local',
        nativeName: Boolean(value.nativeName),
      };
      chats.push(chat);
      if (cwd && !workspaces.has(cwd)) workspaces.set(cwd, { id: cwd, name: workspaceName, cwd, provider });
    } catch {}
  }
  for (const item of threads.values())
    if (!seen.has(item.sessionId))
      chats.push({
        ...item,
        id: digest(provider + ':' + item.sessionId),
        provider,
        title: item.title || 'Untitled conversation',
        workspaceName: item.workspaceName || item.cwd?.split(/[\\/]/).at(-1) || 'No workspace',
        turnCount: null,
        importable: false,
        availability: 'metadata-only',
        file: undefined,
      });
  return { chats: chats.sort((a, b) => b.updatedAt - a.updatedAt), workspaces: [...workspaces.values()], warnings };
}
module.exports = { catalog };
