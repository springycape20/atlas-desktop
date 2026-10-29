async function inspectRecovery(job, tracker) {
  const point = job.resumeCheckpoint;
  if (!point?.id)
    return {
      verified: false,
      legacy: true,
      reason: 'No verified file checkpoint was recorded for this older task.',
      remaining: 'Review its changes and start a new task if the previous state is uncertain.',
    };
  const check = await tracker.verifySnapshot(point.id);
  const verified = check.matches && check.complete;
  return {
    verified,
    checkpoint: point,
    changedFiles: check.files,
    complete: check.complete,
    reason: verified
      ? 'Tracked files match the saved checkpoint.'
      : !check.complete
        ? 'The checkpoint is incomplete. Resume cannot be verified.'
        : 'Files changed after the saved checkpoint. Review or restore before resuming.',
    remaining: job.collaboration
      ? `Continue after ${point.stages || 0} recorded stages; incomplete stages may run again. Provider review and executed checks still need to pass.`
      : 'Continue the saved conversation from this reviewed file state. The interrupted provider request may need to run again.',
  };
}
async function requireVerifiedRecovery(job, tracker) {
  if (!job?.resumeCheckpoint) return; // Existing tasks remain explicitly labelled unverified in Recovery.
  const result = await inspectRecovery(job, tracker);
  if (!result.verified) throw Error(result.reason + ' Open Tasks → Recovery.');
}
module.exports = { inspectRecovery, requireVerifiedRecovery };
