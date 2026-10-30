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
    label.className = 'power-toggle';
    label.prepend(enabled);
    body.append(label);
    const escalation = document.createElement('input');
    escalation.type = 'checkbox';
    escalation.checked = saved.checkDrivenEscalation === true;
    const repairLabel = node('label', 'Allow one stronger-model repair after executed completion checks fail');
    repairLabel.className = 'power-toggle';
    repairLabel.prepend(escalation);
    body.append(repairLabel);
    body.append(
      node(
        'p',
        'Assistant automatic tier only: requires changed files, distinct configured Fast/Strong models and a failed check exit code. Project pins, manual model choices, read-only and local chat are excluded. This can use additional tokens; the same checks run again. Colab retains its existing builder/reviewer workflow.',
      ),
    );
    const reuse = document.createElement('input');
    reuse.type = 'checkbox';
    reuse.checked = saved.contextReuseEnabled !== false;
    const reuseLabel = node(
      'label',
      'Reuse unchanged attachment/project references in confirmed retained Assistant sessions',
    );
    reuseLabel.className = 'power-toggle';
    reuseLabel.prepend(reuse);
    body.append(reuseLabel);
    body.append(
      node(
        'p',
        'Only unchanged reference blocks are shortened. Current requests, instructions and memories stay intact. Full references return after five turns, 15 minutes or an uncertain/new session. Turn this off to resend full references on every request. Provider cache discounts and subscription savings are not measurable here.',
      ),
    );
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
        checkDrivenEscalation: escalation.checked,
        contextReuseEnabled: reuse.checked,
        ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()])),
      });
      if (typeof settings === 'object') settings = value;
      status.textContent =
        'Routing saved. Empty automatic tiers keep the configured model; explicit Fast/Strong choices require a configured ID.';
    });
  });
  launcher('Models', 'Configure model routing', 'Model routing');
})();
