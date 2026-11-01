const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const textTypes = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.html',
  '.css',
  '.csv',
  '.yml',
  '.yaml',
  '.xml',
  '.toml',
  '.ini',
  '.log',
  '.sql',
  '.sh',
  '.ps1',
  '.cs',
  '.cpp',
  '.h',
  '.java',
  '.rs',
  '.go',
  '.svg',
]);
const imageTypes = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const trim = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
async function command(executable, args, cwd, extra = {}) {
  const { includeStderr, ...options } = extra;
  try {
    const result = await exec(executable, args, {
      cwd,
      windowsHide: true,
      shell: false,
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      ...options,
    });
    return (result.stdout + (includeStderr ? result.stderr : '')).trimEnd();
  } catch (error) {
    throw Object.assign(new Error(String(error.stderr || error.message).slice(-3000)), { stdout: error.stdout });
  }
}
function createWorkspaceService(directory, options = {}) {
  const projectRoots = require('./project-root').createProjectRootGuard(options);
  const store = require('./atomic-store').createAtomicStore(path.join(directory, 'workspace-data.json'));
  let data,
    loading,
    queue = Promise.resolve();
  async function state() {
    if (!loading)
      loading = (async () => {
        try {
          data = JSON.parse(await fs.readFile(path.join(directory, 'workspace-data.json'), 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw Error('Could not read workspace data: ' + error.message);
          data = {};
        }
        data = { profiles: [], attachments: [], worktrees: [], chatMeta: {}, ...data };
      })();
    await loading;
    return data;
  }
  const save = async () => {
    await store.save(await state());
    await store.flush();
  };
  function serial(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  }
  async function profiles(request = {}) {
    return serial(async () => {
      const s = await state();
      if (request.action === 'save') {
        const p = request.profile || {},
          folder = await fs.realpath(trim(p.cwd, 2000));
        if (!(await fs.stat(folder)).isDirectory()) throw Error('Choose an existing project folder.');
        const name = trim(p.name, 100).trim();
        if (!name) throw Error('Give the project a name.');
        const id = p.id && s.profiles.some((row) => row.id === p.id) ? p.id : randomUUID();
        const previous = s.profiles.find((row) => row.id === id);
        const model = (v) => (/^[A-Za-z0-9._:/-]{1,100}$/.test(v || '') ? v : '');
        const profile = {
          id,
          name,
          cwd: folder,
          instructions: trim(p.instructions, 12000),
          environmentTools: trim(p.environmentTools ?? previous?.environmentTools, 2000),
          environmentCommands: trim(p.environmentCommands ?? previous?.environmentCommands, 4000),
          environmentPrompt: (p.environmentPrompt ?? previous?.environmentPrompt) === true,
          environmentPreflight: (p.environmentPreflight ?? previous?.environmentPreflight) === true,
          commands: trim(p.commands, 4000),
          checkCommands: trim(p.checkCommands, 4000),
          autoCheck: p.autoCheck === true,
          codexModel: model(p.codexModel),
          claudeModel: model(p.claudeModel),
          effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(p.effort) ? p.effort : 'medium',
          maxRuntimeSeconds: null,
        };
        if (s.profiles.length >= 100 && !s.profiles.some((row) => row.id === id))
          throw Error('Up to 100 project profiles are supported.');
        s.profiles = s.profiles.filter((row) => row.id !== id);
        s.profiles.push(profile);
        await save();
        return profile;
      }
      if (request.action === 'delete') {
        s.profiles = s.profiles.filter((row) => row.id !== request.id);
        await save();
      }
      return structuredClone(s.profiles);
    });
  }
  async function profile(id) {
    return structuredClone((await state()).profiles.find((p) => p.id === id) || null);
  }
  const samePath = (a, b) =>
    process.platform === 'win32'
      ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
      : path.resolve(a) === path.resolve(b);
  const lines = (value) =>
    String(value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  // Once per project folder, when a task there finishes unverified, ATLAS offers to turn on
  // completion checks: the folder profile's own commands if it has them, otherwise the ones
  // Project setup detects. Only those recorded commands can later be enabled or run.
  async function checkOffer(folder, detected = [], profileId = '') {
    return serial(async () => {
      const s = await state(),
        cwd = await fs.realpath(folder);
      s.checkOffers ||= {};
      if (Object.keys(s.checkOffers).some((key) => samePath(key, cwd))) return null;
      const owner =
        (profileId && s.profiles.find((row) => row.id === profileId && samePath(row.cwd, cwd))) ||
        s.profiles.find((row) => samePath(row.cwd, cwd));
      if (owner?.autoCheck && lines(owner.checkCommands).length) return null;
      const configured = lines(owner?.checkCommands),
        checks = (configured.length ? configured : detected.map((row) => String(row).trim()).filter(Boolean)).slice(
          0,
          12,
        );
      if (!checks.length) return null;
      s.checkOffers[cwd] = { state: 'offered', checks, at: Date.now() };
      await save();
      return { cwd, checks, configured: configured.length > 0, profileName: owner?.name || '' };
    });
  }
  async function offeredChecks(folder) {
    const s = await state(),
      key = Object.keys(s.checkOffers || {}).find((row) => samePath(row, folder));
    return key ? [...s.checkOffers[key].checks] : [];
  }
  async function answerCheckOffer({ cwd, answer, commands = [] } = {}) {
    return serial(async () => {
      if (!['enable', 'decline'].includes(answer)) throw Error('Choose whether to enable these checks.');
      const s = await state(),
        key = Object.keys(s.checkOffers || {}).find((row) => samePath(row, String(cwd || '')));
      if (!key) throw Error('This check offer is no longer available.');
      const offer = s.checkOffers[key];
      if (answer === 'decline') {
        Object.assign(offer, { state: 'declined', answeredAt: Date.now() });
        await save();
        return { answer };
      }
      const chosen = offer.checks.filter((command) => Array.isArray(commands) && commands.includes(command));
      if (!chosen.length) throw Error('Choose at least one of the offered checks.');
      let owner = s.profiles.find((row) => samePath(row.cwd, key));
      if (owner) {
        // Never replace commands the user already configured; only switch automatic checks on.
        if (!lines(owner.checkCommands).length) owner.checkCommands = chosen.join('\n');
        owner.autoCheck = true;
      } else {
        if (s.profiles.length >= 100) throw Error('Up to 100 project profiles are supported.');
        owner = {
          id: randomUUID(),
          name: path.basename(key).slice(0, 100) || 'Project',
          cwd: key,
          instructions: '',
          commands: '',
          checkCommands: chosen.join('\n'),
          autoCheck: true,
          codexModel: '',
          claudeModel: '',
          effort: 'medium',
          maxRuntimeSeconds: null,
        };
        s.profiles.push(owner);
      }
      Object.assign(offer, { state: 'enabled', answeredAt: Date.now() });
      await save();
      return { answer, profile: structuredClone(owner) };
    });
  }
  async function importBuffers(files) {
    return serial(async () => {
      const s = await state();
      if (s.attachments.length + files.length > 500) throw Error('Attachment storage is full (500 files).');
      if (files.length > 8) throw Error('Select up to eight attachments at a time.');
      const prepared = [];
      for (const item of files) {
        const bytes = item.bytes || (await fs.readFile(item.path));
        const name = path.basename(item.name || item.path),
          ext = path.extname(name).toLowerCase();
        if (!bytes.length || bytes.length > 8 * 1024 * 1024)
          throw Error(name + ': choose a file between 1 byte and 8 MB.');
        if (!textTypes.has(ext) && !imageTypes.has(ext) && !['.pdf', '.docx'].includes(ext))
          throw Error(name + ': use a text/code file or PNG, JPEG, GIF, or WebP image.');
        const image = imageTypes.has(ext);
        if (
          image &&
          !(
            (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
            (['.jpg', '.jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216) ||
            (ext === '.gif' && bytes.subarray(0, 3).toString() === 'GIF') ||
            (ext === '.webp' &&
              bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP')
          )
        )
          throw Error(name + ': image format does not match its extension.');
        const document = ['.pdf', '.docx'].includes(ext);
        if (!image && !document && (bytes.includes(0) || bytes.toString('utf8').length > 150000))
          throw Error(name + ': choose a UTF-8 text file under 150,000 characters.');
        prepared.push({
          id: randomUUID(),
          name,
          size: bytes.length,
          type: image ? 'image' : document ? 'document' : 'text',
          extension: ext,
          sha256: hash(bytes),
          bytes,
        });
      }
      await fs.mkdir(path.join(directory, 'attachments'), { recursive: true });
      for (const item of prepared) {
        await fs.writeFile(path.join(directory, 'attachments', item.id + item.extension), item.bytes);
        const { bytes, ...metadata } = item;
        s.attachments.push(metadata);
      }
      await save();
      return prepared.map(({ bytes, ...metadata }) => metadata);
    });
  }
  async function importPaths(paths) {
    if (!Array.isArray(paths) || paths.length > 8) throw Error('Select up to eight files.');
    const files = [];
    for (const file of paths) {
      if (typeof file !== 'string' || !path.isAbsolute(file)) throw Error('Invalid attachment path.');
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error('Attachments must be files under 8 MB.');
      files.push({ path: file });
    }
    return importBuffers(files);
  }
  async function attachments(ids = []) {
    if (!Array.isArray(ids) || ids.length > 8) throw Error('Use up to eight attachments per message.');
    const s = await state(),
      rows = [];
    for (const id of [...new Set(ids)]) {
      const item = s.attachments.find((a) => a.id === id);
      if (!item) throw Error('Attachment no longer exists. Attach it again.');
      const file = path.join(directory, 'attachments', item.id + item.extension),
        bytes = await fs.readFile(file);
      if (hash(bytes) !== item.sha256)
        throw Error('An attachment changed after import. Attach it again before sending.');
      rows.push({ ...item, file, bytes });
    }
    return rows;
  }
  async function attachmentContext(ids) {
    const rows = await attachments(ids);
    return (
      await Promise.all(
        rows.map(async (item) =>
          item.type === 'document'
            ? { ...item, extracted: await require('./document-extract').extractDocument(item.bytes, item.extension) }
            : item,
        ),
      )
    )
      .map((item) =>
        item.type === 'image'
          ? `USER-SELECTED IMAGE: ${item.name}\nInspect this local image using your image/file reading tools: ${item.file}`
          : `ATTACHMENT: ${item.name}\n<untrusted-file-content>\n${item.extracted ? item.extracted.pages.map((row) => 'Page ' + row.number + '\n' + row.text).join('\n\n') : item.bytes.toString('utf8')}\n</untrusted-file-content>`,
      )
      .join('\n\n');
  }
  async function preview(id) {
    const [a] = await attachments([id]);
    if (a.type === 'document') {
      const extracted = await require('./document-extract').extractDocument(a.bytes, a.extension);
      return {
        ...a,
        bytes: undefined,
        file: undefined,
        preview: extracted.pages.map((row) => 'Page ' + row.number + '\n' + row.text).join('\n\n'),
        document: extracted,
      };
    }
    return a.type === 'image'
      ? {
          ...a,
          bytes: undefined,
          file: undefined,
          preview:
            'data:image/' +
            (a.extension === '.jpg' || a.extension === '.jpeg' ? 'jpeg' : a.extension.slice(1)) +
            ';base64,' +
            a.bytes.toString('base64'),
        }
      : { ...a, bytes: undefined, file: undefined, preview: a.bytes.toString('utf8') };
  }
  const git = (folder, args) => command('git', ['-C', folder, ...args]);
  const initialIgnore = [
    'node_modules/',
    'dist/',
    'build/',
    'vendor/',
    '.venv/',
    'venv/',
    '__pycache__/',
    '.env',
    '.env.*',
    '!.env.example',
    '*.pem',
    '*.key',
    'credentials*.json',
    '.DS_Store',
  ];
  async function repository(cwd) {
    const folder = await projectRoots.assertProject(cwd);
    let root;
    try {
      root = await fs.realpath(await git(folder, ['rev-parse', '--show-toplevel']));
    } catch (error) {
      if (!/not a git repository/i.test(error.message))
        throw Error(
          'Git is unavailable or the repository cannot be read. Install Git using Diagnostics, then restart ATLAS.',
        );
    }
    if (!root) return { exists: false, root: folder };
    if (await projectRoots.isProtected(root))
      return { exists: false, root: folder, ancestorRoot: root, needsOwnRepository: true };
    return {
      exists: true,
      root,
      hasCommit: Boolean(await git(folder, ['rev-parse', '--verify', 'HEAD']).catch(() => '')),
      dirty: Boolean((await git(root, ['status', '--porcelain'])).trim()),
    };
  }
  async function initializeRepository(cwd) {
    return serial(async () => {
      const status = await repository(cwd),
        folder = status.root;
      if (status.exists) {
        if (!status.hasCommit) {
          await command('git', [
            '-C',
            folder,
            '-c',
            'user.name=ATLAS',
            '-c',
            'user.email=atlas@localhost',
            'commit',
            '--allow-empty',
            '-m',
            'Start project',
          ]);
        }
        return repository(folder);
      }
      await git(folder, ['init', '-b', 'main']);
      // Preserve existing ignore rules and exclude common local credentials/dependencies.
      const ignore = path.join(folder, '.gitignore');
      let existing = '';
      try {
        existing = await fs.readFile(ignore, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await fs.writeFile(ignore, existing + '\n# ATLAS initial project exclusions\n' + initialIgnore.join('\n') + '\n');
      // Stage exactly the visible, non-ignored starting files for the initial local snapshot.
      const files = (await git(folder, ['ls-files', '--others', '--exclude-standard', '-z']))
        .split('\0')
        .filter(Boolean);
      for (let i = 0; i < files.length; i += 50) await git(folder, ['add', '--', ...files.slice(i, i + 50)]);
      await command('git', [
        '-C',
        folder,
        '-c',
        'user.name=ATLAS',
        '-c',
        'user.email=atlas@localhost',
        'commit',
        '--allow-empty',
        '-m',
        'Start project',
      ]);
      return repository(folder);
    });
  }
  async function createWorktree(cwd) {
    return serial(async () => {
      const status = await repository(cwd);
      if (!status.exists || !status.hasCommit)
        throw Error(
          'Set up a Git repository inside the selected project folder before starting isolated Colab. An unrelated parent repository cannot be used.',
        );
      const root = status.root;
      if ((await git(root, ['status', '--porcelain'])).trim())
        throw Error(
          'Isolated work starts from a clean Git checkout. Commit or stash your current changes first, or explicitly choose direct editing.',
        );
      const id = randomUUID(),
        destination = path.join(directory, 'worktrees', id),
        baseSha = await git(root, ['rev-parse', 'HEAD']);
      const branch = await git(root, ['symbolic-ref', '--short', 'HEAD']).catch(() => '');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await git(root, ['worktree', 'add', '--detach', destination, baseSha]);
      const row = {
        id,
        root,
        path: destination,
        cwd: path.join(destination, path.relative(root, await fs.realpath(cwd))),
        baseSha,
        branch,
        state: 'active',
        createdAt: Date.now(),
      };
      (await state()).worktrees.push(row);
      await save();
      return structuredClone(row);
    });
  }
  async function tree(id) {
    const row = (await state()).worktrees.find((t) => t.id === id);
    if (!row) throw Error('This isolated workspace was not found.');
    const actual = await fs.realpath(row.path);
    if (actual !== (await fs.realpath(path.join(directory, 'worktrees', row.id))))
      throw Error('Workspace location changed.');
    return row;
  }
  const changedNames = async (row) =>
    [
      ...new Set(
        (await git(row.path, ['diff', '--name-only', '-z', row.baseSha, '--']))
          .split('\0')
          .concat((await git(row.path, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0'))
          .filter(Boolean),
      ),
    ].sort();
  async function review(id) {
    const row = await tree(id),
      names = await changedNames(row);
    if (names.length > 1000) throw Error('This change has over 1,000 files. Review it using Git before applying.');
    const manifest = [];
    let extras = '';
    for (const name of names) {
      const file = path.resolve(row.path, name);
      if (!file.startsWith(path.resolve(row.path) + path.sep)) throw Error('Invalid changed-file path.');
      let fingerprint = 'deleted';
      try {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) fingerprint = 'link:' + (await fs.readlink(file));
        else if (stat.isFile()) {
          const bytes = await fs.readFile(file);
          fingerprint = hash(bytes) + ':' + (stat.mode & 511);
          if (!bytes.includes(0) && bytes.length < 64000)
            extras += `\n--- ${name} (current content) ---\n${bytes.toString('utf8')}\n`;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      manifest.push({ name, fingerprint });
    }
    const patch = await git(row.path, ['diff', '--no-ext-diff', '--no-textconv', row.baseSha, '--']);
    // Other unaccepted tasks from the same project that changed the same files may conflict on accept.
    const overlaps = [];
    if (row.state === 'active')
      for (const other of (await state()).worktrees) {
        if (
          other.id === row.id ||
          other.integratedInto === row.id ||
          other.state !== 'active' ||
          other.root !== row.root
        )
          continue;
        const shared = (await changedNames(other).catch(() => [])).filter((name) => names.includes(name));
        if (shared.length) overlaps.push({ id: other.id, files: shared.slice(0, 20) });
      }
    return {
      id: row.id,
      cwd: row.cwd,
      root: row.root,
      state: row.state,
      baseSha: row.baseSha,
      files: names,
      token: hash(JSON.stringify(manifest)),
      diff: (patch + extras).slice(0, 200000),
      truncated: patch.length + extras.length > 200000,
      prUrl: row.prUrl || '',
      overlaps,
      conflicts: row.conflicts || [],
    };
  }
  async function snapshot(row, title) {
    await git(row.path, ['add', '--all', '--', '.']);
    const treeSha = await git(row.path, ['write-tree']);
    const commit = await command('git', [
      '-C',
      row.path,
      '-c',
      'user.name=ATLAS',
      '-c',
      'user.email=atlas@localhost',
      'commit-tree',
      treeSha,
      '-p',
      row.baseSha,
      '-m',
      trim(title, 120) || 'ATLAS reviewed changes',
    ]);
    await git(row.path, ['update-ref', 'refs/atlas/snapshots/' + row.id, commit]);
    return commit;
  }
  const unmerged = async (folder) =>
    (await git(folder, ['diff', '--name-only', '--diff-filter=U']).catch(() => ''))
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  // The project's current commit, as long as it still builds on the task's starting commit.
  async function movedOn(row) {
    const head = await git(row.root, ['rev-parse', 'HEAD']);
    if (head === row.baseSha) return head;
    const ancestor = await git(row.root, ['merge-base', '--is-ancestor', row.baseSha, head]).then(
      () => true,
      () => false,
    );
    if (!ancestor)
      throw Error(
        'The original branch no longer contains the commit this task started from (it was rebased, reset or switched). Review and merge the isolated checkout manually.',
      );
    return head;
  }
  async function reviewAction(request) {
    return serial(async () => {
      const row = await tree(request.id);
      if (request.action === 'accept' && row.integratedInto) {
        const combined = await tree(row.integratedInto);
        if (combined.state !== 'discarded')
          throw Error('This task belongs to a combined batch. Review and accept its integration workspace instead.');
      }
      if (row.state !== 'active') throw Error('This workspace is already ' + row.state + '.');
      const latest = await review(row.id);
      if (request.token !== latest.token)
        throw Error('Files changed since you opened the review. Refresh the diff before continuing.');
      if (request.action === 'discard') {
        row.snapshot = await snapshot(row, 'Discarded ATLAS work');
        row.state = 'discarded';
        await save();
        return {
          state: row.state,
          message:
            'Changes discarded from the task. The isolated checkout and snapshot are retained locally for recovery.',
        };
      }
      if (!latest.files.length) throw Error('There are no changes to apply.');
      if (request.action === 'accept') {
        if ((await git(row.root, ['status', '--porcelain'])).trim())
          throw Error('The original checkout has uncommitted changes. Commit or stash them, then accept again.');
        // Files an update left conflicted must be resolved before they can reach the project.
        for (const name of row.conflicts || []) {
          const text = await fs.readFile(path.join(row.path, name), 'utf8').catch(() => '');
          if (/^<{7} |^>{7} /m.test(text)) throw Error('Conflict markers remain in ' + name + '. Resolve them first.');
        }
        const head = await movedOn(row);
        row.snapshot = await snapshot(row, 'Apply reviewed ATLAS changes');
        if ((await review(row.id)).token !== request.token)
          throw Error('Files changed while preparing the commit. Review again.');
        // The project may have moved on (another accepted task, your own commits): a normal
        // 3-way cherry-pick applies the task on top. On conflict the project is left unchanged.
        try {
          await command('git', [
            '-C',
            row.root,
            '-c',
            'user.name=ATLAS',
            '-c',
            'user.email=atlas@localhost',
            'cherry-pick',
            row.snapshot,
          ]);
        } catch (error) {
          const conflicts = await unmerged(row.root);
          await git(row.root, ['cherry-pick', '--abort']).catch(() => {});
          if (!conflicts.length) throw error;
          throw Error(
            'These changes conflict with commits made since the task started, in: ' +
              conflicts.join(', ') +
              '. Your project was left unchanged. Use Update task checkout to bring the task up to date, resolve the conflicts there, then review and accept again.',
          );
        }
        row.state = 'accepted';
        row.conflicts = [];
        await save();
        return {
          state: row.state,
          message:
            'Reviewed changes applied as a Git commit in the original project' +
            (head !== row.baseSha ? ', on top of commits made since the task started.' : '.'),
        };
      }
      if (request.action === 'update') {
        const head = await movedOn(row);
        if (head === row.baseSha)
          return { state: row.state, message: 'This task already starts from the latest project commit.' };
        // Keep a recovery snapshot, then rebuild the checkout on the latest commit and re-apply the
        // task's changes. Conflicts stay in the task's own files as conflict markers.
        row.snapshot = await snapshot(row, 'ATLAS task before updating to the latest project');
        await git(row.path, ['reset', '--hard']);
        await git(row.path, ['clean', '-fd']);
        await git(row.path, ['checkout', '--detach', head]);
        let conflicts = [];
        try {
          await git(row.path, ['cherry-pick', '--no-commit', row.snapshot]);
        } catch (error) {
          conflicts = await unmerged(row.path);
          if (!conflicts.length) {
            await git(row.path, ['cherry-pick', '--abort']).catch(() => {});
            await git(row.path, ['reset', '--hard', row.baseSha]).catch(() => {});
            await git(row.path, ['checkout', row.snapshot, '--', '.']).catch(() => {});
            throw error;
          }
        }
        await git(row.path, ['cherry-pick', '--quit']).catch(() => {});
        await git(row.path, ['reset']);
        row.baseSha = head;
        row.conflicts = conflicts;
        await save();
        return {
          state: row.state,
          conflicts,
          message: conflicts.length
            ? 'Task checkout moved to the latest project commit with conflicts in: ' +
              conflicts.join(', ') +
              '. Resolve the conflict markers in the task checkout (or send a Colab follow-up asking to resolve them), then review and accept. The previous state is saved as a recovery snapshot.'
            : 'Task checkout moved to the latest project commit with its changes re-applied. Review again before accepting.',
        };
      }
      if (request.action === 'pull-request') {
        const remote = await git(row.root, ['remote', 'get-url', 'origin']);
        const match = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
        if (!match || !row.branch) throw Error('Draft PRs need a GitHub origin remote and a named base branch.');
        if (row.prUrl) {
          if (row.prReviewToken !== request.token)
            throw Error('Changes differ from the pushed PR. Review the existing branch manually or start a new task.');
          return { url: row.prUrl };
        }
        row.snapshot = await snapshot(row, 'ATLAS reviewed changes');
        if ((await review(row.id)).token !== request.token)
          throw Error('Files changed while preparing the PR. Review again.');
        const branch = 'atlas/' + row.id;
        await git(row.root, ['push', 'origin', row.snapshot + ':refs/heads/' + branch]);
        const bodyFile = path.join(directory, 'worktrees', row.id + '.pr.md');
        await fs.writeFile(
          bodyFile,
          'Changes prepared in an isolated ATLAS workspace. Review the diff and run project checks before merging.\n',
        );
        try {
          row.prUrl = await command(
            'gh',
            [
              'pr',
              'create',
              '--repo',
              match[1],
              '--base',
              row.branch,
              '--head',
              branch,
              '--title',
              'ATLAS reviewed changes',
              '--body-file',
              bodyFile,
              '--draft',
            ],
            row.root,
          );
        } catch {
          row.prUrl =
            'https://github.com/' +
            match[1] +
            '/compare/' +
            encodeURIComponent(row.branch) +
            '...' +
            encodeURIComponent(branch) +
            '?expand=1';
        }
        row.prReviewToken = request.token;
        await save();
        return {
          url: row.prUrl,
          message: row.prUrl.includes('/pull/')
            ? 'Draft pull request created.'
            : 'Branch pushed. Finish creating the pull request in your browser.',
        };
      }
      throw Error('Unknown review action.');
    });
  }
  async function chatMeta(request = {}) {
    return serial(async () => {
      const s = await state();
      const key = trim(request.key, 160);
      if (request.action === 'save') {
        if (!/^(atlas|codex|claude):[A-Za-z0-9-]+$/.test(key)) throw Error('Invalid conversation.');
        const next = { ...s.chatMeta[key], ...request };
        s.chatMeta[key] = {
          title: trim(next.title, 100),
          pinned: next.pinned === true,
          folder: trim(next.folder, 60),
          archived: next.archived === true,
        };
        await save();
      }
      return structuredClone(s.chatMeta);
    });
  }
  async function combineWorktrees(ids, cwd) {
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 8 || new Set(ids).size !== ids.length)
      throw Error('Choose 2–8 distinct task workspaces.');
    const sources = await Promise.all(ids.map(tree));
    const root = (await repository(cwd)).root;
    if (sources.some((row) => row.state !== 'active' || row.root !== root))
      throw Error('All batch tasks must be active workspaces from the same project.');
    const combined = await createWorktree(cwd);
    return serial(async () => {
      const target = await tree(combined.id);
      for (const source of sources) {
        const before = await review(source.id);
        if (!before.files.length) continue;
        const commit = await snapshot(source, 'Parallel ATLAS subtask');
        if ((await review(source.id)).token !== before.token)
          throw Error('Subtask changed during integration. Review the source task and retry.');
        try {
          await git(target.path, ['cherry-pick', '--no-commit', commit]);
        } catch (error) {
          const conflicts = await unmerged(target.path);
          await git(target.path, ['cherry-pick', '--quit']).catch(() => {});
          if (!conflicts.length) throw error;
          target.conflicts = conflicts;
          await save();
          return { ...structuredClone(target), conflicts, needsAttention: true };
        }
      }
      for (const source of sources) source.integratedInto = target.id;
      target.batchSources = ids;
      await save();
      return structuredClone(target);
    });
  }
  return {
    profiles,
    profile,
    checkOffer,
    offeredChecks,
    answerCheckOffer,
    importPaths,
    importBuffers,
    attachments,
    attachmentContext,
    preview,
    repository,
    initializeRepository,
    createWorktree,
    combineWorktrees,
    tree,
    review,
    reviewAction,
    chatMeta,
    flush: () => queue.then(() => store.flush()),
  };
}
module.exports = { createWorkspaceService, command };
