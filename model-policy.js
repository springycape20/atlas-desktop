const keys = ['fastCodexModel', 'strongCodexModel', 'fastClaudeModel', 'strongClaudeModel'];
function clean(value) {
  return Object.fromEntries([
    ['modelRoutingEnabled', value?.modelRoutingEnabled === true],
    ['checkDrivenEscalation', value?.checkDrivenEscalation === true],
    ['contextReuseEnabled', value?.contextReuseEnabled !== false],
    ...keys.map((key) => [key, /^[A-Za-z0-9._:/-]{1,100}$/.test(value?.[key] || '') ? value[key] : '']),
  ]);
}
function select(settings, prompt, { tier = 'auto', provider, pinned = false } = {}) {
  if (!['auto', 'default', 'fast', 'strong'].includes(tier)) throw Error('Unknown model tier.');
  if (provider === 'local' || tier === 'default' || (tier === 'auto' && (!settings.modelRoutingEnabled || pinned)))
    return { model: '', reason: 'configured model' };
  const chosen =
    tier === 'auto'
      ? String(prompt).length >= 800 ||
        /\b(security|migrat\w*|architect\w*|concurren\w*|complex|multi[ -]file)\b/i.test(prompt)
        ? 'strong'
        : 'fast'
      : tier;
  const key = chosen + (provider === 'claude' ? 'Claude' : 'Codex') + 'Model';
  const model = clean(settings)[key];
  if (!model && tier !== 'auto')
    throw Error('Configure the ' + chosen + ' model for ' + provider + ' in Model routing first.');
  return {
    model,
    reason: model
      ? (tier === 'auto' ? 'automatic heuristic' : 'manual') + ' · ' + chosen + ' model'
      : 'tier model not configured; keeping default',
  };
}
module.exports = { clean, select };
