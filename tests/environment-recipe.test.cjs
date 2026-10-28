const test = require('node:test'),
  assert = require('node:assert/strict'),
  { runRecipe } = require('../environment-recipe');
test('environment recipes never run before approval, in read-only mode, or after cancellation; failures stop later commands', async () => {
  let calls = 0,
    asked = 0;
  const options = {
    profile: { environmentPrompt: true, environmentCommands: 'one\ntwo' },
    cwd: 'fixture',
    ask: async () => {
      asked++;
      return 'Run setup';
    },
    runner: async () => {
      calls++;
      return { status: 'failed' };
    },
  };
  assert.equal((await runRecipe({ ...options, readOnly: true })).status, 'skipped');
  assert.equal(asked, 0);
  assert.equal((await runRecipe({ ...options, ask: async () => 'Skip setup' })).status, 'skipped');
  assert.equal(calls, 0);
  await assert.rejects(runRecipe({ ...options, ask: async () => null }), /cancelled/);
  assert.equal(calls, 0);
  assert.equal((await runRecipe(options)).status, 'failed');
  assert.equal(calls, 1);
});
