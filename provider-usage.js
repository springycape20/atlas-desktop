const USAGE_URLS = {
  codex: 'https://chatgpt.com/codex/cloud/settings/analytics#usage',
  claude: 'https://claude.ai/settings/usage',
};
const percent = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
const reset = (value) => {
  const ms = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
};
function windowRow(id, label, used, resetsAt, main = true) {
  const usedPercent = percent(used);
  return {
    id,
    label,
    usedPercent,
    remainingPercent: usedPercent === null ? null : 100 - usedPercent,
    resetsAt: reset(resetsAt),
    main,
  };
}
function summary(provider, windows, plan = null) {
  const main = windows.filter((row) => row.main && row.remainingPercent !== null);
  return {
    provider,
    plan: typeof plan === 'string' ? plan.slice(0, 60) : null,
    windows,
    remainingPercent: main.length ? Math.min(...main.map((row) => row.remainingPercent)) : null,
    usageUrl: USAGE_URLS[provider],
  };
}
function normalizeCodex(data) {
  const byId = data?.rateLimitsByLimitId,
    entries =
      byId && typeof byId === 'object' ? Object.entries(byId).filter(([, row]) => row && typeof row === 'object') : [];
  if (!entries.length && data?.rateLimits) entries.push([data.rateLimits.limitId || 'codex', data.rateLimits]);
  const preferred = entries.find(([id]) => id === 'codex') || entries[0],
    rows = [];
  for (const [id, bucket] of entries.slice(0, 20))
    for (const kind of ['primary', 'secondary']) {
      const item = bucket[kind];
      if (!item) continue;
      const minutes = item.windowDurationMins;
      const label =
        minutes === 10080
          ? 'Weekly · all models'
          : minutes === 300
            ? 'Session limit'
            : Number.isFinite(minutes)
              ? minutes >= 1440
                ? Math.round(minutes / 1440) + '-day limit'
                : minutes >= 60
                  ? Math.round(minutes / 60) + '-hour limit'
                  : minutes + '-minute limit'
              : kind === 'primary'
                ? 'Session limit'
                : 'Weekly limit';
      rows.push(
        windowRow(
          id + ':' + kind,
          (id === preferred?.[0] ? '' : String(bucket.limitName || id).slice(0, 80) + ' · ') + label,
          item.usedPercent,
          item.resetsAt,
          id === preferred?.[0],
        ),
      );
    }
  return summary('codex', rows, preferred?.[1].planType);
}
function normalizeClaude(data, plan) {
  const labels = {
    five_hour: 'Session limit',
    seven_day: 'Weekly · all models',
    seven_day_opus: 'Weekly · Opus',
    seven_day_sonnet: 'Weekly · Sonnet',
    seven_day_oauth_apps: 'Weekly · OAuth apps',
  };
  const rows = [];
  for (const [key, label] of Object.entries(labels))
    if (data?.[key])
      rows.push(
        windowRow(key, label, data[key].utilization, data[key].resets_at, key === 'five_hour' || key === 'seven_day'),
      );
  return summary('claude', rows, plan);
}
function normalizeClaudeReport(report) {
  const limits = report?.rate_limits?.limits;
  if (!Array.isArray(limits))
    return {
      ...summary('claude', []),
      message: "Claude Code did not provide subscription limits. Open Claude's usage page to check your allowance.",
    };
  const rows = limits.slice(0, 20).map((row, i) => {
    const kind = String(row?.kind || 'Usage').slice(0, 80);
    const label =
      kind === 'session'
        ? 'Session limit'
        : kind === 'weekly_all'
          ? 'Weekly · all models'
          : kind === 'weekly_scoped'
            ? 'Weekly'
            : kind.replace(/_/g, ' ');
    const scope = [row?.scope?.model?.display_name, row?.scope?.surface?.display_name]
      .filter((value) => typeof value === 'string')
      .map((value) => value.slice(0, 80));
    return windowRow(
      'report:' + i,
      [label, ...scope].join(' · '),
      row?.percent,
      row?.resets_at,
      kind === 'session' || kind === 'weekly_all',
    );
  });
  return {
    ...summary('claude', rows),
    ...(rows.length ? {} : { message: 'Claude Code reported no usage meters for this account.' }),
  };
}
async function readClaudeUsage({ executable, execute, cwd } = {}) {
  if (!executable || !execute)
    return {
      ...summary('claude', []),
      message: "Install and sign in to Claude Code, or open Claude's usage page to check your allowance.",
    };
  const version = String(await execute(executable, ['--version'], cwd)).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (
    !version ||
    Number(version[1]) < 2 ||
    (Number(version[1]) === 2 && Number(version[2]) === 0) ||
    (Number(version[1]) === 2 && Number(version[2]) === 1 && Number(version[3]) < 273)
  )
    return { ...summary('claude', []), message: 'Update Claude Code to 2.1.273 or later for supported usage reports.' };
  // Run only the built-in report through the unmodified CLI. No project/user hooks,
  // skills or MCP servers, no saved chat, no credential access by ATLAS.
  const output = await execute(
    executable,
    [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--setting-sources',
      '',
      '--settings',
      JSON.stringify({ disableAllHooks: true }),
      '--strict-mcp-config',
      '--mcp-config',
      JSON.stringify({ mcpServers: {} }),
      '--tools',
      '',
      '--max-budget-usd',
      '0.000001',
      '/usage',
    ],
    cwd,
    { timeout: 20000, maxBuffer: 1024 * 1024 },
  );
  let report;
  for (const line of String(output).split('\n')) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type === 'assistant' && row.usage_report) report = row.usage_report;
    if (row.type === 'result' && (row.is_error || (row.subtype && row.subtype !== 'success')))
      throw Error('Claude usage report is unavailable. Open the usage page or retry later.');
  }
  if (!report) throw Error('Claude usage report is unavailable. Update Claude Code or open the usage page.');
  return normalizeClaudeReport(report);
}
function createProviderUsage({ codex, claude = readClaudeUsage, now = Date.now, notify = () => {} }) {
  const cache = new Map(),
    pending = new Map();
  function update(provider, result) {
    const value = { ...result, updatedAt: now(), checkedAt: now(), stale: false, error: null };
    cache.set(provider, value);
    notify(value);
    return value;
  }
  async function get(provider, refresh) {
    const old = cache.get(provider);
    if (old && now() - old.checkedAt < (refresh ? 15000 : 60000)) return old;
    if (pending.has(provider)) return pending.get(provider);
    const promise = Promise.resolve().then(async () => {
      try {
        return update(provider, provider === 'codex' ? normalizeCodex(await codex()) : await claude());
      } catch (error) {
        const value = {
          ...(old || summary(provider, [])),
          checkedAt: now(),
          updatedAt: old?.updatedAt || null,
          stale: true,
          error:
            provider === 'claude' && /^Sign in|^Subscription limits|^Claude (usage|returned)/.test(error.message)
              ? error.message
              : provider === 'claude'
                ? 'Claude usage is unavailable. Check Claude Code sign-in or open its usage page.'
                : 'Codex usage is unavailable. Check that Codex is installed and signed in.',
        };
        cache.set(provider, value);
        notify(value);
        return value;
      } finally {
        pending.delete(provider);
      }
    });
    pending.set(provider, promise);
    return promise;
  }
  return {
    read: async ({ refresh = false, cachedOnly = false } = {}) =>
      Object.fromEntries(
        await Promise.all(
          ['claude', 'codex'].map(async (provider) => [
            provider,
            cachedOnly
              ? cache.get(provider) || {
                  ...summary(provider, []),
                  message:
                    provider === 'claude'
                      ? "Open Claude's usage page to see your allowance."
                      : 'No cached usage. Refresh to check supported provider limits.',
                }
              : await get(provider, refresh),
          ]),
        ),
      ),
    updateCodex: (data) => update('codex', normalizeCodex(data)),
  };
}
module.exports = {
  USAGE_URLS,
  normalizeCodex,
  normalizeClaude,
  normalizeClaudeReport,
  readClaudeUsage,
  createProviderUsage,
};
