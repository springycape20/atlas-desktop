const { runCheck } = require('./project-tools');
// Debug mode: ATLAS runs the provider's reproduction command itself. The command is
// untrusted model output, so it runs without asking only when it is one of the
// project's configured checks or passes the routine PowerShell policy.
const configuredChecks = (project) =>
  (project?.checkCommands || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
// A reproduction must fail on its own (a real non-zero exit), not hang or fail to start.
const failsAsExpected = (run) => run?.status === 'failed' && Number.isInteger(run.exitCode) && run.exitCode !== 0;
const passes = (run) => run?.status === 'passed' && run.exitCode === 0;
async function runReproduction(
  command,
  { cwd, signal, project, phase = 'before', ask, assess, runner = runCheck, timeoutMs = 120000 } = {},
) {
  command = typeof command === 'string' ? command.trim() : '';
  const base = { command, phase, exitCode: null, output: '' };
  if (!command)
    return { ...base, status: 'missing', reason: 'The reproduction has no command ATLAS can run.', approval: 'none' };
  let run = command,
    approval = 'configured check';
  if (!configuredChecks(project).includes(command)) {
    const policy = assess ? await assess(command).catch((error) => ({ auto: false, reason: error.message })) : null;
    if (policy?.auto) {
      run = policy.arguments.command;
      approval = 'routine command policy';
    } else {
      if (signal?.aborted) return { ...base, status: 'cancelled', reason: 'The task was stopped.', approval: 'none' };
      // Keep the details identical before and after the fix so Allow covers both runs.
      const choice = await ask?.({
        title: 'Run the bug reproduction?',
        details:
          'ATLAS runs this provider-written command to confirm the bug fails before the fix and passes after it.\n\nCommand: ' +
          command +
          '\nFolder: ' +
          cwd +
          (policy?.reason ? '\nWhy approval is needed: ' + policy.reason : ''),
      });
      if (!['Allow', 'Allow once'].includes(choice))
        return {
          ...base,
          status: choice === null && signal?.aborted ? 'cancelled' : 'denied',
          reason: 'The reproduction command was not approved.',
          approval: 'denied',
        };
      approval = 'approved';
    }
  }
  const result = await runner(run, cwd, { signal, timeoutMs });
  return { ...result, command, phase, approval };
}
// What the collaboration keeps of a run: bounded, and safe to save in checkpoints.
function summarize(run, fingerprint = null) {
  return {
    command: String(run.command || '').slice(0, 500),
    phase: run.phase,
    status: run.status,
    exitCode: run.exitCode ?? null,
    approval: run.approval,
    output: String(run.output || '').slice(-2000),
    error: String(run.error || run.reason || '').slice(0, 500),
    durationMs: run.durationMs ?? null,
    fingerprint,
    at: Date.now(),
  };
}
module.exports = { runReproduction, failsAsExpected, passes, summarize, configuredChecks };
