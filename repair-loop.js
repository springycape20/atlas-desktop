const { randomUUID } = require('node:crypto');
function createRepairLoop({
  approve,
  check,
  repair,
  checkpoint,
  busy = () => false,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const loops = new Map();
  let starting = false;
  const snapshot = (row) => {
    const { controller, done, ...value } = row;
    return structuredClone(value);
  };
  async function action(request = {}) {
    if (!request.action || request.action === 'list') return [...loops.values()].map(snapshot);
    if (request.action === 'stop') {
      const row = loops.get(request.id);
      if (!row) throw Error('Repair loop is no longer available.');
      row.controller.abort();
      return snapshot(row);
    }
    if (request.action !== 'start') throw Error('Unknown repair action.');
    if (starting || [...loops.values()].some((row) => row.status === 'running'))
      throw Error('A repair loop is already active.');
    if (busy()) throw Error('Finish running tasks and terminal commands before repairing.');
    const attempts = Number(request.attempts || 2),
      seconds = Number(request.seconds || 300);
    if (
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > 3 ||
      !Number.isInteger(seconds) ||
      seconds < 30 ||
      seconds > 1800
    )
      throw Error('Choose 1–3 repair attempts and 30–1800 seconds.');
    starting = true;
    try {
      const approved = await approve({ ...request, attempts, seconds });
      if (!approved) return { cancelled: true };
      if (busy()) throw Error('Another task started while repair approval was open.');
      const row = {
        id: randomUUID(),
        jobId: request.jobId,
        attempts,
        seconds,
        status: 'running',
        startedAt: now(),
        runs: [],
        controller: new AbortController(),
      };
      loops.set(row.id, row);
      while (loops.size > 20) {
        const old = [...loops.values()].find((row) => row.status !== 'running');
        if (!old) break;
        loops.delete(old.id);
      }
      const timer = setTimer(() => {
        row.timedOut = true;
        row.controller.abort();
      }, seconds * 1000);
      timer.unref?.();
      row.done = (async () => {
        try {
          row.checkpoint = await checkpoint(approved, row.controller.signal);
          let priorVerification;
          for (let attempt = 0; attempt <= attempts; attempt++) {
            row.controller.signal.throwIfAborted();
            const remaining = Math.max(1, seconds * 1000 - (now() - row.startedAt));
            const results =
              priorVerification || (await check(approved, { signal: row.controller.signal, timeoutMs: remaining }));
            priorVerification = null;
            row.runs.push({ attempt, results, at: now() });
            row.controller.signal.throwIfAborted();
            if (approved.commands?.length && results.length !== approved.commands.length) {
              row.status = 'needs-review';
              row.reason = 'Not all approved checks completed.';
              return;
            }
            if (results.length && results.every((result) => result.status === 'passed' && result.exitCode === 0)) {
              row.status = 'passed';
              return;
            }
            if (
              !results.length ||
              results.some(
                (result) =>
                  !['passed', 'failed'].includes(result.status) ||
                  (result.status === 'passed' && result.exitCode !== 0),
              )
            ) {
              row.status = 'needs-review';
              row.reason = 'A check did not complete normally. Automatic repairs stopped.';
              return;
            }
            if (attempt === attempts) {
              row.status = 'exhausted';
              row.reason = 'Attempt limit reached. Review the saved changes and failing checks.';
              return;
            }
            const repaired = await repair(approved, results, {
              signal: row.controller.signal,
              attempt: attempt + 1,
              timeoutMs: Math.max(1, seconds * 1000 - (now() - row.startedAt)),
            });
            row.runs.at(-1).repairJobId = typeof repaired === 'string' ? repaired : repaired.jobId;
            priorVerification = typeof repaired === 'object' ? repaired.verification?.results : null;
          }
        } catch (error) {
          row.status = row.controller.signal.aborted ? (row.timedOut ? 'timed-out' : 'cancelled') : 'failed';
          row.reason = error.message;
        } finally {
          clearTimer(timer);
          row.endedAt = now();
        }
      })();
      return snapshot(row);
    } finally {
      starting = false;
    }
  }
  return {
    action,
    active: () => starting || [...loops.values()].some((row) => row.status === 'running'),
    dispose: () => {
      for (const row of loops.values()) row.controller.abort();
    },
  };
}
module.exports = { createRepairLoop };
