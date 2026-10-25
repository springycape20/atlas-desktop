const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { singleInstance, migrateOnce } = require('../startup-lifecycle'),
  { fingerprint, createVerificationRunner } = require('../verification-cache'),
  { createProjectContext } = require('../project-context'),
  { createReviewContext } = require('../review-context'),
  { createCollaboration } = require('../collaboration');
const ready = (text) => (text || 'Done') + '\nATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}';
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('a failed review leaves its diff available to the retry', () => {
  const format = createReviewContext(),
    report = {
      limited: false,
      files: [{ path: 'a.js', status: 'modified', patch: { hunks: [{ lines: ['IMPORTANT CHANGE'] }] } }],
    };
  format(report, 6000);
  assert(format(report, 6000).includes('IMPORTANT CHANGE'));
  format.commit();
  assert(format(report, 6000).includes('IMPORTANT CHANGE'));
  assert(!format(report, 6000, { continued: true }).includes('IMPORTANT CHANGE'));
});
test('completed parallel proposals survive cancellation and are reused after a safe resume', async () => {
  let journal = {},
    calls = [],
    first = true;
  const controller = new AbortController();
  const options = {
    progress() {},
    fingerprint: async () => ({ complete: true, value: 'same' }),
    savePrepared: async (value) => {
      journal = structuredClone(value);
      if (first && journal.codex) controller.abort();
    },
    runProvider: async (provider, _prompt, _cwd, settings) => {
      calls.push(provider);
      if (first && provider === 'claude')
        return new Promise((resolve, reject) =>
          settings.stageSignal.addEventListener('abort', () => reject(Error('stopped')), { once: true }),
        );
      return { output: ready(), usage: { inputTokens: 10, outputTokens: 2 } };
    },
  };
  await assert.rejects(
    createCollaboration(options)({ task: 'Build', roles: 'proposals', signal: controller.signal }),
    /stopped/,
  );
  assert(journal.codex);
  first = false;
  const result = await createCollaboration(options)({ task: 'Build', roles: 'proposals', preparedProposals: journal });
  assert.equal(result.outcome, 'completed');
  assert.equal(calls.filter((provider) => provider === 'codex').length, 2);
  assert.equal(result.passes, 4);
});
test('one provider failure preserves its healthy sibling without inventing a completed pass', async () => {
  let journal = {},
    calls = 0,
    failed = true;
  const options = {
    progress() {},
    fingerprint: async () => ({ complete: true, value: 'same' }),
    savePrepared: async (value) => {
      journal = structuredClone(value);
    },
    runProvider: async (provider) => {
      calls++;
      if (failed && provider === 'codex') throw Error('Sign-in required');
      await tick();
      return { output: ready(), usage: { inputTokens: 10, outputTokens: 2 } };
    },
  };
  await assert.rejects(createCollaboration(options)({ task: 'Build', roles: 'proposals' }), /Sign-in required/);
  assert(journal.claude);
  failed = false;
  const result = await createCollaboration(options)({ task: 'Build', roles: 'proposals', preparedProposals: journal });
  assert.equal(result.outcome, 'completed');
  assert.equal(calls, 5);
  assert.equal(result.passes, 4);
});

