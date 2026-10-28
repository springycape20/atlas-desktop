const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  { createTaskPlans, draft } = require('../task-plans');
test('plans require explicit revision approval, invalidate it on edit, and persist locally', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-plans-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plans = createTaskPlans(root);
  const plan = await plans.action({
    action: 'save',
    plan: { cwd: root, task: 'Fix navigation', steps: 'Inspect and fix', criteria: 'Keyboard works' },
  });
  assert.throws(() => draft(plan), /Approve/);
  await assert.rejects(plans.action({ action: 'approve', id: plan.id, revision: 0 }), /changed/);
  const approved = await plans.action({ action: 'approve', id: plan.id, revision: 1 });
  assert.match(draft(approved).task, /Inspect and fix/);
  const edited = await plans.action({ action: 'save', plan: { ...approved, steps: 'Different steps' } });
  assert.equal(edited.approved, false);
  assert.equal((await createTaskPlans(root).action())[0].revision, 2);
});
