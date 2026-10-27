// Keeps the task-check and Colab job modules out of Electron and main.js, so they stay testable on their own.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { readFileSync } = require('node:fs'),
  path = require('node:path');
const root = path.join(__dirname, '..');

// Every file and package a module can load, following each require in its source, including lazy ones.
function reachable(file) {
  const files = new Set(),
    packages = new Set(),
    pending = [path.join(root, file)];
  while (pending.length) {
    const next = pending.pop();
    if (files.has(next)) continue;
    files.add(next);
    for (const [, id] of readFileSync(next, 'utf8').matchAll(/require\(\s*'([^']+)'\s*\)/g)) {
      if (!id.startsWith('.')) packages.add(id);
      else if (!id.endsWith('.json'))
        pending.push(path.resolve(path.dirname(next), id.endsWith('.js') ? id : id + '.js'));
    }
  }
  return { files: [...files].map((name) => path.relative(root, name)), packages: [...packages] };
}

test('task checks and Colab jobs never load Electron or main.js', () => {
  for (const file of ['task-checks.js', 'colab-jobs.js']) {
    const { files, packages } = reachable(file);
    assert(!packages.includes('electron'), file + ' must not reach electron');
    assert(!files.includes('main.js'), file + ' must not reach main.js');
  }
});

test('task checks and Colab jobs build in plain Node from what main.js passes in', async () => {
  const checks = require('../task-checks').createTaskChecks({
    workspace: () => ({}),
    changes: () => ({}),
    jobs: new Map(),
    emit: () => {},
    persist: async () => {},
    tools: {},
  });
  assert.deepEqual(Object.keys(checks), ['check', 'answerOffer', 'runOffered']);
  const colab = require('../colab-jobs').createColabJobs({ jobs: new Map(), workspace: () => ({}) });
  assert.deepEqual(Object.keys(colab), ['start', 'runQueued', 'settled']);
  assert.equal(await colab.settled({ provider: 'codex' }), true, 'only isolated Colab items wait to be settled');
});
