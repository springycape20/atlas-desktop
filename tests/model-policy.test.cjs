const test = require('node:test'),
  assert = require('node:assert/strict'),
  { clean, select } = require('../model-policy');
test('model tiers respect opt-in, project pins, manual override and provider boundaries', () => {
  const s = {
    modelRoutingEnabled: true,
    fastCodexModel: 'small',
    strongCodexModel: 'large',
    strongClaudeModel: 'reviewer',
  };
  assert.equal(select(s, 'hello', { provider: 'codex' }).model, 'small');
  assert.equal(select(s, 'security migration', { provider: 'codex' }).model, 'large');
  assert.equal(select(s, 'hello', { provider: 'codex', pinned: true }).model, '');
  assert.equal(select(s, 'hello', { provider: 'codex', pinned: true, tier: 'strong' }).model, 'large');
  assert.equal(select({ ...s, modelRoutingEnabled: false }, 'hello', { provider: 'codex' }).model, '');
  assert.equal(select(s, 'hello', { provider: 'local', tier: 'strong' }).model, '');
  assert.throws(() => select(s, 'hi', { provider: 'claude', tier: 'fast' }), /Configure/);
  assert.equal(clean({ fastCodexModel: '; invalid' }).fastCodexModel, '');
});