test('a stale saved proposal is rerun and its original usage remains accounted', async () => {
  let saved,
    calls = 0,
    value = 'old';
  const run = createCollaboration({
    progress() {},
    fingerprint: async () => ({ complete: true, value }),
    checkpoint: async (rows) => {
      saved = structuredClone(rows);
    },
    runProvider: async () => ({
      output: ++calls === 1 ? 'missing verdict' : ready(),
      usage: { inputTokens: 10, outputTokens: 2 },
    }),
  });
  await run({ task: 'Build', roles: 'proposals', maxRounds: 2 });
  value = 'new';
  const result = await run({ task: 'Build', roles: 'proposals', maxRounds: 6, checkpoints: saved });
  assert.equal(result.outcome, 'completed');
  assert.equal(calls, 6);
  assert.equal(result.passes, 6);
  assert.equal(result.usage.inputTokens, 60);
});
async function folder(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-opt-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return dir;
}
test('second launches focus the existing window and do not start another instance', async () => {
  const events = new Map(),
    actions = [],
    win = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: () => actions.push('restore'),
      show: () => actions.push('show'),
      focus: () => actions.push('focus'),
    };
  assert(singleInstance({ requestSingleInstanceLock: () => true, on: (name, fn) => events.set(name, fn) }, () => win));
  events.get('second-instance')();
  assert.deepEqual(actions, ['restore', 'show', 'focus']);
  let quit = false;
  assert.equal(
    singleInstance(
      {
        requestSingleInstanceLock: () => false,
        exit: (code) => {
          assert.equal(code, 0);
          quit = true;
        },
      },
      () => null,
    ),
    false,
  );
  await tick();
  assert(quit);
});
test('migration preserves newer files and stops traversing legacy data after success', async (t) => {
  const root = await folder(t),
    source = path.join(root, 'old'),
    dest = path.join(root, 'new');
  await fs.mkdir(path.join(source, 'cache'), { recursive: true });
  await fs.mkdir(path.join(dest, 'cache'), { recursive: true });
  await fs.writeFile(path.join(source, 'settings.json'), 'old');
  await fs.writeFile(path.join(dest, 'settings.json'), 'new');
  await fs.writeFile(path.join(source, 'cache', 'one'), 'one');
  await migrateOnce(source, dest);
  assert.equal(await fs.readFile(path.join(dest, 'settings.json'), 'utf8'), 'new');
  await fs.writeFile(path.join(source, 'cache', 'later'), 'later');
  assert.equal((await migrateOnce(source, dest)).skipped, true);
  await assert.rejects(fs.access(path.join(dest, 'cache', 'later')));
});
test('a destination link back into legacy data does not block the migration marker', async (t) => {
  const root = await folder(t),
    source = path.join(root, 'old'),
    dest = path.join(root, 'new'),
    real = path.join(source, 'tools', 'python', 'cpython-3.14.9');
  await fs.mkdir(real, { recursive: true });
  await fs.writeFile(path.join(real, 'python.exe'), '');
  await fs.mkdir(path.join(dest, 'tools', 'python', 'cpython-3.14.9'), { recursive: true });
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(real, path.join(source, 'tools', 'python', 'cpython-3.14'), type);
  await fs.symlink(real, path.join(dest, 'tools', 'python', 'cpython-3.14'), type);
  await fs.writeFile(path.join(source, 'tools', 'python', 'new.txt'), 'merged');
  assert.equal((await migrateOnce(source, dest)).skipped, false);
  assert.equal(await fs.readFile(path.join(dest, 'tools', 'python', 'new.txt'), 'utf8'), 'merged');
  assert((await fs.lstat(path.join(dest, 'tools', 'python', 'cpython-3.14'))).isSymbolicLink());
  assert.equal((await migrateOnce(source, dest)).skipped, true);
});
test('failed migration never writes the success marker and can be retried', async (t) => {
  const root = await folder(t),
    source = path.join(root, 'old'),
    dest = path.join(root, 'new');
  await fs.mkdir(path.join(source, 'folder'), { recursive: true });
  await fs.mkdir(dest);
  await fs.writeFile(path.join(source, 'folder', 'file'), 'keep');
  await fs.writeFile(path.join(dest, 'folder'), 'conflict');
  await assert.rejects(migrateOnce(source, dest));
  await assert.rejects(fs.access(path.join(dest, '.legacy-migration-v1.json')));
  await fs.unlink(path.join(dest, 'folder'));
  await migrateOnce(source, dest);
  assert.equal(await fs.readFile(path.join(dest, 'folder', 'file'), 'utf8'), 'keep');
});
test('advisory hash scans reuse cached bytes; strict scans always read current content', async (t) => {
  const root = await folder(t),
    cache = new Map();
  await fs.writeFile(path.join(root, 'app.js'), 'content');
  let metrics = {};
  const initial = await fingerprint(root, { cache, metrics });
  assert.equal(metrics.bytesRead, 7);
  metrics = {};
  assert.equal((await fingerprint(root, { cache, strict: false, metrics })).value, initial.value);
  assert.equal(metrics.bytesRead || 0, 0);
  assert.equal(metrics.cacheHits, 1);
  metrics = {};
  assert.equal((await fingerprint(root, { cache, strict: true, metrics })).value, initial.value);
  assert.equal(metrics.bytesRead, 7);
  await fs.writeFile(path.join(root, 'app.js'), 'changed');
  assert.notEqual((await fingerprint(root, { cache, strict: true })).value, initial.value);
});
test('a stale advisory hash cannot authorize reuse of passed checks', async () => {
  let actual = 'original',
    saved = 'original',
    runs = 0;
  const check = createVerificationRunner({
    cwd: 'project',
    project: { autoCheck: true, checkCommands: 'test' },
    reuse: true,
    environment: {},
    readFingerprint: async (options) => ({ complete: true, value: options.strict ? actual : saved }),
    run: async () => {
      runs++;
      return { status: 'passed' };
    },
  });
  await check();
  actual = 'new bytes';
  await check();
  assert.equal(runs, 2);
});
test('parallel proposal stages overlap but implementation waits for both independent results', async () => {
  let active = 0,
    peak = 0,
    release;
  const barrier = new Promise((resolve) => {
      release = resolve;
    }),
    calls = [],
    reports = [];
  const run = createCollaboration({
    progress() {},
    checkpoint: async (rows) => reports.splice(0, reports.length, ...rows),
    runProvider: async (provider, prompt, _cwd, settings) => {
      calls.push({ provider, prompt, settings });
      active++;
      peak = Math.max(peak, active);
      if (calls.length <= 2) {
        if (calls.length === 2) release();
        await barrier;
      } else assert.equal(active, 1);
      active--;
      return { output: ready(provider + ' report'), usage: { inputTokens: 10, outputTokens: 2 } };
    },
  });
  const result = await run({ task: 'Implement the requested change', roles: 'proposals' });
  assert.equal(peak, 2);
  assert.equal(result.passes, 4);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].prompt, calls[1].prompt);
  assert(calls[0].settings.readOnly && calls[1].settings.readOnly);
  assert.equal(result.usage.inputTokens, 40);
  assert.deepEqual(
    reports.map((row) => row.phase),
    ['proposal_first', 'proposal_second', 'build', 'review'],
  );
});
test('pass limits and token warnings prevent speculative extra provider work', async () => {
  for (const options of [{ maxRounds: 1 }, { tokenWarning: 5000 }]) {
    let active = 0,
      peak = 0,
      calls = 0;
    const run = createCollaboration({
      progress() {},
      runProvider: async () => {
        calls++;
        active++;
        peak = Math.max(peak, active);
        await tick();
        active--;
        return { output: ready(), usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    await run({ task: 'Change code', roles: 'proposals', ...options });
    assert.equal(peak, 1);
    if (options.maxRounds) assert.equal(calls, 1);
  }
});
test('malformed parallel results respect the pass cap and resume without rerunning the saved second proposal', async () => {
  let saved,
    calls = 0;
  const run = createCollaboration({
    progress() {},
    fingerprint: async () => ({ complete: true, value: 'same' }),
    checkpoint: async (rows) => {
      saved = structuredClone(rows);
    },
    runProvider: async () => ({
      output: ++calls === 1 ? 'missing verdict' : ready(),
      usage: { inputTokens: 10, outputTokens: 2 },
    }),
  });
  const first = await run({ task: 'Build feature', roles: 'proposals', maxRounds: 2 });
  assert.equal(calls, 2);
  assert.equal(first.passes, 2);
  assert.equal(first.usage.inputTokens, 20);
  assert.equal(saved.length, 1);
  const result = await run({ task: 'Build feature', roles: 'proposals', maxRounds: 5, checkpoints: saved });
  assert.equal(calls, 5);
  assert.equal(result.outcome, 'completed');
  assert.equal(result.passes, 5);
  assert.equal(result.usage.inputTokens, 50);
});
test('cancelling parallel work interrupts both providers', async () => {
  const controller = new AbortController(),
    started = [],
    cancelled = [];
  const run = createCollaboration({
    progress() {},
    runProvider: async (provider, _prompt, _cwd, settings) =>
      new Promise((resolve, reject) => {
        started.push(provider);
        settings.stageSignal.addEventListener(
          'abort',
          () => {
            cancelled.push(provider);
            reject(Error('stopped'));
          },
          { once: true },
        );
        if (started.length === 2) controller.abort();
      }),
  });
  await assert.rejects(run({ task: 'Build feature', roles: 'proposals', signal: controller.signal }), /stopped/);
  assert.equal(started.length, 2);
  assert.equal(cancelled.length, 2);
});
test('project maps rank relevant files, refresh additions, and never copy script bodies or sensitive paths', async (t) => {
  const root = await folder(t);
  let names = [
    'package.json',
    'src/payments.js',
    'tests/payments.test.js',
    'src/ui.js',
    '.env',
    '.aws/credentials',
    '../outside.js',
  ];
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'secret-token-must-not-leave-file', build: 'echo body' } }),
  );
  const service = createProjectContext({ directory: path.join(root, 'state'), listFiles: async () => names });
  let context = await service.context(root, 'Fix payments');
  assert(context.indexOf('src/payments.js') < context.indexOf('src/ui.js'));
  assert(context.includes('npm run test'));
  assert(!context.includes('secret-token'));
  assert(!context.includes('.env'));
  assert(!context.includes('outside.js'));
  names = [...names, 'src/new.js'];
  context = await service.context(root, 'new');
  assert(context.includes('src/new.js'));
  await service.flush();
});
test('later review context omits unchanged hunks but exposes reverted files and keeps full fallback', () => {
  const format = createReviewContext(),
    row = (name, text) => ({ path: name, status: 'modified', patch: { hunks: [{ lines: [text] }] } });
  format({ files: [row('a.js', 'OLD-A'), row('b.js', 'OLD-B')], limited: false }, 6000);
  format.commit();
  let text = format({ files: [row('a.js', 'NEW-A'), row('b.js', 'OLD-B')], limited: false }, 6000, { continued: true });
  assert(text.includes('NEW-A'));
  assert(!text.includes('OLD-B'));
  format.commit();
  text = format({ files: [row('b.js', 'OLD-B')], limited: false }, 6000, { continued: true });
  assert(text.includes('reverted to task-start'));
  text = format({ files: [row('b.js', 'OLD-B')], limited: false }, 6000, { full: true });
  assert(text.includes('OLD-B'));
  assert(text.includes('Full task-start'));
});

