const { redactDiagnostic } = require('./app-log');
function taskEvidence(job, report) {
  const checks = job.verification || job.result?.verification,
    raw = job.result?.usage;
  const usage =
    raw && raw.reported !== false && ['inputTokens', 'outputTokens'].some((key) => Number.isFinite(raw[key]))
      ? Object.fromEntries(
          ['inputTokens', 'outputTokens'].filter((key) => Number.isFinite(raw[key])).map((key) => [key, raw[key]]),
        )
      : null;
  return {
    id: job.id,
    title: job.prompt?.slice(0, 160),
    provider: job.provider,
    status: job.status,
    durationMs:
      Number.isFinite(job.endedAt) && Number.isFinite(job.startedAt) ? Math.max(0, job.endedAt - job.startedAt) : null,
    checks: checks || { status: 'not checked', results: [] },
    usage,
    diff: report
      ? {
          checkedAt: report.checkedAt,
          limited: report.limited,
          files: report.files.map((row) => ({
            path: row.path,
            status: row.status,
            added: row.added,
            removed: row.removed,
            hunks: row.patch?.hunks?.slice(0, 30),
          })),
        }
      : null,
  };
}
function diagnosticBundle({
  version,
  platform,
  jobs,
  log = '',
  includeLogs = false,
  includeOutput = false,
  privatePaths = [],
}) {
  const clean = (value) => {
    let text = String(value || '');
    for (const value of [...new Set(privatePaths.filter(Boolean))].sort((a, b) => b.length - a.length))
      text = text.replaceAll(value, '[local path]');
    return redactDiagnostic(text);
  };
  return {
    format: 'atlas-diagnostics-v1',
    appVersion: version,
    platform,
    generatedAt: new Date().toISOString(),
    failedChecks: jobs
      .flatMap((job) => (job.verification || job.result?.verification)?.results || [])
      .filter((row) => row.status !== 'passed')
      .slice(-20)
      .map((row) => ({
        status: row.status,
        exitCode: row.exitCode,
        ...(includeOutput
          ? { command: clean(row.command).slice(0, 1000), output: clean(row.output || row.error).slice(-8000) }
          : {}),
      })),
    ...(includeLogs ? { log: clean(log.slice(-65536)) } : {}),
    reviewNote:
      'Local export only. Review the full contents before sharing. Redaction is best effort; optional logs and check output may contain project information.',
  };
}
module.exports = { taskEvidence, diagnosticBundle };
