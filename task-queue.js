const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
// settled(row) says whether a finished item's work is done with: an isolated Colab change accepted or
// discarded. Items marked "wait for the task above" start only once the item above is settled.
function createTaskQueue({ directory, run, canRun = () => true, settled = async () => true, notify = () => {} }) {
  const store = require('./atomic-store').createAtomicStore(path.join(directory, 'task-queue.json'));
  let state = { items: [], paused: true, pauseBetween: true, concurrency: 1 },
    loaded,
    scheduling = false,
    lock = Promise.resolve();
  const running = new Set();
  const ready = () =>
    (loaded ||= fs
      .readFile(path.join(directory, 'task-queue.json'), 'utf8')
      .then((text) => {
        state = JSON.parse(text);
        state.paused = true;
        for (const row of state.items)
          if (row.status === 'running') {
            row.status = 'interrupted';
            row.error = 'ATLAS closed during this task. Review its changes before retrying.';
          }
      })
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      }));
  const snapshot = () => structuredClone(state),
    save = async () => {
      await store.save(state);
      await store.flush();
      notify(snapshot());
    };
  // The next item may start only in queue order: Colab items (each in its own worktree) run side by
  // side up to the limit, Assistant items edit folders directly and run alone, and a "wait" item
  // starts only after the item above it is settled.
  async function eligible() {
    const index = state.items.findIndex((r) => r.status === 'queued');
    if (index < 0) return null;
    const row = state.items[index],
      limit = state.pauseBetween ? 1 : state.concurrency || 1,
      others = [...running].map((id) => state.items.find((r) => r.id === id));
    for (const id of row.prerequisites || []) {
      const required = state.items.find((item) => item.id === id);
      if (!required || ['failed', 'interrupted', 'needs-review'].includes(required.status)) {
        state.paused = true;
        row.blockedReason = 'Required task needs review: ' + (required?.prompt?.slice(0, 100) || 'missing task');
        await save();
        return null;
      }
      if (!required || required.status !== 'completed' || !(await settled(structuredClone(required)))) return null;
    }
    delete row.blockedReason;
    if (
      row.dependsOn?.length &&
      !row.dependsOn.every((id) =>
        state.items.some((item) => item.id === id && item.status === 'completed' && item.result?.workspaceId),
      )
    )
      return null;
    if (running.size >= limit) return null;
    if (others.some((r) => r?.provider !== 'colab')) return null;
    if (row.provider !== 'colab' && running.size) return null;
    if (row.waitForPrevious && index > 0) {
      const above = state.items[index - 1];
      if (above.status !== 'completed' || !(await settled(structuredClone(above)))) return null;
    }
    return row;
  }
  function start(row) {
    if (row.dependsOn?.length)
      row.sourceWorkspaces = row.dependsOn.map((id) => state.items.find((item) => item.id === id).result.workspaceId);
    running.add(row.id);
    row.status = 'running';
    row.startedAt = Date.now();
    return (async () => {
      try {
        await save();
        row.result = await run(structuredClone(row));
        row.status = row.result?.checksFailed || row.result?.needsAttention ? 'needs-review' : 'completed';
        if (row.result?.checksFailed || row.result?.needsAttention) {
          // Stop starting new items; items already running finish normally.
          state.paused = true;
          row.error =
            row.result.reason ||
            (row.result.checksFailed
              ? 'Completion checks failed. Review the task before continuing.'
              : 'Colab needs attention before the queue can continue.');
        }
      } catch (error) {
        row.status = 'failed';
        row.error = error.message;
        state.paused = true;
      } finally {
        row.endedAt = Date.now();
        if (state.pauseBetween) state.paused = true;
        running.delete(row.id);
        await save();
        void tick().catch(() => {});
      }
    })();
  }
  // Starts every item that may run now and resolves when those items have finished.
  async function tick() {
    await ready();
    if (scheduling) return;
    scheduling = true;
    const started = [];
    try {
      while (!state.paused && canRun()) {
        const row = await eligible();
        if (!row) break;
        started.push(start(row));
      }
    } finally {
      scheduling = false;
    }
    await Promise.all(started);
  }
  async function action(request = {}) {
    const work = lock.then(async () => {
      await ready();
      const row = state.items.find((r) => r.id === request.id);
      if (request.action === 'add-batch') {
        if (typeof request.cwd !== 'string' || !path.isAbsolute(request.cwd)) throw Error('Choose a project folder.');
        const cwd = await fs.realpath(request.cwd);
        if (!(await fs.stat(cwd)).isDirectory()) throw Error('Choose a project folder.');
        const batch = require('./parallel-batches').batchItems(request, cwd);
        if (state.items.length + batch.length > 100) throw Error('Remove completed tasks before adding this batch.');
        state.items.push(...batch);
        state.paused = true;
        state.pauseBetween = false;
        state.concurrency = [1, 2, 3].includes(request.concurrency) ? request.concurrency : 2;
      } else if (request.action === 'add') {
        const p = request.task || {};
        if (
          typeof p.prompt !== 'string' ||
          !p.prompt.trim() ||
          p.prompt.length > 20000 ||
          typeof p.cwd !== 'string' ||
          !path.isAbsolute(p.cwd)
        )
          throw Error('Enter a task and select its project folder.');
        const cwd = await fs.realpath(p.cwd);
        if (!(await fs.stat(cwd)).isDirectory()) throw Error('Select a project folder.');
        if (state.items.length >= 100) throw Error('Remove completed tasks before adding more (100 maximum).');
        const prerequisites = [...new Set(Array.isArray(p.prerequisites) ? p.prerequisites : [])];
        if (prerequisites.some((id) => !state.items.some((item) => item.id === id && item.cwd === cwd)))
          throw Error('Dependencies must be existing tasks in the same project.');
        state.items.push({
          id: randomUUID(),
          prompt: p.prompt.trim(),
          cwd,
          profileId: String(p.profileId || '').slice(0, 100),
          provider: p.provider === 'colab' ? 'colab' : 'assistant',
          roles: ['codex-builds', 'claude-builds', 'proposals'].includes(p.roles) ? p.roles : 'codex-builds',
          waitForPrevious: p.waitForPrevious === true,
          prerequisites,
          status: 'queued',
          createdAt: Date.now(),
        });
      } else if (request.action === 'dependencies') {
        if (!row || row.status !== 'queued' || row.batchId)
          throw Error('Only ordinary queued tasks can change prerequisites.');
        const ids = [...new Set(Array.isArray(request.prerequisites) ? request.prerequisites : [])],
          index = state.items.indexOf(row);
        if (ids.some((id) => !state.items.slice(0, index).some((item) => item.id === id && item.cwd === row.cwd)))
          throw Error('Choose earlier tasks from the same project; cycles are not allowed.');
        row.prerequisites = ids;
      } else if (request.action === 'start') {
        state.paused = false;
        state.pauseBetween = request.pauseBetween !== false;
        if (request.concurrency !== undefined)
          state.concurrency = [1, 2, 3].includes(request.concurrency) ? request.concurrency : 1;
      } else if (request.action === 'pause') state.paused = true;
      else if (request.action === 'concurrency')
        state.concurrency = [1, 2, 3].includes(request.value) ? request.value : 1;
      else if (request.action === 'wait') {
        if (!row || row.status !== 'queued') throw Error('Only waiting tasks can change when they start.');
        row.waitForPrevious = request.wait === true;
      } else if (request.action === 'move') {
        if (row?.batchId) throw Error('Batch tasks keep their dependency order.');
        if (!row || row.status !== 'queued') throw Error('Only waiting tasks can be reordered.');
        const index = state.items.indexOf(row),
          next = index + (request.direction === 'up' ? -1 : 1);
        if (next >= 0 && next < state.items.length && state.items[next].status === 'queued') {
          const other = state.items[next];
          if ((row.prerequisites || []).includes(other.id) || (other.prerequisites || []).includes(row.id))
            throw Error('Required tasks must stay before the tasks that depend on them.');
          [state.items[index], state.items[next]] = [state.items[next], row];
        }
      } else if (request.action === 'remove') {
        const removing = new Set(
          row?.batchId
            ? state.items.filter((item) => item.batchId === row.batchId).map((item) => item.id)
            : [request.id],
        );
        if (
          state.items.some(
            (item) => !removing.has(item.id) && (item.prerequisites || []).some((id) => removing.has(id)),
          )
        )
          throw Error('Remove dependent tasks first.');
        if (row?.batchId) {
          if (state.items.some((item) => item.batchId === row.batchId && item.status === 'running'))
            throw Error('Stop the batch tasks before removing the batch.');
          state.items = state.items.filter((item) => item.batchId !== row.batchId);
        }
        if (row?.status === 'running') throw Error('Stop the running task in Tasks first.');
        state.items = state.items.filter((r) => r.id !== request.id);
      } else if (request.action === 'retry') {
        if (!row || !['failed', 'interrupted', 'needs-review'].includes(row.status))
          throw Error('Only failed or interrupted tasks can be retried.');
        row.status = 'queued';
        delete row.error;
      }
      await save();
      return snapshot();
    });
    lock = work.catch(() => {});
    const result = await work;
    void tick().catch(() => {});
    return result;
  }
  const timer = setInterval(() => void tick().catch(() => {}), 1500);
  timer.unref();
  return {
    action,
    tick,
    close: async () => {
      clearInterval(timer);
      await ready();
      state.paused = true;
      await save();
    },
  };
}
module.exports = { createTaskQueue };