test('review deltas require a continued session and never hide patchless changes', () => {
  const format = createReviewContext(),
    report = {
      limited: false,
      files: [
        { path: 'binary.dat', status: 'modified', patch: null },
        { path: 'app.js', status: 'modified', patch: { hunks: [{ lines: ['APP CHANGE'] }] } },
      ],
    };
  format(report, 6000);
  format.commit();
  assert(format(report, 6000).includes('APP CHANGE'));
  const delta = format(report, 6000, { continued: true });
  assert(!delta.includes('APP CHANGE'));
  assert(delta.includes('Read the file directly'));
});
test('later reviewer calls resume only their own read-only session', async () => {
  const reviews = [];
  let count = 0;
  const run = createCollaboration({
    progress() {},
    reviewContext: async (_limit, options) => {
      reviews.push(options);
      return '';
    },
    runProvider: async (_provider, prompt, _cwd, _settings, session) => {
      if (prompt.includes('You are the final reviewer')) {
        count++;
        assert.equal(session, count === 1 ? '' : 'review-session');
        return {
          sessionId: 'review-session',
          output:
            count === 1
              ? 'Fix it\nATLAS_COLAB_STATUS {"decision":"changes_requested","blockingIssues":[{"id":"F1","criterion":"TASK","summary":"Fix","evidence":"test"}]}'
              : ready(),
        };
      }
      assert.equal(session, '');
      return { sessionId: 'builder-session', output: ready() };
    },
  });
  assert.equal((await run({ task: 'Build' })).outcome, 'completed');
  assert.equal(reviews[0].continued, false);
  assert.equal(reviews.at(-1).continued, true);
});
test('project map ranks before truncation and excludes credential filenames', async (t) => {
  const root = await folder(t),
    names = [
      ...Array.from({ length: 2600 }, (_, i) => 'a/file-' + i + '.js'),
      'z/payments.js',
      'build/verify.cjs',
      '.npmrc',
      '.netrc',
      '.git-credentials',
      'id_rsa.pub',
      'secrets.txt',
      'access.token',
    ];
  const service = createProjectContext({ listFiles: async () => names });
  const text = await service.context(root, 'payments verify');
  assert(text.includes('z/payments.js'));
  assert(text.includes('build/verify.cjs'));
  for (const name of ['.npmrc', '.netrc', '.git-credentials', 'id_rsa.pub', 'secrets.txt', 'access.token'])
    assert(!text.includes(name));
});

