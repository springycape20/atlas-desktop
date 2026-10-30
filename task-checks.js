const path = require('node:path');
const { verificationBadge, completeStatus } = require('./verification-badge');
// What ATLAS checks when a task finishes, for Assistant and Colab tasks alike: completion checks, the
// verification badge, and the once-per-folder offer to turn checks on for an unverified project.
// tools is project-tools, passed in so tests that replace it through main.js keep working.
function createTaskChecks({ workspace, changes, jobs, emit, persist, tools, reportsFolder }) {
  const { completionChecks, detectProject } = tools;
  async function check(job) {
    const project = job.projectSnapshot || (await workspace().profile(job.request?.profileId));
    job.verification =
      job.collaboration && job.result?.outcome && job.result.outcome !== 'completed'
        ? { status: 'not-checked', results: [], reason: 'Colab needs attention before completion checks can run.' }
        : job.collaboration && ['plan', 'compare'].includes(job.request?.mode)
          ? { status: 'not-checked', results: [], reason: 'Automatic commands are disabled for read-only Colab modes.' }
          : job.runVerification
            ? await job.runVerification()
            : await completionChecks(project, job.cwd, {
                ...(reportsFolder
                  ? {
                      outputDirectory: path.join(
                        reportsFolder(),
                        require('./request-efficiency').hash(String(job.id)).slice(0, 32),
                        'check-logs',
                      ),
                    }
                  : {}),
                signal: job.signal,
                progress: (text) => {
                  job.statusText = text;
                  job.events.push({ kind: 'command', text, at: Date.now() });
                  emit();
                },
              });
    job.events.push({
      kind: 'progress',
      text:
        'Completion checks: ' +
        job.verification.status +
        (job.verification.reason ? ' · ' + job.verification.reason : ''),
      at: Date.now(),
    });
    job.events = job.events.slice(-100);
    await badge(job);
    if (job.verificationBadge?.level === 'unverified') job.checkOffer = await offer(job);
    if (job.result && typeof job.result === 'object') job.result.checkOffer = job.checkOffer || null;
    emit();
  }
  // What ATLAS verified about a finished task, for its badge and status line.
  async function badge(job) {
    // The badge only matters for work that changed files; read-only Colab modes never get one.
    const changedFiles =
      job.collaboration && ['plan', 'compare'].includes(job.request?.mode)
        ? 0
        : job.changeId
          ? ((
              await changes()
                .report(job.changeId, true)
                .catch(() => null)
            )?.files?.length ?? null)
          : null;
    job.verificationBadge = verificationBadge({
      verification: job.verification,
      result: job.collaboration ? job.result : null,
      changedFiles,
    });
    if (job.result && typeof job.result === 'object') {
      job.result.verification = job.verification;
      job.result.verificationBadge = job.verificationBadge;
    }
  }
  // Once per project folder, an unverified task offers the checks Project setup detects there
  // (or the folder profile's own commands when automatic checks are off).
  async function offer(job) {
    const folder = job.projectFolder || job.cwd;
    try {
      const detected = (await detectProject(folder)).checks;
      return await workspace().checkOffer(folder, detected, job.request?.profileId || '');
    } catch {
      return null;
    }
  }
  // Answers the offer to turn on completion checks.
  async function answerOffer(request) {
    const result = await workspace().answerCheckOffer(request);
    // Other finished tasks from the same folder stop showing the answered offer.
    for (const job of jobs.values())
      if (job.checkOffer && path.resolve(job.checkOffer.cwd).toLowerCase() === path.resolve(request.cwd).toLowerCase())
        job.checkOffer = { ...job.checkOffer, answered: request.answer === 'enable' ? 'enabled' : 'declined' };
    await persist();
    emit();
    return result;
  }
  // Runs the offered checks once on a finished task. Only commands recorded with the offer can run.
  async function runOffered(request) {
    const job = jobs.get(request.jobId);
    if (!job || job.status === 'running') throw Error('This task is not available to check now.');
    const allowed = await workspace().offeredChecks(job.projectFolder || job.cwd),
      commands = allowed.filter((command) => Array.isArray(request.commands) && request.commands.includes(command));
    if (!commands.length) throw Error('Choose at least one of the offered checks.');
    job.verification = await completionChecks({ autoCheck: true, checkCommands: commands.join('\n') }, job.cwd, {
      ...(reportsFolder
        ? {
            outputDirectory: path.join(
              reportsFolder(),
              require('./request-efficiency').hash(String(job.id)).slice(0, 32),
              'check-logs',
            ),
          }
        : {}),
      progress: (text) => {
        job.events.push({ kind: 'command', text, at: Date.now() });
        emit();
      },
    });
    await badge(job);
    if (job.status === 'completed') job.statusText = completeStatus(job.verificationBadge);
    await persist();
    emit();
    return { verification: job.verificationBadge, status: job.verification.status };
  }
  return { check, answerOffer, runOffered };
}
module.exports = { createTaskChecks };
