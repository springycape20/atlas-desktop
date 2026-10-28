const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function createTaskPlans(directory) {
  const file = path.join(directory, 'task-plans.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let serial = Promise.resolve();
  async function read() {
    try {
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(value)) throw Error('Invalid plan data');
      return value.slice(-50);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  function action(request = {}) {
    const operation = serial.then(async () => {
      let rows = await read();
      if (!request.action || request.action === 'list') return rows;
      if (request.action === 'delete') rows = rows.filter((row) => row.id !== request.id);
      else if (request.action === 'save') {
        const source = request.plan || {},
          cwd = await fs.realpath(String(source.cwd || ''));
        if (!(await fs.stat(cwd)).isDirectory()) throw Error('Choose a project folder.');
        const text = (key, max) =>
          String(source[key] || '')
            .trim()
            .slice(0, max);
        const task = text('task', 12000),
          steps = text('steps', 8000),
          criteria = text('criteria', 4000);
        if (!task || !steps || !criteria) throw Error('A plan needs a task, steps and acceptance criteria.');
        const previous = rows.find((row) => row.id === source.id);
        if (!previous && rows.length >= 50) throw Error('Delete an old plan before adding another.');
        const plan = {
          id: previous?.id || randomUUID(),
          cwd,
          task,
          steps,
          criteria,
          files: text('files', 4000),
          outOfScope: text('outOfScope', 4000),
          revision: (previous?.revision || 0) + 1,
          approved: false,
          updatedAt: Date.now(),
        };
        rows = rows.filter((row) => row.id !== plan.id);
        rows.push(plan);
        await store.save(rows);
        return plan;
      } else if (request.action === 'approve') {
        const plan = rows.find((row) => row.id === request.id);
        if (!plan || plan.revision !== request.revision)
          throw Error('The plan changed. Review the latest revision first.');
        plan.approved = true;
        plan.approvedAt = Date.now();
        await store.save(rows);
        return plan;
      } else throw Error('Unknown plan action.');
      await store.save(rows);
      return rows;
    });
    serial = operation.catch(() => {});
    return operation;
  }
  return { action };
}
function draft(plan) {
  if (!plan.approved) throw Error('Approve this plan first.');
  return {
    name: 'Approved plan',
    mode: 'build',
    cwd: plan.cwd,
    criteria: plan.criteria,
    outOfScope: plan.outOfScope,
    task:
      plan.task +
      '\n\nApproved steps:\n' +
      plan.steps +
      '\n\nExpected affected files (verify before editing):\n' +
      (plan.files || 'Determine during investigation.'),
  };
}
module.exports = { createTaskPlans, draft };
