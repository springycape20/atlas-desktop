const path = require('node:path').posix;
const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.py', '/index.js', '/index.ts', '/__init__.py'];
function maskSource(text) {
  return text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (value) => value.replace(/[^\n]/g, ' '),
  );
}
function analyzeRecords(records, { file = '', symbol = '' } = {}) {
  if (symbol && !/^[A-Za-z_$][\w$]{0,99}$/.test(symbol)) throw Error('Enter one symbol name, such as renderPage.');
  file = String(file).replaceAll('\\', '/').replace(/^\.\//, '');
  const names = new Set(records.map((row) => row.path)),
    nodes = new Map();
  for (const row of records) {
    const definitions = [],
      references = [],
      imports = [],
      masked = maskSource(row.text),
      lines = masked.split('\n'),
      sourceLines = row.text.split('\n');
    for (const [i, line] of lines.entries()) {
      const match = line.match(
        /\b(?:async\s+)?(?:function|class|def|fn|interface|type|struct|const|let)\s+([A-Za-z_$][\w$]*)/,
      );
      if (match && definitions.length < 100) definitions.push({ name: match[1], line: i + 1 });
      if (
        symbol &&
        new RegExp('(?<![\\w$])' + symbol.replaceAll('$', '\\$') + '(?![\\w$])').test(line) &&
        references.length < 100
      )
        references.push({
          line: i + 1,
          definition: match?.[1] === symbol,
          excerpt: sourceLines[i].trim().slice(0, 200),
        });
    }
    for (const match of row.text.matchAll(/(?:\brequire\s*\(\s*|\bfrom\s+|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) {
      if (!masked.slice(match.index, match.index + match[0].length).trim() || !match[1].startsWith('.')) continue;
      const base = path.normalize(path.join(path.dirname(row.path), match[1]));
      const resolved = extensions.map((ext) => base + ext).find((name) => names.has(name));
      if (resolved && !imports.includes(resolved)) imports.push(resolved);
    }
    // Python module imports are resolved against project-relative package paths when unambiguous.
    for (const match of row.text.matchAll(/^\s*(?:from|import)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/gm)) {
      const module = match[1].replaceAll('.', '/');
      const resolved = [module + '.py', module + '/__init__.py'].find((name) => names.has(name));
      if (resolved && !imports.includes(resolved)) imports.push(resolved);
    }
    nodes.set(row.path, { path: row.path, definitions, references, imports });
  }
  const focus = file ? nodes.get(file) : null;
  if (file && !focus) throw Error('File is excluded, unsupported or outside the bounded index.');
  const targets = new Set(
    file
      ? [file]
      : [...nodes.values()].filter((row) => row.definitions.some((def) => def.name === symbol)).map((row) => row.path),
  );
  const affected = new Map(),
    queue = [...targets].map((name) => [name, 0]);
  while (queue.length && affected.size < 100) {
    const [name, depth] = queue.shift();
    if (depth >= 4) continue;
    for (const row of nodes.values())
      if (row.imports.includes(name) && !targets.has(row.path) && !affected.has(row.path)) {
        affected.set(row.path, depth + 1);
        queue.push([row.path, depth + 1]);
      }
  }
  const isTest = (name) => /(?:^|\/)(?:tests?|__tests__)\//i.test(name) || /(?:[._-](?:test|spec))\./i.test(name);
  const stems = [...targets].map((name) =>
    path
      .basename(name)
      .replace(/\.[^.]+$/, '')
      .toLowerCase(),
  );
  return {
    file,
    symbol,
    indexed: nodes.size,
    modules: [...nodes.values()].slice(0, 300).map((row) => ({
      path: row.path,
      imports: row.imports,
      definitions: row.definitions.slice(0, 15),
      test: isTest(row.path),
    })),
    definitions: [...nodes.values()]
      .flatMap((row) =>
        row.definitions.filter((def) => !symbol || def.name === symbol).map((def) => ({ path: row.path, ...def })),
      )
      .slice(0, 100),
    references: symbol
      ? [...nodes.values()].flatMap((row) => row.references.map((ref) => ({ path: row.path, ...ref }))).slice(0, 150)
      : [],
    imports: focus?.imports || [],
    affected: [...affected].map(([path, distance]) => ({ path, distance })),
    tests: [...nodes.keys()]
      .filter(
        (name) =>
          isTest(name) &&
          (affected.has(name) || stems.some((stem) => path.basename(name).toLowerCase().includes(stem))),
      )
      .slice(0, 50),
    note: 'Static import and lexical symbol hints, not a full language server. Dynamic imports, aliases, generated code and runtime behaviour may be missed. Inspect affected files and run tests.',
  };
}
module.exports = { analyzeRecords, maskSource };
