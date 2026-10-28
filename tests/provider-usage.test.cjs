const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  normalizeCodex,
  normalizeClaude,
  readClaudeUsage,
  createProviderUsage,
  USAGE_URLS,
} = require('../provider-usage');
const { CodexConnection } = require('../codex-connection');
test('Codex uses account percentages and the main bucket, without mistaking other model limits for the main allowance', () => {
  const data = normalizeCodex({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      special: { primary: { usedPercent: 100 } },
      codex: {
        planType: 'plus',
        primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: 1000 },
        secondary: { usedPercent: 4, windowDurationMins: 10080, resetsAt: 2000 },
      },
    },
  });
  assert.equal(data.remainingPercent, 77);
  assert.equal(data.plan, 'plus');
  assert.equal(data.windows.length, 3);
  assert.equal(data.windows.find((x) => x.id === 'codex:primary').resetsAt, 1000000);
  assert.equal(normalizeCodex({ rateLimits: { primary: { usedPercent: 100 } } }).remainingPercent, 0);
  assert.equal(normalizeCodex({ rateLimits: { primary: { usedPercent: 0 } } }).remainingPercent, 100);
  assert.equal(
    normalizeCodex({ rateLimits: { primary: { usedPercent: null }, secondary: { usedPercent: '25' } } })
      .remainingPercent,
    null,
  );
  assert.equal(normalizeCodex({ rateLimits: { primary: { usedPercent: 120 } } }).remainingPercent, 0);
});
test('Claude reports session and weekly windows with model-specific details and unknown values remain unknown', () => {
  const data = normalizeClaude(
    {
      five_hour: { utilization: 0, resets_at: null },
      seven_day: { utilization: 100, resets_at: '2026-10-25T02:00:00Z' },
      seven_day_opus: { utilization: 35, resets_at: null },
    },
    'max',
  );
  assert.equal(data.remainingPercent, 0);
  assert.equal(data.windows[0].remainingPercent, 100);
  assert.equal(data.windows[0].resetsAt, null);
  assert.equal(data.windows[1].resetsAt, Date.parse('2026-10-25T02:00:00Z'));
  assert.equal(data.windows[2].main, false);
  assert.equal(normalizeClaude({ five_hour: { utilization: null } }).remainingPercent, null);
  assert.equal(normalizeClaude({ seven_day_opus: { utilization: 20 } }).remainingPercent, null);
});
test('Claude usage never reads credentials or sends authenticated requests', async () => {
  let reads = 0,
    requests = 0;
  const result = await readClaudeUsage({
    env: { CLAUDE_CODE_OAUTH_TOKEN: 'test-only', ANTHROPIC_API_KEY: 'test-only' },
    readFile: async () => {
      reads++;
      throw Error('Credentials must not be read');
    },
    fetchImpl: async () => {
      requests++;
      throw Error('Network must not be used');
    },
  });
  assert.equal(reads, 0);
  assert.equal(requests, 0);
  assert.equal(result.remainingPercent, null);
  assert.deepEqual(result.windows, []);
  assert.match(result.message, /usage page/);
  assert.equal(result.usageUrl, USAGE_URLS.claude);
});

test('usage refreshes coalesce, cache briefly, handle offline errors and recover without fabricated quota', async () => {
  let clock = 100000,
    codexCalls = 0,
    claudeCalls = 0,
    offline = false;
  const service = createProviderUsage({
    now: () => clock,
    codex: () => {
      codexCalls++;
      if (offline) throw Error('private error');
      return { rateLimits: { primary: { usedPercent: 25 } } };
    },
    claude: async () => {
      claudeCalls++;
      return normalizeClaude({ five_hour: { utilization: 60 } });
    },
  });
  const [a, b] = await Promise.all([service.read(), service.read()]);
  assert.equal(a.codex.remainingPercent, 75);
  assert.equal(b.claude.remainingPercent, 40);
  assert.equal(codexCalls, 1);
  assert.equal(claudeCalls, 1);
  await service.read({ refresh: true });
  assert.equal(codexCalls, 1);
  clock += 16000;
  await service.read({ refresh: true });
  assert.equal(codexCalls, 2);
  offline = true;
  clock += 61000;
  const old = await service.read();
  assert.equal(old.codex.remainingPercent, 75);
  assert.equal(old.codex.stale, true);
  assert(!old.codex.error.includes('private error'));
  offline = false;
  clock += 61000;
  const recovered = await service.read();
  assert.equal(recovered.codex.stale, false);
  assert.equal(codexCalls, 4);
  const empty = createProviderUsage({
    codex: async () => {
      throw Error('failure');
    },
    claude: async () => {
      throw Error('failure');
    },
  });
  assert.equal((await empty.read()).codex.remainingPercent, null);
});
test('Codex rate-limit notifications update usage without requiring a conversation', () => {
  const connection = new CodexConnection('unused');
  let last;
  connection.onRateLimits = (data) => (last = data);
  connection.receive({
    method: 'account/rateLimits/updated',
    params: { rateLimits: { primary: { usedPercent: 66 } } },
  });
  assert.equal(normalizeCodex(last).remainingPercent, 34);
  assert(USAGE_URLS.claude.startsWith('https://claude.ai/'));
  assert(USAGE_URLS.codex.startsWith('https://chatgpt.com/'));
});
