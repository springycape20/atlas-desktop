const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration, parseVerdict } = require('../collaboration');
const status = (data) => 'ATLAS_COLAB_STATUS ' + JSON.stringify({ decision: 'ready', blockingIssues: [], ...data });

test('text after the status JSON no longer invalidates the verdict', () => {
  const parsed = parseVerdict(
    'Reviewed everything.\n' +
      status({ userResponse: 'All milestones are done.' }) +
      '\n\nLet me know if you want the README expanded further.',
  );
  assert.equal(parsed.valid, true, parsed.error);
  assert.equal(parsed.decision, 'ready');
  assert.equal(parsed.userResponse, 'All milestones are done.');
  assert.equal(parsed.output, 'Reviewed everything.');
});
test('braces, quotes and escapes inside strings do not end the status JSON early', () => {
  const tricky = {
    userResponse: 'Use `total({ price: 1 })` and "quoted {text}" \\ with a backslash',
    handover: { summary: 'a } b { c', decisions: [{ decision: 'keep {x}', reason: 'see "}"' }] },
  };
  const parsed = parseVerdict('Done\n' + status(tricky) + ' trailing note }');
  assert.equal(parsed.valid, true, parsed.error);
  assert.equal(parsed.userResponse, tricky.userResponse);
  assert.equal(parsed.handover.summary, 'a } b { c');
  assert.deepEqual(parsed.handover.decisions, [{ decision: 'keep {x}', reason: 'see "}"' }]);
});
test('a closing fence or second paragraph after the JSON is ignored', () => {
  const fenced = parseVerdict('Done\n```json\n' + status({}) + '\n```\nThanks!');
  assert.equal(fenced.valid, true, fenced.error);
  const changes = parseVerdict(
    'Needs work\n' +
      'ATLAS_COLAB_STATUS ' +
      JSON.stringify({
        decision: 'changes_requested',
        blockingIssues: [{ id: 'F1', criterion: 'TASK', summary: 'Fix it', evidence: 'cart.js:3' }],
      }) +
      ' (see above)',
  );
  assert.equal(changes.valid, true, changes.error);
  assert.equal(changes.issues[0].id, 'F1');
});
test('broken status JSON is still rejected for clarification', () => {
  for (const text of [
    'ATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[',
    'ATLAS_COLAB_STATUS {"decision":"ready",} trailing',
    'ATLAS_COLAB_STATUS ready',
  ]) {
    const parsed = parseVerdict('Report\n' + text);
    assert.equal(parsed.valid, false, text);
  }
  assert.equal(parseVerdict('Report\n' + status({ decision: 'maybe' }) + ' note').valid, false);
});
test('the reproducer is told ATLAS runs its command, so it hands over a command instead of stopping', async () => {
  const prompts = [];
  const run = createCollaboration({
    progress() {},
    runProvider: async (_provider, prompt) => {
      prompts.push(prompt);
      return { output: 'Could not reproduce\nATLAS_COLAB_STATUS {"decision":"blocked","blockingIssues":[]}' };
    },
  });
  await run({ task: 'Cart totals show rounding noise', mode: 'debug' });
  assert.match(prompts[0], /ATLAS runs your command itself after this pass/);
  assert.match(prompts[0], /give a command even if you could not run it here/);
  assert.match(prompts[0], /use blocked only if you cannot find a way to reproduce the bug at all/);
});
