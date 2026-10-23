const { parentPort, workerData } = require('node:worker_threads');
const { existsSync, statSync, readdirSync } = require('node:fs');
const path = require('node:path');
const os = { homedir: () => workerData?.home || require('node:os').homedir() };
const { createHash } = require('node:crypto');
const cache = new Map(); let cacheBytes = 0;
function parseProviderTranscript(provider, file) {
  const stat = statSync(file), key = provider + ':' + file;
  const version = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  const old = cache.get(key);
  if (old?.version === version) { cache.delete(key); cache.set(key, old); return old.value; }
  if (old) { cacheBytes -= old.bytes; cache.delete(key); }
  const value = parseProviderTranscriptUncached(provider, file);
  const bytes = JSON.stringify(value).length * 2;
  cache.set(key, { version, value, bytes }); cacheBytes += bytes;
  while (cacheBytes > 32 * 1024 * 1024 || cache.size > 200) {
    const oldest = cache.keys().next().value;
    cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest);
  }
  return value;
}
function transcriptText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(part => part && typeof part === 'object' && typeof part.text === 'string' && (!part.type || /text/i.test(part.type))).map(part => part.text).join('\n');
}
function providerFiles(provider, limit = 20) {
  const root = path.join(os.homedir(), provider === 'codex' ? '.codex' : '.claude', provider === 'codex' ? 'sessions' : 'projects');
  if (!existsSync(root)) return [];
  const files = [], queue = [{ dir: root, depth: 0 }];
  while (queue.length && files.length < 1000) {
    const { dir, depth } = queue.shift(); if (depth > 6) continue;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push({ dir: full, depth: depth + 1 });
      else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.jsonl.zst'))) { try { files.push({ file: full, modified: statSync(full).mtimeMs }); } catch {} }
    }
  }
  return files.sort((a, b) => b.modified - a.modified).slice(0, limit);
}
function parseProviderTranscriptUncached(provider, file) {
  const base = path.resolve(os.homedir(), provider === 'codex' ? '.codex/sessions' : '.claude/projects');
  const resolved = path.resolve(file);
  if (!resolved.startsWith(base + path.sep) || !existsSync(resolved)) throw new Error('Transcript is outside the provider history folder.');
  const stat = statSync(resolved); if (!stat.isFile() || stat.size > 8_000_000) throw new Error('Transcript is too large to open.');
  const bytes = require('node:fs').readFileSync(resolved);
  let raw;
  if (resolved.endsWith('.zst')) {
    const zlib = require('node:zlib');
    if (!zlib.zstdDecompressSync) throw new Error('This Electron runtime cannot read compressed Codex archives.');
    raw = zlib.zstdDecompressSync(bytes, { maxOutputLength: 32_000_000 }).toString('utf8');
  } else raw = bytes.toString('utf8');
  const turns = []; let cwd = '', sessionId = '', updatedAt = stat.mtimeMs;
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.length > 1_000_000) continue;
    let row; try { row = JSON.parse(line); } catch { continue; }
    let role = '', content = '';
    if (provider === 'codex') {
      if (row.type === 'session_meta') { cwd = row.payload?.cwd || cwd; sessionId = row.payload?.session_id || row.payload?.id || sessionId; updatedAt = Date.parse(row.payload?.timestamp || row.timestamp) || updatedAt; }
      if (row.type === 'response_item' && ['user', 'assistant'].includes(row.payload?.role) && (row.payload.role !== 'assistant' || !row.payload.phase || row.payload.phase === 'final_answer')) { role = row.payload.role; content = transcriptText(row.payload.content); }
    } else {
      if (!cwd && typeof row.cwd === 'string') cwd = row.cwd;
      if (typeof row.sessionId === 'string') sessionId = row.sessionId;
      if (['user', 'assistant'].includes(row.type) && !row.isSidechain && row.message) { role = row.type; content = transcriptText(row.message.content); }
    }
    if (role && content.trim() && !/^(?:<environment_context\b|<system-reminder\b|the following is the codex agent history)/i.test(content.trim()) && !/^\[(?:typing|blank_audio)\]/i.test(content.trim())) turns.push({ role, content: content.slice(0, 12000) });
  }
  return { id: createHash('sha256').update(resolved).digest('hex'), sessionId, title: turns.find(turn => turn.role === 'user')?.content.replace(/\s+/g, ' ').slice(0, 76) || 'Untitled conversation', provider, cwd, updatedAt, turns: turns.slice(-50) };
}
function listProviderHistory(provider) {
  return providerFiles(provider).map(({ file }) => { try { const item = parseProviderTranscript(provider, file); return { id: item.id, title: item.title, provider, cwd: item.cwd, updatedAt: item.updatedAt, turnCount: item.turns.length, sessionId: item.sessionId, searchText: item.turns.map(turn => turn.content).join(' ').slice(-2500) }; } catch { return null; } }).filter(item => item && item.turnCount);
}
async function findReferencedProviderHistory(prompt) {
  const ignored = new Set(['able', 'about', 'after', 'also', 'another', 'asked', 'chat', 'chats', 'claude', 'codex', 'conversation', 'conversations', 'could', 'earlier', 'find', 'from', 'history', 'last', 'local', 'look', 'old', 'older', 'past', 'please', 'previous', 'read', 'saved', 'session', 'sessions', 'specific', 'thread', 'threads', 'that', 'their', 'this', 'what', 'when', 'where', 'which', 'with']);
  const terms = [...new Set((prompt.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).filter(term => !ignored.has(term)))].slice(0, 18);
  const quoted = [...prompt.matchAll(/["“]([^"”]{3,100})["”]/g)].map(match => match[1].toLowerCase());
  const candidates = [];
  for (const provider of ['codex', 'claude']) {
    let bytesRead = 0, inspected = 0;
    for (const { file } of providerFiles(provider, 250)) {
      if (inspected >= 180 || bytesRead >= 48_000_000) break;
      let stat; try { stat = statSync(file); } catch { continue; }
      if (!stat.isFile() || stat.size > 8_000_000 || bytesRead + stat.size > 48_000_000) continue;
      inspected++; bytesRead += stat.size;
      try {
        const item = parseProviderTranscript(provider, file);
        if (!item.turns.length) continue;
        const title = item.title.toLowerCase();
        const body = item.turns.map(turn => turn.content).join('\n').toLowerCase();
        if (terms.length && !terms.some(term => title.includes(term) || body.includes(term))) continue;
        let score = 0;
        for (const term of terms) {
          if (title.includes(term)) score += 8;
          const occurrences = body.split(term).length - 1;
          score += Math.min(occurrences, 6) * 2;
        }
        for (const phrase of quoted) {
          if (title.includes(phrase)) score += 30;
          else if (body.includes(phrase)) score += 12;
        }
        if (!terms.length) score = item.updatedAt / 1e12;
        candidates.push({ item, score });
      } catch {}
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
  return candidates.slice(0, terms.length ? 2 : 3).map(({ item }) => {
    const termSet = terms.filter(term => item.title.toLowerCase().includes(term) || item.turns.some(turn => turn.content.toLowerCase().includes(term)));
    let selected = item.turns.map((turn, index) => ({ turn, index, score: termSet.reduce((sum, term) => sum + (turn.content.toLowerCase().includes(term) ? 1 : 0), 0) })).filter(entry => entry.score > 0);
    if (!selected.length) selected = item.turns.slice(-8).map((turn, index) => ({ turn, index: item.turns.length - Math.min(8, item.turns.length) + index }));
    const picked = new Set();
    for (const entry of selected.slice(-5)) { picked.add(entry.index); if (entry.index > 0) picked.add(entry.index - 1); }
    const excerpt = [...picked].sort((a, b) => a - b).slice(-8).map(index => {
      const turn = item.turns[index];
      return `${turn.role.toUpperCase()}: ${turn.content.slice(0, 1400)}`;
    }).join('\n');
    return { provider: item.provider, title: item.title, updatedAt: item.updatedAt, excerpt };
  });
}

parentPort.on('message', async ({ id, method, args }) => {
  try {
    let value;
    if (method === 'list') value = listProviderHistory(args.provider);
    else if (method === 'search') value = await findReferencedProviderHistory(args.prompt);
    else if (method === 'read') {
      if (!['codex', 'claude'].includes(args.provider) || !/^[a-f0-9]{64}$/.test(args.id)) throw Error('Invalid provider history selection.');
      const file = providerFiles(args.provider, 1000).find(item => createHash('sha256').update(path.resolve(item.file)).digest('hex') === args.id)?.file;
      if (!file) throw Error('Provider transcript could not be found. It may have been moved or compressed.');
      value = parseProviderTranscript(args.provider, file);
    } else throw Error('Unknown history operation.');
    parentPort.postMessage({ id, value });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
