(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { field, launcher } = window.atlasCapabilities;
  power.register('Project environments', async ({ body, node, button, status }) => {
    body.append(
      node('h2', 'Reusable project setup'),
      node(
        'p',
        'Save setup commands per project profile. New editing Colab tasks in isolated workspaces can ask to run the recipe before model work starts. Plan/Compare never run setup. Nothing runs when you save.',
      ),
    );
    const profiles = await api.projects();
    if (!profiles.length) {
      body.append(node('p', 'Create a project profile in Projects first.'));
      return;
    }
    const picker = document.createElement('select');
    picker.setAttribute('aria-label', 'Project profile');
    for (const p of profiles) picker.append(new Option(p.name, p.id));
    body.append(picker);
    const tools = field(body, 'Required tools and versions (documentation only)', '', true),
      commands = field(body, 'Setup commands (one per line, maximum 8)', '', true);
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    const label = node('label', 'Ask to run setup for isolated editing tasks');
    label.append(enabled);
    body.append(label);
    const fill = () => {
      const p = profiles.find((row) => row.id === picker.value);
      tools.value = p.environmentTools || '';
      commands.value = p.environmentCommands || '';
      enabled.checked = p.environmentPrompt === true;
    };
    picker.onchange = fill;
    fill();
    button('Save environment recipe', async () => {
      const original = profiles.find((row) => row.id === picker.value);
      const saved = await api.projects({
        action: 'save',
        profile: {
          ...original,
          environmentTools: tools.value,
          environmentCommands: commands.value,
          environmentPrompt: enabled.checked,
        },
      });
      Object.assign(original, saved);
      status.textContent =
        'Saved locally. Each setup request shows its exact commands and destination before execution.';
    });
  });
  launcher('Tools and data', 'Project environments', 'Project environments');
})();
