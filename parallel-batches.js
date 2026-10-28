const { randomUUID } = require('node:crypto');
function batchItems(request, cwd) {
  const tasks = (Array.isArray(request.tasks) ? request.tasks : [])
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (tasks.length < 2 || tasks.length > 8 || tasks.some((task) => task.length > 10000))
    throw Error('Enter 2–8 independent tasks, each under 10,000 characters.');
  const checks = require('./workflow-templates').cleanChecks(request.checks);
  if (!checks) throw Error('Add at least one integration check command.');
  const batchId = randomUUID();
  const children = tasks.map((prompt) => ({
    id: randomUUID(),
    batchId,
    prompt,
    cwd,
    provider: 'colab',
    profileId: String(request.profileId || '').slice(0, 100),
    status: 'queued',
    createdAt: Date.now(),
    roles: 'codex-builds',
  }));
  const integration = {
    id: randomUUID(),
    batchId,
    provider: 'integration',
    cwd,
    profileId: children[0].profileId,
    status: 'queued',
    createdAt: Date.now(),
    dependsOn: children.map((row) => row.id),
    workflowChecks: checks,
    prompt:
      'Integrate and verify this parallel batch. All subtask changes are already combined in this isolated workspace. Inspect the combined diff, fix integration issues within the original task scope, run the configured checks, and obtain independent review. Do not apply changes to the original checkout or publish.\n\nOriginal subtasks:\n' +
      tasks.map((task, index) => `${index + 1}. ${task}`).join('\n'),
  };
  return [...children, integration];
}
module.exports = { batchItems };
