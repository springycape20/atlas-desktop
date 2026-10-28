(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { field, launcher } = window.atlasCapabilities;
  const tier = document.createElement('select');
  tier.id = 'messageModelTier';
  tier.setAttribute('aria-label', 'Model selection');
  for (const [value, label] of [
    ['auto', 'Model: automatic'],
    ['default', 'Configured model'],
    ['fast', 'Fast model'],
    ['strong', 'Strong model'],
  ])
    tier.append(new Option(label, value));
  document.querySelector('.composer .shell-composer-tools').insertBefore(tier, document.getElementById('send'));
  power.register('Model routing', async ({ body, node, button, status }) => {
    const saved = await api.getSettings();
    body.append(
      node('h2', 'Choose models for task complexity'),
      node(
        'p',
        'Automatic routing uses a local prompt-length/keyword heuristic, not a model benchmark. Project model choices take priority; the per-message selector overrides them. Local model mode keeps its own model.',
      ),
    );
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = saved.modelRoutingEnabled === true;
    const label = node('label', 'Enable automatic model tiers for Chat');
    label.append(enabled);
    body.append(label);
    const fields = {};
    for (const [key, title] of [
      ['fastCodexModel', 'Fast Codex model ID'],
      ['strongCodexModel', 'Strong Codex model ID'],
      ['fastClaudeModel', 'Fast Claude model ID'],
      ['strongClaudeModel', 'Strong Claude model ID'],
    ])
      fields[key] = field(body, title, saved[key] || '');
    button('Save model routing', async () => {
      const value = await api.saveSettings({
        ...(await api.getSettings()),
        modelRoutingEnabled: enabled.checked,
        ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()])),
      });
      if (typeof settings === 'object') settings = value;
      status.textContent =
        'Routing saved. Empty automatic tiers keep the configured model; explicit Fast/Strong choices require a configured ID.';
    });
  });
  launcher('Models', 'Configure model routing', 'Model routing');
})();
