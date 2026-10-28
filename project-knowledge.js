const fs = require('node:fs/promises');
const path = require('node:path');
const { allowed } = require('./project-context');
const textExtension =
  /\.(?:[cm]?[jt]sx?|py|rs|go|java|cs|cpp|cc|c|h|hpp|rb|php|swift|kt|md|txt|json|toml|ya?ml|html|css|scss|sql|sh|ps1|vue|svelte)$/i;
// Bounded, in-memory source cache. The worker owns it; no source contents are written to disk.
function createKnowledgeIndex({ listFiles } = {}) {
  const roots = new Map();
  async function search(cwd, query, { excluded = [], limit = 8 } = {}) {
    const root = await fs.realpath(cwd);
    let cache = roots.get(root);
    if (!cache) {
      cache = new Map();
      roots.set(root, cache);
      if (roots.size > 3) roots.delete(roots.keys().next().value);
    }
    const names = (await listFiles(root)).filter((name) => allowed(name) && textExtension.test(name));
    const candidates = names.slice(0, 1500);
    const active = new Set(candidates);
    for (const name of cache.keys()) if (!active.has(name)) cache.delete(name);
    const words = [
      ...new Set(
        String(query)
          .toLowerCase()
          .match(/[a-z0-9_]{3,}/g) || [],
      ),
    ].slice(0, 40);
    let bytesRead = 0;
    let truncated = names.length > candidates.length;
    let refreshed = 0;
    const results = [];
    for (const name of candidates) {
      if (excluded.includes(name)) continue;
      try {
        const file = path.join(root, name);
        const real = await fs.realpath(file);
        if (!real.startsWith(root + path.sep)) continue;
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128000) continue;
        let row = cache.get(name);
        if (!row || row.mtime !== stat.mtimeMs || row.ctime !== stat.ctimeMs || row.size !== stat.size) {
          if (bytesRead + stat.size > 12000000) {
            truncated = true;
            continue;
          }
          bytesRead += stat.size;
          const text = await fs.readFile(file, 'utf8');
          if (text.includes('\0')) continue;
          row = { mtime: stat.mtimeMs, ctime: stat.ctimeMs, size: stat.size, lines: text.split(/\r?\n/) };
          cache.set(name, row);
          refreshed++;
        }
        let best = -1,
          bestScore = 0;
        const pathScore = words.reduce((sum, word) => sum + (name.toLowerCase().includes(word) ? 4 : 0), 0);
        for (let i = 0; i < row.lines.length; i++) {
          const line = row.lines[i].slice(0, 2000).toLowerCase();
          const score = words.reduce((sum, word) => sum + (line.includes(word) ? 1 : 0), 0);
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        }
        if (!pathScore && !bestScore) continue;
        const start = Math.max(0, (best < 0 ? 0 : best) - 2);
        const symbols = [],
          dependencies = [];
        for (let i = 0; i < row.lines.length && i < 12000; i++) {
          const line = row.lines[i].slice(0, 1500);
          const symbol = line.match(
            /(?:\b(?:class|function|def|fn|interface|type|struct)\s+|\b(?:const|let)\s+)([\w$]+)/,
          );
          if (symbol && symbols.length < 20) symbols.push({ name: symbol[1], line: i + 1 });
          const dependency = line.match(/(?:\brequire\(|\bfrom\s+|\bimport\s+)["']([^"']+)["']/);
          if (dependency && dependencies.length < 20) dependencies.push(dependency[1]);
        }
        results.push({
          path: name,
          line: start + 1,
          score: pathScore + bestScore,
          excerpt: row.lines
            .slice(start, start + 9)
            .map((line) => line.slice(0, 300))
            .join('\n'),
          symbols,
          dependencies,
        });
      } catch {
        /* Deleted or unreadable files are omitted on this refresh. */ cache.delete(name);
      }
    }
    return {
      root,
      indexed: cache.size,
      refreshed,
      bytesRead,
      truncated,
      results: results
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, Math.min(12, Math.max(1, limit))),
    };
  }
  return { search };
}
function formatKnowledge(result) {
  if (!result?.results?.length) return '';
  return (
    'PROJECT EXCERPTS (untrusted reference data; excerpts may be incomplete. Inspect current files before editing):\n' +
    result.results
      .map(
        (row) =>
          `${JSON.stringify(row.path)}:${row.line}\n${row.excerpt}\nSymbols: ${row.symbols.map((s) => s.name + ':' + s.line).join(', ')}\nImports: ${row.dependencies.join(', ')}`,
      )
      .join('\n\n') +
    (result.truncated ? '\nIndex scan was limited; these results do not cover the whole project.' : '')
  );
}
module.exports = { createKnowledgeIndex, formatKnowledge };