test('Chromium cache is separate from persistent chat data and has a writable fallback', async (t) => {
  const root = await folder(t),
    calls = [],
    userData = path.join(root, 'user-data'),
    app = {
      getPath: (name) => {
        assert.equal(name, 'userData');
        return userData;
      },
      commandLine: { appendSwitch: (...args) => calls.push(args) },
    };
  const { configureChromiumCache } = require('../startup-lifecycle'),
    directory = configureChromiumCache(app, { base: root });
  assert(directory.startsWith(path.join(root, 'ATLAS', 'ChromiumCache-v2')));
  assert.equal(calls[0][0], 'disk-cache-dir');
  assert.equal(calls[1][0], 'disable-gpu-shader-disk-cache');
  assert(!calls.some((row) => row[0] === 'disable-gpu'));
  const blocked = path.join(root, 'blocked');
  await fs.writeFile(blocked, '');
  const fallback = configureChromiumCache(app, { base: blocked });
  assert(fallback.includes('atlas-chromium-cache-'));
  assert.equal(configureChromiumCache(app, { base: blocked }), fallback);
  await fs.rm(fallback, { recursive: true, force: true });
});

test('expired reviewer context is replaced before generating a diff or resuming a provider', async () => {
  const reviews = [];
  let count = 0;
  const run = createCollaboration({
    canResumeSession: () => false,
    progress() {},
    reviewContext: async (_limit, options) => {
      reviews.push(options);
      return 'complete current diff';
    },
    runProvider: async (_provider, prompt, _cwd, _settings, session) => {
      if (prompt.includes('You are the final reviewer')) {
        count++;
        assert.equal(session, '');
        return {
          sessionId: 'expired-after-turn',
          output:
            count === 1
              ? 'Fix it\nATLAS_COLAB_STATUS {"decision":"changes_requested","blockingIssues":[{"id":"F1","criterion":"TASK","summary":"Fix","evidence":"test"}]}'
              : ready(),
        };
      }
      return { output: ready() };
    },
  });
  assert.equal((await run({ task: 'Build' })).outcome, 'completed');
  assert.equal(reviews.length, 3);
  assert(reviews.every((row) => row.continued === false));
});
