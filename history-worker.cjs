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
function providerRoots(provider){
  const base=provider==='codex'?(!workerData?.home&&process.env.CODEX_HOME)||path.join(os.homedir(),'.codex'):(!workerData?.home&&process.env.CLAUDE_CONFIG_DIR)||path.join(os.homedir(),'.claude');
  return (provider==='codex'?['sessions','archived_sessions']:['projects']).map(name=>path.resolve(base,name));
}
function providerFiles(provider, limit = 20) {
  const files = [], queue = providerRoots(provider).filter(existsSync).map(dir=>({dir,depth:0}));
  while (queue.length && files.length < 20000) {
    const { dir, depth } = queue.shift(); if (depth > 6) continue;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'subagents') queue.push({ dir: full, depth: depth + 1 });
      else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.jsonl.zst'))) { try { files.push({ file: full, modified: statSync(full).mtimeMs }); } catch {} }
    }
  }
  return files.sort((a, b) => b.modified - a.modified).slice(0, limit);
}
function parseProviderTranscriptUncached(provider, file) {
  const resolved = path.resolve(file);
  if (!providerRoots(provider).some(base=>resolved.startsWith(base + path.sep)) || !existsSync(resolved)) throw new Error('Transcript is outside the provider history folder.');
  const stat = statSync(resolved); if (!stat.isFile() || stat.size > 8_000_000) throw new Error('Transcript is too large to open.');
  const bytes = require('node:fs').readFileSync(resolved);
  let raw;
  if (resolved.endsWith('.zst')) {
    const zlib = require('node:zlib');
    if (!zlib.zstdDecompressSync) throw new Error('This Electron runtime cannot read compressed Codex archives.');
    raw = zlib.zstdDecompressSync(bytes, { maxOutputLength: 32_000_000 }).toString('utf8');
  } else raw = bytes.toString('utf8');
  return require('./transcript-import').jsonl(provider,raw,{id:createHash('sha256').update(resolved).digest('hex'),updatedAt:stat.mtimeMs});
}
function listProviderHistory(provider, query = '', limit=20) {
  return providerFiles(provider,limit).map(({ file }) => { try { const item = parseProviderTranscript(provider, file); if(query && !(item.title+' '+item.turns.map(turn=>turn.content).join(' ')).toLowerCase().includes(query))return null; return { id: item.id, title: item.title, provider, cwd: item.cwd, updatedAt: item.updatedAt, turnCount: item.turns.length, sessionId: item.sessionId, truncated:item.truncated,originalTurnCount:item.originalTurnCount,searchText: item.turns.map(turn => turn.content).join(' ').slice(-2500) }; } catch { return null; } }).filter(item => item && item.turnCount);
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

function readImportFile(file){
  if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Choose a transcript file.');
  const stat=statSync(file);if(!stat.isFile()||stat.size>32000000)throw Error('Choose a transcript or export under 32 MB.');
  const bytes=require('node:fs').readFileSync(file),raw=file.endsWith('.zst')?require('node:zlib').zstdDecompressSync(bytes,{maxOutputLength:32000000}).toString('utf8'):bytes.toString('utf8');
  let chats;
  if(/\.json$/i.test(file)){chats=require('./transcript-import').claudeExport(raw);try{const projectsFile=path.join(path.dirname(file),'projects.json');if(statSync(projectsFile).size<4000000){const data=JSON.parse(require('node:fs').readFileSync(projectsFile,'utf8'));if(Array.isArray(data)){const names=new Map(data.filter(row=>row&&typeof row.uuid==='string'&&typeof row.name==='string').map(row=>[row.uuid,row.name]));for(const chat of chats)if(names.has(chat.workspaceId))chat.workspaceName=names.get(chat.workspaceId);}}}catch{}}
  else{
    let provider='';for(const line of raw.replace(/^\uFEFF/,'').split(/\r?\n/).slice(0,100)){try{const row=JSON.parse(line);if(row.type==='session_meta'||row.type==='response_item'){provider='codex';break;}if(['user','assistant'].includes(row.type)&&row.message){provider='claude';break;}}catch{}}
    if(!provider)throw Error('This file is not a recognized Codex or Claude Code transcript.');
    chats=[require('./transcript-import').jsonl(provider,raw,{id:createHash('sha256').update(raw).digest('hex'),updatedAt:stat.mtimeMs})];
  }
  if(!chats.some(chat=>chat.turns.length))throw Error('No user or assistant messages were found in this file.');return chats;
}

parentPort.on('message', async ({ id, method, args }) => {
  try {
    let value;
    if(method==='catalog'){if(!['codex','claude'].includes(args.provider))throw Error('Choose a provider.');const roots=providerRoots(args.provider);value=require('./provider-catalog').catalog({provider:args.provider,base:path.dirname(roots[0]),roots,files:providerFiles(args.provider,20000),parse:parseProviderTranscript});}
    else if (method === 'list') {if(!['codex','claude'].includes(args.provider))throw Error('Choose a provider.');value = listProviderHistory(args.provider, typeof args.query==='string'?args.query.toLowerCase().slice(0,200):'',Math.max(1,Math.min(1000,Number(args.limit)||20)));}
    else if(method==='import-file')value=readImportFile(args.file);
    else if (method === 'search') value = await findReferencedProviderHistory(args.prompt);
    else if (method === 'read') {
      if (!['codex', 'claude'].includes(args.provider) || !/^[a-f0-9]{64}$/.test(args.id)) throw Error('Invalid provider history selection.');
      const file = providerFiles(args.provider, 20000).find(item => createHash('sha256').update(path.resolve(item.file)).digest('hex') === args.id)?.file;
      if (!file) throw Error('Provider transcript could not be found. It may have been moved or compressed.');
      value = parseProviderTranscript(args.provider, file);const named=require('./provider-catalog').catalog({provider:args.provider,base:path.dirname(providerRoots(args.provider)[0]),roots:providerRoots(args.provider),files:[{file,modified:value.updatedAt}],parse:parseProviderTranscript}).chats.find(chat=>chat.id===args.id);if(named)value={...value,title:named.title,workspaceName:named.workspaceName,workspaceId:named.workspaceId};
    } else throw Error('Unknown history operation.');
    parentPort.postMessage({ id, value });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
