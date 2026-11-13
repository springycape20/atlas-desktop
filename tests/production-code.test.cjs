const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { minifyJavaScript, minifyStyles, prepareProductionCode } = require('../build/production-code.cjs');
const license =
  'MIT License\nCopyright (c) 2026 springycape20\nPermission is hereby granted, free of charge, to any person obtaining a copy';

test('minification preserves shared script globals, exports, function names and third-party notices', async () => {
  const source = `/* Copyright Upstream Author; permission is hereby granted */
    // ordinary implementation detail
    const sharedConfiguration = { enabled: true };
    function reportValue(descriptiveArgument) { const descriptiveLocal = descriptiveArgument + 1; return descriptiveLocal; }
    globalThis.reportValue = reportValue;
    globalThis.result = reportValue(41);
    //# sourceMappingURL=private-source.js.map`;
  const output = await minifyJavaScript(source, license);
  const context = vm.createContext({});
  vm.runInContext(output + '\nglobalThis.shared = sharedConfiguration.enabled;', context);
  assert.equal(context.result, 42);
  assert.equal(context.shared, true);
  assert.equal(context.reportValue.name, 'reportValue');
  assert.match(output, /Copyright Upstream Author/);
  assert.match(output, /Copyright \(c\) 2026 springycape20/);
  assert(!output.includes('descriptiveArgument'));
  assert(!output.includes('ordinary implementation detail'));
  assert(!output.includes('sourceMappingURL'));
});

test('CSS minification preserves custom properties, relative assets and legal comments', () => {
  const output = minifyStyles(
    '/* Copyright Other Author */\n:root { --atlas-colour: #112233; }\n.icon { background: url(assets/icon.png); color: var(--atlas-colour); }',
    license,
  );
  assert.match(output, /Copyright Other Author/);
  assert.match(output, /assets\/icon.png/);
  assert.match(output, /var\(--atlas-colour\)/);
  assert(!output.includes('sourceMappingURL'));
});

test('production staging retains original files and copies the existing Prism bundle exactly', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-production-code-'));
  try {
    await fs.writeFile(path.join(root, 'LICENSE'), license);
    const source =
      'module.exports = function calculateValue(longArgument) { const localValue = longArgument + 2; return localValue; };';
    const prism = '/* Prism upstream MIT notice */\nself.Prism={manual:true};';
    await fs.writeFile(path.join(root, 'main.js'), source);
    await fs.writeFile(path.join(root, 'syntax-highlight.js'), prism);
    await fs.writeFile(path.join(root, 'worker.cjs'), 'module.exports = 42;');
    await fs.writeFile(path.join(root, 'ui.css'), '.button { color: blue; }');
    const result = await prepareProductionCode(root);
    assert.equal(result.sourceMaps, false);
    assert.equal(result.files.length, 4);
    assert.equal(await fs.readFile(path.join(root, 'main.js'), 'utf8'), source);
    assert.equal(await fs.readFile(path.join(root, 'syntax-highlight.js'), 'utf8'), prism);
    assert.equal(await fs.readFile(path.join(root, 'dist/production-code/syntax-highlight.js'), 'utf8'), prism);
    assert.equal(require(path.join(root, 'dist/production-code/main.js'))(40), 42);
    await fs.writeFile(path.join(root, 'dist/production-code/stale.js'), 'stale');
    await prepareProductionCode(root);
    await assert.rejects(fs.stat(path.join(root, 'dist/production-code/stale.js')), { code: 'ENOENT' });
    assert((await fs.readdir(path.join(root, 'dist/production-code'))).every((name) => !name.endsWith('.map')));
  } finally {
    const actual = await fs.realpath(root);
    const temporary = await fs.realpath(os.tmpdir());
    assert(actual.startsWith(temporary + path.sep) && path.basename(actual).startsWith('atlas-production-code-'));
    await fs.rm(actual, { recursive: true, force: true });
  }
});
