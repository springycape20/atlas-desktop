(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.atlasWorkOverview = value;
})(typeof window === 'object' ? window : globalThis, () => {
  const pathKey = (value) =>
    String(value || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  const sameProject = (job, cwd) =>
    Boolean(cwd) &&
    [job.cwd, job.originalCwd, job.projectFolder, job.request?.cwd].some((p) => pathKey(p) === pathKey(cwd));
  const attention = new Set(['paused', 'needs_attention', 'limit_reached', 'failed']);
  function bucket(job) {
    if (['running', 'queued', 'starting'].includes(job.status)) return 'active';
    if (job.archived) return 'archived';
    if (job.dismissedAttention === JSON.stringify([job.status, job.endedAt, job.statusText, job.verification?.status]))
      return 'history';
    if (attention.has(job.status) || (job.status === 'completed' && job.verification?.status === 'failed'))
      return 'attention';
    return 'history';
  }
  const title = (job) =>
    String(job.title || job.prompt || 'Untitled task')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
  const newest = (rows) =>
    rows.slice().sort((a, b) => (b.startedAt || b.updatedAt || 0) - (a.startedAt || a.updatedAt || 0));
  function summary(jobs, cwd) {
    const rows = newest(jobs.filter((job) => sameProject(job, cwd)));
    return {
      active: rows.filter((job) => bucket(job) === 'active'),
      attention: rows.filter((job) => bucket(job) === 'attention'),
      history: rows.filter((job) => bucket(job) === 'history'),
    };
  }
  return { pathKey, sameProject, bucket, title, newest, summary };
});
