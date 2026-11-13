(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.atlasTaskWorkflow = value;
})(typeof window === 'object' ? window : globalThis, () => {
  function fromTask(job) {
    if (job.status !== 'completed') throw Error('Choose a completed task first.');
    const checks = job.verification || job.result?.verification;
    return {
      name: String(job.title || job.prompt || 'Saved task')
        .replace(/\s+/g, ' ')
        .slice(0, 100),
      task: String(job.prompt || '').slice(0, 20000),
      mode: job.request?.mode || 'build',
      criteria: job.request?.criteria || job.request?.acceptanceCriteria || '',
      outOfScope: job.request?.outOfScope || '',
      checks: (checks?.results || [])
        .filter((r) => r.status === 'passed')
        .map((r) => r.command)
        .filter(Boolean)
        .join('\n'),
      steps:
        'Inspect current files and confirm the task scope.\nImplement the requested change.\nRun the reviewed checks and inspect the resulting diff.',
      stopConditions:
        'Ask before changing scope or taking actions needing approval. Report failed or unavailable checks.',
    };
  }
  function parameters(template) {
    const names = [
      ...new Set(
        Object.values(template)
          .filter((v) => typeof v === 'string')
          .flatMap((v) => [...v.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g)].map((m) => m[1])),
      ),
    ];
    if (names.length > 20) throw Error('Use at most 20 workflow inputs.');
    return names;
  }
  function fill(template, values) {
    const names = parameters(template);
    for (const name of names) if (!String(values[name] || '').trim()) throw Error('Enter a value for ' + name + '.');
    return Object.fromEntries(
      Object.entries(template).map(([k, v]) => [
        k,
        typeof v === 'string'
          ? v.replace(/\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g, (_m, n) => String(values[n] || '').slice(0, 2000))
          : v,
      ]),
    );
  }
  return { fromTask, parameters, fill };
});
