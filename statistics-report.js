const { randomUUID } = require('node:crypto');
const schema = require('./statistics-schema');
const month = (date) => new Date(date).toISOString().slice(0, 7);
function periods(now = Date.now()) {
  const date = new Date(now);
  return Array.from({ length: 12 }, (_, index) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - index, 1)).toISOString().slice(0, 7),
  );
}
function createReport({ jobs, period, version, now = Date.now(), id = randomUUID() }) {
  if (!periods(now).includes(period)) throw Error('Choose a month from the past twelve months.');
  const report = {
    schema: 'atlas-statistics/v1',
    reportId: id,
    period,
    versionFamily: String(version).split('.').slice(0, 2).join('.'),
    coverage: 'retained-task-sample',
    rounding: 5,
    outcomes: { completed: 0, failed: 0, cancelled: 0 },
    features: { colabTasks: 0, isolatedTasks: 0, tasksWithChecks: 0, tasksWithSetup: 0 },
  };
  for (const job of jobs.slice(-200)) {
    if (!['completed', 'failed', 'cancelled', 'stopped'].includes(job.status)) continue;
    const at = job.endedAt || job.startedAt;
    if (!Number.isFinite(at) || month(at) !== period) continue;
    report.outcomes[job.status === 'stopped' ? 'cancelled' : job.status]++;
    if (job.collaboration) report.features.colabTasks++;
    if (job.workspaceId) report.features.isolatedTasks++;
    if (['passed', 'failed', 'timed-out'].includes(job.verification?.status)) report.features.tasksWithChecks++;
    if (['passed', 'failed', 'timed-out'].includes(job.environment?.status)) report.features.tasksWithSetup++;
  }
  const rounded = (value) => Math.round(value / 5) * 5;
  for (const key of schema.outcomes) report.outcomes[key] = rounded(report.outcomes[key]);
  const total = Object.values(report.outcomes).reduce((a, b) => a + b, 0);
  for (const key of schema.features) report.features[key] = Math.min(total, rounded(report.features[key]));
  return schema.validate(report);
}
function registerStatistics({ ipcMain, trusted, jobs, version, dialog, window, now = Date.now }) {
  let pending;
  ipcMain.handle('atlas:statistics-report', async (event, request = {}) => {
    if (!trusted(event)) throw Error('Untrusted app window.');
    if (request.action === 'months') return periods(now());
    if (request.action === 'discard') {
      pending = null;
      return { discarded: true };
    }
    if (request.action === 'preview') {
      if (request.confirmed !== true) throw Error('Confirm the optional report notice first.');
      const report = createReport({ jobs: jobs(), version, period: request.period, now: now() });
      pending = { report, token: randomUUID(), expires: now() + 5 * 60 * 1000 };
      return { report, token: pending.token };
    }
    if (request.action !== 'export') throw Error('Unknown statistics action.');
    if (!pending || pending.token !== request.token || pending.expires < now())
      throw Error('Preview and review the report again before exporting.');
    const reviewed = pending;
    const target = await dialog.showSaveDialog(window(), {
      title: 'Save optional statistics report — nothing is uploaded',
      defaultPath: 'atlas-statistics-' + reviewed.report.period + '-' + reviewed.report.reportId + '.json',
      filters: [{ name: 'Statistics report', extensions: ['json'] }],
    });
    if (target.canceled || !target.filePath) return { cancelled: true };
    if (pending !== reviewed || reviewed.expires < now())
      throw Error('Report preview expired or was discarded. Review it again.');
    const fs = require('node:fs/promises'),
      path = require('node:path');
    const temporary = path.join(path.dirname(target.filePath), '.atlas-statistics-' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(temporary, JSON.stringify(reviewed.report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, target.filePath);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    pending = null;
    return { saved: true, reportId: reviewed.report.reportId };
  });
}
module.exports = { createReport, periods, registerStatistics };
