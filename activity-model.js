(function (root, factory) {
  const model = factory(
    typeof module === 'object' && module.exports ? require('./work-overview') : root.atlasWorkOverview,
  );
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.atlasActivityModel = model;
})(typeof window === 'object' ? window : globalThis, (work) => {
  function overview(jobs, approvals = [], project = '', now = Date.now()) {
    const rows = work.newest(jobs.filter((job) => !project || work.sameProject(job, project)));
    const pending = project ? approvals.filter((a) => rows.some((j) => a.jobId === j.id)) : approvals;
    const waiting = new Set(pending.map((a) => a.jobId));
    const attention = rows.filter((job) => work.bucket(job) === 'attention' || waiting.has(job.id));
    const active = rows.filter((job) => work.bucket(job) === 'active' && !waiting.has(job.id));
    const completed = rows
      .filter((job) => job.status === 'completed' && !job.archived)
      .sort((a, b) => (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0));
    return {
      attention,
      active,
      completed: completed.slice(0, 5),
      pending,
      finished24h: rows.filter(
        (job) => job.status === 'completed' && job.endedAt >= now - 86400000 && job.endedAt <= now,
      ).length,
    };
  }
  function elapsed(job, now = Date.now()) {
    if (!Number.isFinite(job.startedAt)) return 'Time unavailable';
    const seconds = Math.floor(Math.max(0, (job.endedAt || now) - job.startedAt) / 1000);
    return seconds >= 3600
      ? Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm'
      : seconds >= 60
        ? Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's'
        : seconds + 's';
  }
  return { overview, elapsed };
});
