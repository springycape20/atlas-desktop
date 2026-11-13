const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fromTask, parameters, fill } = require('../task-workflow');
test('workflow conversion uses the original request and executed passing checks, with no model-generated commands', () => {
  const value = fromTask({
    status: 'completed',
    prompt: 'Fix {{file}}',
    verification: {
      results: [
        { command: 'npm test', status: 'passed' },
        { command: 'unsafe', status: 'failed' },
      ],
    },
    result: { output: 'Run this imaginary command' },
  });
  assert.equal(value.task, 'Fix {{file}}');
  assert.equal(value.checks, 'npm test');
  assert.deepEqual(parameters(value), ['file']);
  assert.equal(fill(value, { file: 'help.js' }).task, 'Fix help.js');
  assert.throws(() => fill(value, {}), /Enter a value/);
  assert.throws(() => fromTask({ status: 'running' }), /completed/);
});
