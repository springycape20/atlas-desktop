function progress(jobs, approvals = [], now = Date.now()) {
  return jobs
    .filter((job) => job.status === 'running' || job.status === 'paused')
    .slice(0, 100)
    .map((job) => {
      const samples = jobs
        .filter(
          (row) =>
            row.status === 'completed' &&
            Boolean(row.collaboration) === Boolean(job.collaboration) &&
            (row.request?.mode || '') === (job.request?.mode || '') &&
            (row.provider || '') === (job.provider || '') &&
            row.endedAt > row.startedAt,
        )
        .sort((a, b) => b.endedAt - a.endedAt)
        .slice(0, 40)
        .map((row) => row.endedAt - row.startedAt)
        .filter((ms) => ms > 0)
        .sort((a, b) => a - b);
      const elapsedMs = Math.max(0, (job.endedAt || now) - job.startedAt);
      let estimate = null;
      if (samples.length >= 4) {
        const low = samples[Math.floor((samples.length - 1) * 0.25)],
          high = samples[Math.ceil((samples.length - 1) * 0.75)];
        estimate =
          elapsedMs >= high
            ? { outsideRange: true, samples: samples.length }
            : { lowMs: Math.max(0, low - elapsedMs), highMs: high - elapsedMs, samples: samples.length };
      }
      const stages = (job.graph?.nodes || []).filter((row) => ['stage', 'check'].includes(row.kind));
      return {
        id: job.id,
        title: job.prompt,
        status: job.status,
        stage: job.statusText || 'No stage reported',
        elapsedMs,
        estimate,
        waiting: approvals.filter((row) => row.jobId === job.id).map((row) => row.title),
        stages: stages.length,
        finishedStages: stages.filter((row) => ['completed', 'passed', 'accepted'].includes(row.status)).length,
        checks: job.verification?.results?.map((row) => ({ command: row.command, status: row.status })) || [],
      };
    });
}
module.exports = { progress };
