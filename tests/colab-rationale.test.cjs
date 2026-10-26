const test = require('node:test'),
  assert = require('node:assert/strict'),
  { cleanHandover } = require('../colab-efficiency'),
  { createCollaboration, parseVerdict } = require('../collaboration'),
  graph = require('../colab-graph');
const handover = {
  summary: 'Stored totals in cents',
  decisions: [{ decision: 'Use integer cents', reason: 'Floats drift on 0.1 + 0.2' }, 'Keep the API shape'],
  assumptions: ['Prices never exceed 2^53 cents'],
  alternatives: ['Decimal library - adds a dependency for one field'],
  risks: ['Old saved carts still hold float totals'],
  confidence: 'medium',
  confidenceReason: 'Migration of saved carts is untested',
};

test('handovers keep stated reasons, assumptions, alternatives, risks and confidence', () => {
  const clean = cleanHandover(handover);
  assert.deepEqual(clean.decisions, [
    { decision: 'Use integer cents', reason: 'Floats drift on 0.1 + 0.2' },
    { decision: 'Keep the API shape', reason: '' },
  ]);
  assert.deepEqual(clean.assumptions, ['Prices never exceed 2^53 cents']);
  assert.deepEqual(clean.alternatives, ['Decimal library - adds a dependency for one field']);
  assert.deepEqual(clean.risks, ['Old saved carts still hold float totals']);
  assert.equal(clean.confidence, 'medium');
  assert.equal(clean.confidenceReason, 'Migration of saved carts is untested');
});
test('rationale fields are bounded and invalid values are dropped', () => {
  const clean = cleanHandover({
    summary: 'x',
    decisions: [{ reason: 'no decision' }, 42, { decision: '  ' }],
    risks: Array(12).fill('risk'),
    assumptions: [{ text: 'not a string' }],
    confidence: 'certain',
    confidenceReason: 'ignored without a valid confidence',
  });
  assert.deepEqual(clean.decisions, []);
  assert.equal(clean.risks.length, 8);
  assert.deepEqual(clean.assumptions, []);
  assert.equal(clean.confidence, undefined);
  assert.equal(clean.confidenceReason, undefined);
  assert.equal(cleanHandover({ risks: ['x'.repeat(900)] }).risks[0].length, 500);
});
test('every pass asks for the rationale in the handover', async () => {
  const prompts = [],
    run = createCollaboration({
      progress() {},
      runProvider: async (_provider, prompt) => {
        prompts.push(prompt);
        return {
          output: 'Done\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision: 'ready', blockingIssues: [], handover }),
        };
      },
    });
  await run({ task: 'Store totals in cents' });
  for (const prompt of prompts)
    for (const field of ['"reason":"why"', 'assumptions', 'alternatives', 'risks', 'confidenceReason'])
      assert(prompt.includes(field), field);
  assert.match(prompts[0], /not hidden reasoning/);
  const parsed = parseVerdict('Done\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision: 'ready', handover }));
  assert.equal(parsed.handover.decisions[0].reason, 'Floats drift on 0.1 + 0.2');
});
test('graph stages show the stated rationale, marked as model-reported', () => {
  const built = graph.build({
    task: 'Totals',
    reports: [{ provider: 'codex', phase: 'build', decision: 'ready', handover: cleanHandover(handover) }],
  });
  const stage = built.nodes.find((node) => node.id === 'pass:0');
  assert(stage.detail.startsWith('Stored totals in cents'));
  assert.match(stage.detail, /Model-reported rationale \(not verified by ATLAS\)/);
  assert.match(stage.detail, /- Use integer cents \(because Floats drift on 0\.1 \+ 0\.2\)/);
  assert.match(stage.detail, /Assumptions:\n- Prices never exceed/);
  assert.match(stage.detail, /Alternatives considered:\n- Decimal library/);
  assert.match(stage.detail, /Risks:\n- Old saved carts/);
  assert.match(stage.detail, /Confidence: medium - Migration of saved carts is untested/);
  const decision = built.nodes.find((node) => node.id === 'pass:0:decision:0');
  assert.equal(decision.label, 'Use integer cents');
  assert.match(decision.detail, /Reason \(model-reported\): Floats drift/);
});
test('older string-only handovers still render without a rationale section', () => {
  const built = graph.build({
    task: 'Totals',
    reports: [{ provider: 'codex', phase: 'build', handover: { summary: 'Old', decisions: ['Plain decision'] } }],
  });
  assert.equal(built.nodes.find((node) => node.id === 'pass:0:decision:0').label, 'Plain decision');
  assert.match(built.nodes.find((node) => node.id === 'pass:0').detail, /Decisions:\n- Plain decision/);
  const bare = graph.build({ task: 'Totals', reports: [{ provider: 'codex', phase: 'build', output: 'Only output' }] });
  assert.equal(bare.nodes.find((node) => node.id === 'pass:0').detail, 'Only output');
});
test('the shared board passes on top risks and assumptions within its size limit', () => {
  const reports = [{ provider: 'codex', phase: 'build', handover: cleanHandover(handover) }];
  const board = JSON.parse(graph.context({ reports, state: {} }).split('\n').slice(1).join('\n'));
  assert.deepEqual(board.lastHandover.risks, ['Old saved carts still hold float totals']);
  assert.deepEqual(board.lastHandover.assumptions, ['Prices never exceed 2^53 cents']);
  assert.deepEqual(board.lastHandover.decisions, ['Use integer cents', 'Keep the API shape']);
  const crowded = cleanHandover({
    ...handover,
    risks: Array(8).fill('r'.repeat(400)),
    assumptions: Array(8).fill('a'.repeat(400)),
    decisions: Array(8).fill({ decision: 'd'.repeat(400), reason: 'x' }),
    changedFiles: Array(8).fill('f'.repeat(400)),
  });
  const limited = graph.context({
    reports: [{ provider: 'codex', phase: 'build', handover: crowded }],
    state: {},
    limit: 1800,
  });
  assert(limited.length > 0 && limited.length <= 1800 + 200);
  assert.doesNotThrow(() => JSON.parse(limited.split('\n').slice(1).join('\n')));
});
