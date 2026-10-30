const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { hash } = require('./request-efficiency');
const text = (value, limit = 6000) => String(value || '').slice(0, limit);
function createWorkSessions({
  directory,
  files,
  knowledge,
  jobs,
  workspace,
  approvals = () => [],
  busy = () => false,
  approve = async () => false,
  runChecks,
  archives,
  version = 'development',
}) {
  const storeFile = path.join(directory, 'work-sessions.json'),
    store = require('./atomic-store').createAtomicStore(storeFile);
  const guard = require('./project-root').createProjectRootGuard(),
    previews = new Map();
  let serial = Promise.resolve();
  const read = async () =>
    JSON.parse(
      await fs.readFile(storeFile, 'utf8').catch((e) => {
        if (e.code === 'ENOENT') return '{"snapshots":[],"branches":[],"criteria":[],"receipts":[],"dismissed":[]}';
        throw e;
      }),
    );
  const save = async (state) => {
    await store.save(state);
    await store.flush();
  };
  const jobFor = (id) => {
    const job = jobs().find((row) => row.id === id);
    if (!job) throw Error('Task is no longer retained.');
    return job;
  };
  async function managed(parts) {
    const root = await fs.realpath(directory);
    let current = root;
    for (const part of parts) {
      const next = path.join(current, part);
      await fs.mkdir(next).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const actual = await fs.realpath(next);
      if (!require('./project-files').within(root, actual)) throw Error('Managed storage points outside ATLAS data.');
      current = actual;
    }
    return current;
  }
  async function scan(cwd, { contents = false, maxFiles = 1000, maxBytes = 12 * 1024 * 1024 } = {}) {
    const root = await guard.assertProject(cwd),
      queue = ['.'],
      rows = [];
    let bytes = 0;
    while (queue.length) {
      const folder = await files.list(root, queue.shift());
      if (folder.limited) throw Error('Folder listing is incomplete. Narrow the project before capturing context.');
      for (const item of folder.entries) {
        if (item.directory) {
          if (['dist', 'build', 'coverage', '.cache', 'target', 'vendor', '__pycache__'].includes(item.name)) continue;
          if (item.path.split('/').length >= 12) throw Error('Project depth limit reached.');
          queue.push(item.path);
          continue;
        }
        if (rows.length >= maxFiles) throw Error('Project file limit reached (1,000). Narrow the project.');
        const target = await files.resolve(root, item.path),
          before = await fs.stat(target.actual);
        if (before.size > 8 * 1024 * 1024 || (bytes += before.size) > maxBytes)
          throw Error('Project snapshot exceeds the 8 MiB file / 12 MiB total limit.');
        const handle = await fs.open(target.actual, 'r');
        let data;
        try {
          const opened = await handle.stat();
          if (opened.size !== before.size || opened.ino !== before.ino)
            throw Error('Project file changed during capture.');
          const buffer = Buffer.alloc(before.size + 1);
          let offset = 0;
          while (offset < buffer.length) {
            const part = await handle.read(buffer, offset, buffer.length - offset, offset);
            if (!part.bytesRead) break;
            offset += part.bytesRead;
          }
          data = buffer.subarray(0, offset);
        } finally {
          await handle.close();
        }
        const after = await fs.stat(target.actual);
        await files.resolve(root, item.path);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || data.length !== after.size)
          throw Error('Project changed during capture. Retry after edits finish.');
        rows.push({
          path: item.path,
          sha256: hash(data),
          mode: after.mode & 511,
          ...(contents ? { data: data.toString('base64') } : {}),
        });
      }
    }
    return { cwd: root, rows };
  }
  const receiptDiff = (before, after) => {
    const a = new Map(before.map((row) => [row.path, row.sha256])),
      b = new Map(after.map((row) => [row.path, row.sha256]));
    return [...new Set([...a.keys(), ...b.keys()])].filter((name) => a.get(name) !== b.get(name));
  };
  function draft(value) {
    const id = randomUUID();
    previews.set(id, { ...value, at: Date.now() });
    while (previews.size > 20) previews.delete(previews.keys().next().value);
    return { id, ...value };
  }
  async function perform(request = {}) {
    const state = await read();
    if (request.action === 'list')
      return {
        snapshots: state.snapshots,
        branches: state.branches,
        receipts: state.receipts.map(({ files, ...row }) => ({ ...row, files: files.length })),
      };
    if (request.action === 'capture') {
      if (busy()) throw Error('Finish active work before capturing a trial checkpoint.');
      if (state.snapshots.length >= 30) throw Error('Remove an old trial checkpoint first (30 maximum).');
      const captured = await scan(request.cwd, { contents: true }),
        id = randomUUID(),
        folder = await managed(['task-evidence', 'trial-snapshots']);
      const profile = request.profileId && workspace ? await workspace.profile(request.profileId) : null;
      if (profile && path.resolve(profile.cwd) !== path.resolve(captured.cwd))
        throw Error('Project profile does not match checkpoint folder.');
      if (profile)
        captured.profile = {
          name: profile.name,
          instructions: profile.instructions,
          codexModel: profile.codexModel,
          claudeModel: profile.claudeModel,
          effort: profile.effort,
          checkCommands: profile.checkCommands,
          autoCheck: profile.autoCheck,
        };
      await fs.writeFile(path.join(folder, id + '.json'), JSON.stringify(captured), { flag: 'wx', mode: 0o600 });
      const row = {
        id,
        cwd: captured.cwd,
        name: text(request.name || 'Trial checkpoint', 100),
        at: Date.now(),
        files: captured.rows.length,
        digest: hash(JSON.stringify(captured)),
      };
      state.snapshots.push(row);
      await save(state);
      return row;
    }
    if (request.action === 'fork') {
      if (busy()) throw Error('Finish active work before creating a trial.');
      const source = state.snapshots.find((row) => row.id === request.id);
      if (!source || !/^[a-f0-9-]{36}$/.test(source.id)) throw Error('Checkpoint unavailable.');
      if (state.branches.length >= 60) throw Error('Trial limit reached (60).');
      const snapshot = JSON.parse(
        await fs.readFile(path.join(await managed(['task-evidence', 'trial-snapshots']), source.id + '.json'), 'utf8'),
      );
      if (hash(JSON.stringify(snapshot)) !== source.digest) throw Error('Checkpoint integrity check failed.');
      const id = randomUUID(),
        cwd = path.join(await managed(['worktrees']), 'trial-' + id);
      await fs.mkdir(cwd, { recursive: false });
      for (const row of snapshot.rows) {
        await files.resolve(source.cwd, row.path).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
        if (
          !require('./project-files').allowed(row.path) ||
          path.isAbsolute(row.path) ||
          row.path.split(/[\\/]/).includes('..')
        )
          throw Error('Unsafe checkpoint path.');
        const data = Buffer.from(row.data, 'base64');
        if (hash(data) !== row.sha256) throw Error('Checkpoint file integrity check failed.');
        const target = path.join(cwd, row.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data, { flag: 'wx', mode: row.mode });
      }
      const profile =
        snapshot.profile && workspace
          ? await workspace.profiles({
              action: 'save',
              profile: { ...snapshot.profile, name: snapshot.profile.name + ' (trial)', cwd },
            })
          : null;
      const row = {
        id,
        checkpointId: source.id,
        cwd,
        source: source.cwd,
        profileId: profile?.id || '',
        name: text(request.name || 'Alternative', 100),
        at: Date.now(),
      };
      state.branches.push(row);
      await save(state);
      return {
        ...row,
        note: 'Isolated bounded project copy. Dependencies, private/excluded folders and Git history are not copied. Nothing executes automatically.',
      };
    }
    if (request.action === 'compare') {
      const a = state.branches.find((row) => row.id === request.left),
        b = state.branches.find((row) => row.id === request.right);
      if (!a || !b || a.checkpointId !== b.checkpointId || a.id === b.id)
        throw Error('Choose two trials from the same checkpoint.');
      const left = await scan(a.cwd),
        right = await scan(b.cwd),
        changed = receiptDiff(left.rows, right.rows),
        diffs = [];
      for (const name of changed.slice(0, 100)) {
        const get = async (root) =>
          files.read(root, name).catch((e) => {
            if (e.code === 'ENOENT') return { text: '' };
            throw e;
          });
        const x = await get(a.cwd),
          y = await get(b.cwd);
        diffs.push({
          path: name,
          binary: typeof x.text !== 'string' || typeof y.text !== 'string',
          patch:
            typeof x.text === 'string' && typeof y.text === 'string'
              ? require('diff')
                  .createTwoFilesPatch('first/' + name, 'second/' + name, x.text, y.text)
                  .slice(0, 16000)
              : '',
        });
      }
      return {
        left: a,
        right: b,
        diffs,
        limited: changed.length > 100,
        note: 'Current trial files compared; selecting a trial changes the active folder, not the original project. Use existing Git/review tools for a reviewed merge.',
      };
    }
    if (request.action === 'remove-snapshot') {
      const row = state.snapshots.find((row) => row.id === request.id);
      if (!row || !/^[a-f0-9-]{36}$/.test(row.id)) throw Error('Checkpoint unavailable.');
      if (state.branches.some((item) => item.checkpointId === row.id))
        throw Error('Forget dependent trial records before removing their checkpoint.');
      await fs.unlink(path.join(await managed(['task-evidence', 'trial-snapshots']), row.id + '.json'));
      state.snapshots = state.snapshots.filter((item) => item.id !== row.id);
      await save(state);
      return { removed: true };
    }
    if (request.action === 'forget-trial') {
      state.branches = state.branches.filter((row) => row.id !== request.id);
      await save(state);
      return { removed: true, note: 'Record removed; trial files and its project profile were preserved.' };
    }
    if (request.action === 'export-trial') {
      if (busy()) throw Error('Finish active work before exporting a trial.');
      const row = state.branches.find((row) => row.id === request.id);
      if (!row) throw Error('Trial unavailable.');
      const destination = await guard.assertProject(request.destination);
      if ((await fs.readdir(destination)).length) throw Error('Choose an empty dedicated project folder.');
      const snapshot = await scan(row.cwd, { contents: true });
      for (const item of snapshot.rows) {
        const target = path.join(destination, item.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, Buffer.from(item.data, 'base64'), { flag: 'wx', mode: item.mode });
      }
      return {
        cwd: destination,
        profileId: '',
        text:
          'Continue the exported trial ' +
          row.name +
          '. Review current project instructions and configure checks before further work.',
        note: 'Copied captured files into the selected empty folder. No code was executed. Configure the exported project profile before sending a task.',
      };
    }
    if (request.action === 'map') {
      const root = await guard.assertProject(request.cwd),
        result = await knowledge.analyze(root, {});
      let entries = [];
      try {
        const pkg = JSON.parse((await files.read(root, 'package.json')).text);
        entries = [pkg.main, pkg.module, ...Object.values(typeof pkg.bin === 'object' ? pkg.bin : { bin: pkg.bin })]
          .filter((v) => typeof v === 'string')
          .map((value) => ({ path: value, reason: 'Declared package entry point' }));
      } catch {}
      const modules = result.modules || [];
      entries.push(
        ...modules
          .filter((row) => /(?:^|\/)(?:main|index|app|server)\.[^.]+$/.test(row.path))
          .map((row) => ({ path: row.path, reason: 'Filename hint; inspect before relying on it' })),
      );
      return {
        ...result,
        truncated: result.truncated || result.indexed > 300,
        entries: entries
          .filter((row, index) => entries.findIndex((item) => item.path === row.path) === index)
          .slice(0, 30),
      };
    }
    if (request.action === 'remember-context' || request.action === 'context-refresh') {
      const captured = await scan(request.cwd),
        previous = state.receipts.find((row) => row.cwd === captured.cwd),
        changed = previous ? receiptDiff(previous.files, captured.rows) : [],
        row = { id: randomUUID(), jobId: request.jobId || '', cwd: captured.cwd, at: Date.now(), files: captured.rows };
      state.receipts.unshift(row);
      state.receipts = state.receipts.slice(0, 80);
      while (state.receipts.length > 1 && Buffer.byteLength(JSON.stringify(state.receipts)) > 8 * 1024 * 1024)
        state.receipts.pop();
      await save(state);
      return { id: row.id, at: row.at, files: row.files.length, changed, previousAt: previous?.at || null };
    }
    if (request.action === 'freshness') {
      const receipt = state.receipts.find((row) => row.id === request.id);
      if (!receipt) throw Error('Context receipt unavailable.');
      const current = await scan(receipt.cwd);
      return {
        changed: receiptDiff(receipt.files, current.rows),
        at: receipt.at,
        note: 'Changed project files can invalidate earlier conclusions. Imported attachment copies remain immutable; reattach originals to update them.',
      };
    }
    if (request.action === 'criteria-list') return state.criteria.filter((row) => row.jobId === request.jobId);
    if (request.action === 'criteria-save') {
      const job = jobFor(request.jobId),
        criterion = text(request.text, 2000).trim();
      if (!criterion) throw Error('Describe the requirement.');
      const proof = request.checkCommand
        ? (job.verification?.results || []).find((row) => row.command === request.checkCommand)
        : null;
      if (request.checkCommand && !proof) throw Error('Choose an executed check from this task.');
      const row = {
        id: request.id || randomUUID(),
        jobId: job.id,
        text: criterion,
        note: text(request.note, 3000),
        claim: request.claim === true,
        checkCommand: proof?.command || '',
        checkDigest: proof ? hash(JSON.stringify(proof)) : null,
        at: Date.now(),
      };
      if (state.criteria.some((item) => item.id === row.id && item.jobId !== job.id))
        throw Error('Requirement belongs to another task.');
      if (state.criteria.length >= 500 && !state.criteria.some((item) => item.id === row.id))
        throw Error('Requirement limit reached (500).');
      state.criteria = state.criteria.filter((item) => item.id !== row.id).concat(row);
      await save(state);
      return row;
    }
    if (request.action === 'criteria-remove') {
      state.criteria = state.criteria.filter((row) => !(row.id === request.id && row.jobId === request.jobId));
      await save(state);
      return { removed: true };
    }
    const criteriaStatus = (row) => {
      const job = jobs().find((job) => job.id === row.jobId),
        proof = (job?.verification?.results || []).find((check) => check.command === row.checkCommand);
      return {
        ...row,
        status:
          proof && hash(JSON.stringify(proof)) === row.checkDigest
            ? proof.status === 'passed' && proof.exitCode === 0
              ? 'check passed (user-linked evidence)'
              : 'check did not pass'
            : row.checkCommand
              ? 'evidence changed; review again'
              : row.claim
                ? 'model/user claim; unverified'
                : 'no evidence',
      };
    };
    if (request.action === 'criteria-status')
      return state.criteria.filter((row) => row.jobId === request.jobId).map(criteriaStatus);
    if (request.action === 'inbox') {
      const rows = [];
      for (const job of jobs()) {
        for (const check of job.verification?.results || [])
          if (check.status !== 'passed')
            rows.push({
              id: job.id + ':check:' + check.command,
              jobId: job.id,
              kind: 'check',
              text: check.command + ' · ' + check.status,
              evidence: hash(JSON.stringify(check)),
            });
        if (['failed', 'paused'].includes(job.status) || job.result?.outcome === 'needs-attention')
          rows.push({
            id: job.id + ':attention',
            jobId: job.id,
            kind: 'task',
            text: job.error || job.statusText || job.status,
          });
        if (job.result?.question)
          rows.push({
            id: job.id + ':question',
            jobId: job.id,
            kind: 'question',
            text: text(job.result.question, 2000),
          });
        if (job.status === 'completed' && (job.changeId || job.workspaceId))
          rows.push({
            id: job.id + ':changes',
            jobId: job.id,
            kind: 'changes',
            text: 'Changes ready for inspection: ' + text(job.prompt, 160),
          });
      }
      for (const item of approvals())
        rows.push({
          id: 'approval:' + item.id,
          jobId: item.jobId,
          kind: 'permission',
          text: item.title || item.message || 'Pending permission',
        });
      for (const row of state.criteria.map(criteriaStatus))
        if (!row.status.startsWith('check passed'))
          rows.push({
            id: 'criterion:' + row.id,
            jobId: row.jobId,
            kind: 'requirement',
            text: row.text + ' · ' + row.status,
          });
      return rows
        .map((row) => ({ ...row, fingerprint: hash(JSON.stringify(row)) }))
        .filter((row) => !state.dismissed.includes(row.fingerprint))
        .slice(0, 200);
    }
    if (request.action === 'dismiss') {
      state.dismissed = [...state.dismissed, text(request.fingerprint, 64)].slice(-300);
      await save(state);
      return { dismissed: true };
    }
    if (request.action === 'task-search') {
      const query = text(request.query, 200).trim().toLowerCase();
      if (query.length < 2) throw Error('Enter at least two characters.');
      const rows = [];
      for (const job of jobs()) {
        if (request.cwd && path.resolve(job.projectFolder || job.cwd) !== path.resolve(request.cwd)) continue;
        const body = [
          job.prompt,
          job.result?.output,
          ...(job.verification?.results || []).map((row) => row.command + '\n' + row.output + '\n' + row.error),
        ].join('\n');
        let names = [];
        try {
          const archived = await archives.read(job.id);
          names = (archived.diff?.files || []).map((row) => row.path);
        } catch {}
        const combined = (body + '\n' + names.join('\n')).slice(0, 200000),
          at = combined.toLowerCase().indexOf(query);
        if (at >= 0)
          rows.push({
            jobId: job.id,
            title: text(job.prompt, 160),
            cwd: job.cwd,
            files: names,
            excerpt: combined.slice(Math.max(0, at - 150), at + 1600),
          });
      }
      const seen = new Set(rows.map((row) => row.jobId));
      for (const item of ((await archives?.list?.()) || []).slice(0, 100)) {
        if (seen.has(item.id)) continue;
        let source;
        try {
          source = await archives.read(item.id);
        } catch {
          continue;
        }
        if (request.cwd && path.resolve(source.cwd || '.') !== path.resolve(request.cwd)) continue;
        const names = (source.diff?.files || []).map((row) => row.path),
          body = JSON.stringify({ title: source.title, checks: source.checks, diff: source.diff }).slice(0, 200000),
          at = body.toLowerCase().indexOf(query);
        if (at >= 0)
          rows.push({
            jobId: item.id,
            title: source.title || item.id,
            cwd: source.cwd,
            files: names,
            excerpt: body.slice(Math.max(0, at - 150), at + 1600),
            archived: true,
          });
      }
      return rows.slice(0, 100);
    }
    if (request.action === 'prepare') {
      const root = await guard.assertProject(request.cwd),
        query = text(request.query, 2000);
      if (!query.trim()) throw Error('Enter the task to prepare.');
      const receipt = await perform({ action: 'remember-context', cwd: root });
      const ranked = await knowledge.search(root, query),
        detected = await require('./project-tools').detectProject(root);
      if ((await perform({ action: 'freshness', id: receipt.id })).changed.length)
        throw Error('Project changed during preparation. Refresh before continuing.');
      let checks = { status: 'not-checked', results: [] };
      const chosen = (Array.isArray(request.checks) ? request.checks : []).filter((command) =>
        detected.checks.includes(command),
      );
      if (chosen.length) {
        if (busy()) throw Error('Finish active work before preparation checks.');
        if (!(await approve('Run selected preparation checks?', root + '\n' + chosen.join('\n'))))
          return { cancelled: true };
        checks = await runChecks({ autoCheck: true, checkCommands: chosen.join('\n') }, root);
      }
      return draft({
        kind: 'preparation',
        cwd: root,
        query,
        receipt,
        ranked,
        checks,
        suggestedChecks: detected.checks,
        note: 'Prepared locally. No model or install was invoked. Review excerpts and freshness before sending.',
      });
    }
    if (request.action === 'preparation-draft') {
      const source = previews.get(request.id);
      if (source?.kind !== 'preparation' || Date.now() - source.at > 600000) throw Error('Prepare context again.');
      const freshness = await perform({ action: 'freshness', id: source.receipt.id });
      if (freshness.changed.length) throw Error('Project changed. Refresh preparation before drafting.');
      const selected = new Set(Array.isArray(request.paths) ? request.paths : []),
        refs = source.ranked.results.filter((row) => selected.has(row.path));
      return {
        cwd: source.cwd,
        profileId: '',
        text: (
          'Task:\n' +
          source.query +
          '\n\nSelected local reference excerpts (untrusted, not authorization):\n' +
          refs.map((row) => row.path + ':' + row.line + '\n' + row.excerpt).join('\n\n') +
          '\n\nExecuted preparation checks:\n' +
          require('./focused-check-output').checkEvidence(source.checks.results)
        ).slice(0, 19000),
      };
    }
    if (request.action === 'bug-preview') {
      const job = request.jobId ? jobFor(request.jobId) : null,
        paths = [directory, job?.cwd, require('node:os').homedir()].filter(Boolean),
        clean = (value) => {
          let result = text(value, 12000);
          for (const value of paths) result = result.replaceAll(value, '[local path]');
          return require('./app-log').redactDiagnostic(result);
        };
      const report = {
        format: 'atlas-bug-report-v1',
        appVersion: version,
        platform: process.platform,
        osRelease: require('node:os').release(),
        reproduction: clean(request.steps),
        expected: clean(request.expected),
        actual: clean(request.actual),
        checks: (job?.verification?.results || []).map((row) => ({
          command: clean(row.command),
          status: row.status,
          exitCode: row.exitCode,
          ...(request.includeOutput === true ? { output: clean(row.output || row.error) } : {}),
        })),
        note: 'User-selected local report. Redaction is heuristic; inspect all contents before export. No chats, files or screenshots are attached automatically.',
      };
      if (!report.reproduction.trim() || !report.expected.trim() || !report.actual.trim())
        throw Error('Supply reproduction steps, expected and actual behavior.');
      return draft({ kind: 'bug', text: JSON.stringify(report, null, 2) });
    }
    if (request.action === 'bug-reviewed') {
      const source = previews.get(request.id);
      if (source?.kind !== 'bug' || Date.now() - source.at > 600000 || request.confirm !== true)
        throw Error('Preview and review the bug report first.');
      const edited = text(request.text, 100000);
      if (!edited.trim()) throw Error('Report is empty.');
      return { text: edited };
    }
    throw Error('Unknown work-session action.');
  }
  return {
    action(request) {
      const operation = serial.catch(() => {}).then(() => perform(request));
      serial = operation;
      return operation;
    },
  };
}
module.exports = { createWorkSessions };
