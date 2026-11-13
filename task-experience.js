(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasTaskExperience = api;
})(typeof window === 'object' ? window : globalThis, () => {
  const live = (job) => ['running', 'starting', 'queued'].includes(job.status);
  const attentionKey = (job) => JSON.stringify([job.status, job.endedAt, job.statusText, job.verification?.status]);
  const dismissed = (job) => job.dismissedAttention === attentionKey(job);
  function organize(job, action, pending = []) {
    if (live(job) || pending.some((a) => a.jobId === job.id))
      throw Error('Finish active work and resolve pending approvals before organising this task.');
    if (action === 'archive') job.archived = true;
    else if (action === 'unarchive') job.archived = false;
    else if (action === 'dismiss-attention') job.dismissedAttention = attentionKey(job);
    else if (action === 'restore-attention') delete job.dismissedAttention;
    else throw Error('Unknown task organisation action.');
    return job;
  }
  function lowUsage(value, now = Date.now()) {
    if (!value || value.stale || !Number.isFinite(value.updatedAt) || now - value.updatedAt > 300000) return [];
    return (value.windows || []).filter(
      (row) =>
        row.main !== false &&
        Number.isFinite(row.remainingPercent) &&
        row.remainingPercent <= 10 &&
        (!row.resetsAt || row.resetsAt > now),
    );
  }
  function handoff(job, files = []) {
    const checks = job.verification || job.result?.verification;
    const failed = (checks?.results || []).filter((row) => row.status !== 'passed');
    const concerns = [];
    if (job.status !== 'completed') concerns.push(job.error || job.statusText || 'Task did not complete.');
    if (!checks?.results?.length) concerns.push('No executed check results were recorded.');
    else if (checks.status !== 'passed') concerns.push('Recorded checks have not all passed.');
    if (job.changesError) concerns.push('File change evidence is incomplete: ' + job.changesError);
    return {
      files: files.map((row) => (typeof row === 'string' ? row : row.path)),
      passed: (checks?.results || []).filter((row) => row.status === 'passed').length,
      failed: failed.length,
      concerns,
      next: concerns.length
        ? 'Review unresolved issues and check evidence before continuing.'
        : 'Review the changed files and confirm the result meets your request.',
    };
  }
  async function reviewAllowance(
    usage,
    providers,
    { allowSwitch = false, available = () => true, ask, now = Date.now() },
  ) {
    const warnings = providers.flatMap((provider) =>
      lowUsage(usage[provider], now).map((row) => ({ provider, ...row })),
    );
    if (!warnings.length) return providers[0];
    const other = providers[0] === 'codex' ? 'claude' : 'codex';
    const value = usage[other];
    const alternative =
      allowSwitch &&
      providers.length === 1 &&
      available(other) &&
      value &&
      !value.stale &&
      Number.isFinite(value.updatedAt) &&
      now - value.updatedAt <= 300000 &&
      value.windows?.filter((row) => row.main !== false).length &&
      value.windows
        .filter((row) => row.main !== false)
        .every(
          (row) =>
            Number.isFinite(row.remainingPercent) && row.remainingPercent > 10 && (!row.resetsAt || row.resetsAt > now),
        );
    const decision = await ask({ warnings, alternative: alternative ? other : null });
    if (decision === 'continue') return providers[0];
    if (alternative && decision === other) return other;
    throw Error('Task start cancelled before provider dispatch because allowance is low.');
  }
  return { live, dismissed, organize, lowUsage, handoff, reviewAllowance };
});
