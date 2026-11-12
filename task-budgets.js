const fs = require('node:fs/promises'),
  path = require('node:path');
const fields = { seconds: [1, 86400], providerCalls: [1, 100], repairAttempts: [0, 30], estimatedTokens: [1, 2000000] };
function clean(value = {}) {
  const result = { enabled: value.enabled === true, confirmEscalation: value.confirmEscalation !== false };
  for (const [key, [min, max]] of Object.entries(fields)) {
    const raw = value[key];
    if (raw === undefined || raw === null || raw === '') {
      result[key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max)
      throw Error('Invalid ' + key + ' budget (' + min + '–' + max + ').');
    result[key] = n;
  }
  return result;
}
function createTaskBudgets(directory) {
  const file = path.join(directory, 'task-budgets.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let serial = Promise.resolve();
  async function action(request = {}) {
    let cwd;
    try {
      cwd = await require('./project-root').createProjectRootGuard().assertProject(request.cwd);
    } catch (error) {
      if (request.action === 'save') throw error;
      return clean();
    }
    const rows = JSON.parse(
      await fs.readFile(file, 'utf8').catch((e) => {
        if (e.code === 'ENOENT') return '{}';
        throw e;
      }),
    );
    if (request.action === 'save') {
      if (!rows[cwd] && Object.keys(rows).length >= 100) throw Error('Budget project limit reached.');
      rows[cwd] = clean(request.limits);
      await store.save(rows);
      await store.flush();
    }
    return clean(rows[cwd]);
  }
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
function attach(job, limits, abort, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  limits = clean(limits);
  job.budget = {
    ...job.budget,
    limits,
    calls: job.budget?.calls || 0,
    repairs: job.budget?.repairs || 0,
    estimatedTokens: job.budget?.estimatedTokens || 0,
    reportedInput: job.budget?.reportedInput ?? null,
    reportedOutput: job.budget?.reportedOutput ?? null,
    usageComplete: job.budget?.usageComplete !== false,
  };
  const fail = (reason) => {
    job.stopped = 'paused';
    job.budget.stopReason = reason;
    abort();
    throw Error(reason);
  };
  let timer;
  if (limits.enabled && limits.seconds) {
    const remaining = limits.seconds * 1000 - (job.budget.usedMs || 0);
    timer = setTimer(
      () => {
        job.stopped = 'paused';
        job.budget.stopReason = 'Task duration budget reached.';
        abort();
      },
      Math.max(0, remaining),
    );
    timer?.unref?.();
  }
  return {
    before(prompt, { repair = false } = {}) {
      if (job.signal?.aborted) throw Error(job.budget.stopReason || 'Task stopped.');
      const estimate = Math.ceil(String(prompt).length / 4),
        b = job.budget;
      if (limits.enabled) {
        if (limits.seconds && (b.usedMs || 0) + now() - (b.runStartedAt ?? now()) >= limits.seconds * 1000)
          fail('Task duration budget reached.');
        if (limits.providerCalls !== null && b.calls >= limits.providerCalls)
          fail('ATLAS provider-call budget reached.');
        if (limits.estimatedTokens !== null && b.estimatedTokens + estimate > limits.estimatedTokens)
          fail('ATLAS outgoing text estimate budget reached.');
        if (repair && limits.repairAttempts !== null && b.repairs >= limits.repairAttempts)
          fail('Repair-attempt budget reached.');
      }
      b.calls++;
      b.estimatedTokens += estimate;
      if (repair) b.repairs++;
    },
    record(result) {
      const usage = result?.usage;
      if (usage?.complete === false) job.budget.usageComplete = false;
      for (const [field, key] of [
        ['reportedInput', 'inputTokens'],
        ['reportedOutput', 'outputTokens'],
      ]) {
        if (Number.isFinite(usage?.[key]) && usage[key] >= 0) job.budget[field] = (job.budget[field] || 0) + usage[key];
        else job.budget.usageComplete = false;
      }
    },
    dispose() {
      if (timer) clearTimer(timer);
    },
  };
}
module.exports = { createTaskBudgets, attach, clean };
