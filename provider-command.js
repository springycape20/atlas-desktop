const { runCheck } = require('./project-tools');
// Commands a provider wrote for ATLAS to run itself (debug reproductions, milestone checks).
// They are untrusted model output, so one runs without asking only when it is one of the
// project's configured checks or passes the routine PowerShell policy.
const configuredChecks = (project) =>
  (project?.checkCommands || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
// A failing run needs a real non-zero exit, not a hang or a command that could not start.
const failsAsExpected = (run) => run?.status === 'failed' && Number.isInteger(run.exitCode) && run.exitCode !== 0;
const passes = (run) => run?.status === 'passed' && run.exitCode === 0;
async function runProviderCommand(
  command,
  {
    cwd,
    signal,
    project,
    phase = '',
    title = 'Run this provider command?',
    purpose = 'ATLAS runs this provider-written command to check the task.',
    ask,
    assess,
    runner = runCheck,
    timeoutMs = 120000,
  } = {},
) {
  command = typeof command === 'string' ? command.trim() : '';
  const base = { command, phase, exitCode: null, output: '' };
  if (!command) return { ...base, status: 'missing', reason: 'There is no command ATLAS can run.', approval: 'none' };
  let run = command,
    approval = 'configured check';
  if (!configuredChecks(project).includes(command)) {
    const policy = assess ? await assess(command).catch((error) => ({ auto: false, reason: error.message })) : null;
    if (policy?.auto) {
      run = policy.arguments.command;
      approval = 'routine command policy';
    } else {
      if (signal?.aborted) return { ...base, status: 'cancelled', reason: 'The task was stopped.', approval: 'none' };
      // Keep the details identical between runs so Allow covers every run of this command.
      const choice = await ask?.({
        title,
        details:
          purpose +
          '\n\nCommand: ' +
          command +
          '\nFolder: ' +
          cwd +
          (policy?.reason ? '\nWhy approval is needed: ' + policy.reason : ''),
      });
      if (!['Allow', 'Allow once'].includes(choice))
        return {
          ...base,
          status: choice === null && signal?.aborted ? 'cancelled' : 'denied',
          reason: 'The command was not approved.',
          approval: 'denied',
        };
      approval = 'approved';
    }
  }
  const result = await runner(run, cwd, { signal, timeoutMs });
  return { ...result, command, phase, approval };
}
// What a collaboration keeps of a run: bounded, and safe to save in checkpoints.
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
module.exports = { runProviderCommand, failsAsExpected, passes, summarize, configuredChecks };
