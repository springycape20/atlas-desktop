// What ATLAS itself verified about a finished task, for a badge beside its result. Only checks
// ATLAS executed count: configured project checks, a debug reproduction and milestone checks.
// Reviewer acceptance alone is "unverified". Tasks that changed no files get no badge.
const LABELS = {
  passed: 'Checks passed',
  failed: 'Checks failed',
  partial: 'Partly verified',
  unverified: 'Unverified',
};
const passed = (run) => run?.status === 'passed' && (run.exitCode ?? 0) === 0;
function verificationBadge({ verification = null, result = null, changedFiles = null } = {}) {
  if (result?.outcome && result.outcome !== 'completed') return null;
  const reproduction = result?.reproduction?.after,
    done = (result?.milestones || []).filter((row) => row.status === 'done'),
    milestoneRuns = done.filter((row) => row.checkRun),
    uncheckedMilestones = done.filter((row) => !row.check).map((row) => row.id);
  const failures = [
    ...(verification?.status === 'failed'
      ? (verification.results || []).filter((row) => !passed(row)).map((row) => row.command)
      : []),
    ...(reproduction && !passed(reproduction) ? ['the bug reproduction'] : []),
    ...milestoneRuns.filter((row) => !passed(row.checkRun)).map((row) => 'the ' + row.id + ' check'),
  ];
  const badge = (level, reason) => ({ level, label: LABELS[level], reason });
  if (failures.length || verification?.status === 'failed')
    return badge('failed', 'Failed: ' + (failures.join(', ') || 'see the check report') + '.');
  // Failed checks always show; otherwise a task that changed no files needs no badge.
  if (changedFiles === 0) return null;
  // Project checks cover the whole folder, so they verify milestones that had no check of their own.
  if (verification?.status === 'passed') return badge('passed', 'ATLAS ran the configured project checks.');
  const ran = [
    ...(reproduction ? ['the bug reproduction'] : []),
    ...(milestoneRuns.length ? ['checks for ' + milestoneRuns.map((row) => row.id).join(', ')] : []),
  ];
  if (ran.length && uncheckedMilestones.length)
    return badge(
      'partial',
      'ATLAS ran ' +
        ran.join(' and ') +
        '; ' +
        uncheckedMilestones.join(', ') +
        ' had no check and only the reviewer verified ' +
        (uncheckedMilestones.length === 1 ? 'it' : 'them') +
        '.',
    );
  if (ran.length) return badge('passed', 'ATLAS ran ' + ran.join(' and ') + '.');
  return badge(
    'unverified',
    'No ATLAS checks ran, so only the reviewer accepted this work. ' +
      (verification?.reason || 'No completion checks are configured for this project.'),
  );
}
// The task status line for a completed task.
function completeStatus(badge) {
  return badge?.level === 'failed'
    ? 'Complete · checks failed'
    : badge?.level === 'unverified'
      ? 'Complete · unverified'
      : badge?.level === 'partial'
        ? 'Complete · partly verified'
        : 'Complete';
}
module.exports = { verificationBadge, completeStatus, LABELS };
