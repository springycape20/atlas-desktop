const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { pathToFileURL } = require('node:url');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-workspace-edit-')));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5 }));
  await fs.writeFile(path.join(root, 'main.js'), 'const value = 1;\n');
  let busy = false,
    denied = [];
  const files = require('../project-files').createProjectFiles({ denied: async () => denied }),
    editor = require('../project-editor').createProjectEditor({ files, busy: () => busy });
  return {
    root,
    call: (r) => editor.action(root, r),
    uri: (name) => pathToFileURL(path.join(root, name)).href,
    busy: (v) => (busy = v),
    deny: (v) => (denied = v),
  };
}
test('reviewed workspace edits create, change, move and delete text files with protected undo', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'obsolete.js'), 'old');
  const plan = await f.call({
    action: 'editor-workspace-preview',
    edit: {
      documentChanges: [
        { kind: 'create', uri: f.uri('src/new.js') },
        {
          textDocument: { uri: f.uri('src/new.js'), version: null },
          edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'new\n' }],
        },
        { kind: 'rename', oldUri: f.uri('main.js'), newUri: f.uri('src/moved.js') },
        { kind: 'delete', uri: f.uri('obsolete.js') },
      ],
    },
  });
  assert.equal(plan.files.length, 4);
  assert.equal(await fs.readFile(path.join(f.root, 'main.js'), 'utf8'), 'const value = 1;\n');
  const preview = await f.call({ action: 'editor-workspace-file', id: plan.id, path: 'src/new.js' });
  assert.equal(preview.before, null);
  assert.equal(preview.after, 'new\n');
  const result = await f.call({ action: 'editor-workspace-apply', id: plan.id });
  assert.equal(result.error, undefined);
  assert.equal(result.files.length, 4);
  await assert.rejects(fs.stat(path.join(f.root, 'main.js')), /ENOENT/);
  assert.match(await fs.readFile(path.join(f.root, 'src/moved.js'), 'utf8'), /value/);
  await f.call({ action: 'editor-workspace-undo', id: result.undoId });
  assert.match(await fs.readFile(path.join(f.root, 'main.js'), 'utf8'), /value/);
  assert.equal(await fs.readFile(path.join(f.root, 'obsolete.js'), 'utf8'), 'old');
  await assert.rejects(fs.stat(path.join(f.root, 'src/new.js')), /ENOENT/);
});
test('workspace previews cannot overwrite destinations implicitly or apply against newer files', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'target.js'), 'keep');
  await assert.rejects(
    f.call({
      action: 'editor-workspace-preview',
      edit: { documentChanges: [{ kind: 'rename', oldUri: f.uri('main.js'), newUri: f.uri('target.js') }] },
    }),
    /already exists/,
  );
  const plan = await f.call({
    action: 'editor-workspace-preview',
    edit: {
      changes: {
        [f.uri('main.js')]: [
          { range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, newText: 'renamed' },
        ],
      },
    },
  });
  await fs.writeFile(path.join(f.root, 'main.js'), 'newer');
  await assert.rejects(f.call({ action: 'editor-workspace-apply', id: plan.id }), /Newer disk/);
  assert.equal(await fs.readFile(path.join(f.root, 'target.js'), 'utf8'), 'keep');
  await fs.link(path.join(f.root, 'main.js'), path.join(f.root, 'alias.js'));
  await assert.rejects(
    f.call({
      action: 'editor-workspace-preview',
      edit: {
        documentChanges: [
          { kind: 'rename', oldUri: f.uri('main.js'), newUri: f.uri('alias.js'), options: { overwrite: true } },
        ],
      },
    }),
    /same file/,
  );
  assert.equal(await fs.readFile(path.join(f.root, 'main.js'), 'utf8'), 'newer');
  assert.equal(await fs.readFile(path.join(f.root, 'alias.js'), 'utf8'), 'newer');
});
test('workspace edits reject private paths, links, versioned unknown edits and busy writes', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.call({ action: 'editor-workspace-preview', edit: { documentChanges: [{ kind: 'create', uri: f.uri('.env') }] } }),
    /allowed/,
  );
  await assert.rejects(
    f.call({
      action: 'editor-workspace-preview',
      edit: { documentChanges: [{ textDocument: { uri: f.uri('main.js'), version: 7 }, edits: [] }] },
    }),
    /Versioned/,
  );
  await fs.mkdir(path.join(f.root, 'real'));
  await fs.symlink(
    path.join(f.root, 'real'),
    path.join(f.root, 'link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    f.call({
      action: 'editor-workspace-preview',
      edit: { documentChanges: [{ kind: 'create', uri: f.uri('link/new.js') }] },
    }),
    /symbolic/,
  );
  const plan = await f.call({
    action: 'editor-workspace-preview',
    edit: { documentChanges: [{ kind: 'delete', uri: f.uri('main.js') }] },
  });
  f.busy(true);
  await assert.rejects(f.call({ action: 'editor-workspace-apply', id: plan.id }), /Finish running/);
  f.busy(false);
  f.deny([path.join(f.root, 'main.js')]);
  await assert.rejects(f.call({ action: 'editor-workspace-apply', id: plan.id }), /denied/);
});
test('workspace undo refuses newer edits after an approved change', async (t) => {
  const f = await fixture(t),
    plan = await f.call({
      action: 'editor-workspace-preview',
      edit: { documentChanges: [{ kind: 'create', uri: f.uri('new.js') }] },
    }),
    result = await f.call({ action: 'editor-workspace-apply', id: plan.id });
  await fs.writeFile(path.join(f.root, 'new.js'), 'user edits');
  await assert.rejects(f.call({ action: 'editor-workspace-undo', id: result.undoId }), /Newer disk/);
  assert.equal(await fs.readFile(path.join(f.root, 'new.js'), 'utf8'), 'user edits');
});
test('completion combines snippet defaults and additional edits without executing commands', () => {
  const { completionChange, snippet } = require('../language-edits');
  const change = completionChange('con\n', 3, {
    label: 'console',
    insertTextFormat: 2,
    textEdit: {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
      newText: 'console.log(${1:value});$0',
    },
    additionalTextEdits: [
      { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '// import\n' },
    ],
  });
  assert.equal(change.text, 'console.log(value);\n// import\n');
  assert.equal(change.text.slice(...change.selection), 'value');
  assert.equal(snippet('\\$literal ${1|first,second|}').text, '$literal first');
  assert.throws(() => snippet('${TM_FILENAME}'), /Unsupported/);
  assert.throws(() => completionChange('con', 3, { label: 'bad', command: { command: 'run' } }), /Invalid completion/);
  assert.throws(
    () =>
      completionChange('con', 3, {
        label: 'bad',
        text: 'x',
        additionalTextEdits: [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'y' },
        ],
      }),
    /Overlapping/,
  );
});
