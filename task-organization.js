const { randomUUID } = require('node:crypto');
const policy = require('./task-experience');
function createTaskOrganization({ jobs, approvals, save, now = Date.now }) {
  const receipts = new Map();
  let serial = Promise.resolve();
  const fields = (job) => ({ archived: job.archived, dismissedAttention: job.dismissedAttention });
  const signature = (job) =>
    JSON.stringify([job.status, job.endedAt, job.statusText, job.verification?.status, fields(job)]);
  const eligible = (job) => {
    if (!job) throw Error('A selected task is no longer available.');
    policy.organize({ ...job }, 'archive', approvals());
  };
  async function action(request) {
    if (request.action === 'undo-organize') {
      const receipt = receipts.get(request.token);
      if (!receipt || now() - receipt.at > 300000)
        throw Error('Undo expired. Use Task centre to restore archived or dismissed tasks.');
      const rows = receipt.rows.map((row) => ({ ...row, job: jobs().find((job) => job.id === row.id) }));
      for (const row of rows) {
        eligible(row.job);
        if (signature(row.job) !== row.after)
          throw Error('A task changed after cleanup. Restore it individually from Task centre.');
      }
      for (const row of rows) Object.assign(row.job, row.before);
      try {
        await save();
      } catch (error) {
        for (const row of rows) Object.assign(row.job, row.current);
        throw error;
      }
      receipts.delete(request.token);
      return { count: rows.length };
    }
    if (!['archive', 'dismiss-attention'].includes(request.operation)) throw Error('Choose Archive or Dismiss.');
    if (!Array.isArray(request.ids) || !request.ids.length || request.ids.length > 100)
      throw Error('Select 1–100 stopped tasks.');
    const rows = [...new Set(request.ids)].map((id) => {
      const job = jobs().find((job) => job.id === id);
      eligible(job);
      return { job, before: fields(job) };
    });
    for (const row of rows) policy.organize(row.job, request.operation, approvals());
    try {
      await save();
    } catch (error) {
      for (const row of rows) Object.assign(row.job, row.before);
      throw error;
    }
    const token = randomUUID();
    receipts.set(token, {
      at: now(),
      rows: rows.map(({ job, before }) => ({ id: job.id, before, current: fields(job), after: signature(job) })),
    });
    while (receipts.size > 10) receipts.delete(receipts.keys().next().value);
    return { count: rows.length, undoToken: token };
  }
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createTaskOrganization };
