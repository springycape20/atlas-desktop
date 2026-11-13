(() => {
  const api = window.atlas,
    power = window.atlasPower;
  let requestedFolder = '';
  power.register('Project setup assistant', async ({ body, node, button, current, status }) => {
    body.append(
      node('h2', 'Set up a project for ATLAS'),
      node(
        'p',
        'Detect likely checks and run commands, review prerequisites, then save a project profile. Nothing is installed or executed by this assistant.',
      ),
    );
    const folder = node('input');
    folder.setAttribute('aria-label', 'Setup project folder');
    folder.value = requestedFolder || power.request().cwd || '';
    body.append(folder);
    const nameLabel = node('label', 'Project name'),
      name = node('input');
    name.setAttribute('aria-label', 'Setup project name');
    nameLabel.append(name);
    body.append(nameLabel);
    const instructionsLabel = node('label', 'Project instructions'),
      instructions = node('textarea');
    instructions.rows = 3;
    instructionsLabel.append(instructions);
    body.append(instructionsLabel);
    const results = node('section');
    body.append(results);
    let detected = null,
      original = null,
      revision = 0,
      selection = [];
    folder.oninput = () => {
      revision++;
      detected = null;
      results.replaceChildren();
    };
    button('Choose project folder', async () => {
      const value = await api.pickFolder();
      if (value) {
        folder.value = value;
        folder.dispatchEvent(new Event('input'));
      }
    });
    button('Detect project setup', async () => {
      const id = ++revision,
        expected = folder.value;
      status.textContent = 'Inspecting local manifests and tool paths…';
      const [value, profiles] = await Promise.all([api.setupAssistant({ cwd: expected }), api.projects()]);
      if (!current() || id !== revision || folder.value !== expected) return;
      detected = value;
      original = profiles.find(
        (p) => window.atlasWorkOverview.pathKey(p.cwd) === window.atlasWorkOverview.pathKey(value.cwd),
      );
      name.value = original?.name || value.name;
      instructions.value = original?.instructions || '';
      selection = [];
      results.replaceChildren(node('h3', value.types.join(', ') || 'No supported manifest found'));
      for (const tool of value.prerequisites)
        results.append(node('p', tool.name + ' · ' + (tool.available ? 'found on PATH' : 'missing or unavailable')));
      for (const [key, label] of [
        ['checks', 'Completion checks'],
        ['runs', 'Useful run commands'],
        ['installs', 'Optional environment setup commands'],
      ]) {
        results.append(node('h3', label));
        for (const command of value[key]) {
          const wrap = node('label', command),
            box = node('input');
          box.type = 'checkbox';
          box.checked =
            key === 'checks'
              ? Boolean(original?.checkCommands?.split('\n').includes(command))
              : key === 'runs'
                ? Boolean(original?.commands?.split('\n').includes(command))
                : Boolean(original?.environmentCommands?.split('\n').includes(command));
          wrap.prepend(box);
          results.append(wrap);
          selection.push({ key, command, box });
        }
        if (!value[key].length) results.append(node('p', 'None detected.'));
      }
      results.append(node('p', value.note));
      if (value.limited)
        results.append(node('p', 'Folder listing was limited; review the profile manually for omitted commands.'));
      status.textContent =
        'Review each command. Selected commands will be saved only; automatic checks and setup keep their existing opt-in settings.';
    });
    button('Save reviewed project profile', async () => {
      if (!detected) throw Error('Detect the selected folder first.');
      if (!name.value.trim()) throw Error('Enter a project name.');
      const chosen = (key) =>
        selection
          .filter((r) => r.key === key && r.box.checked)
          .map((r) => r.command)
          .join('\n');
      const saved = await api.projects({
        action: 'save',
        profile: {
          ...original,
          name: name.value,
          cwd: detected.cwd,
          instructions: instructions.value,
          checkCommands: chosen('checks'),
          commands: chosen('runs'),
          environmentCommands: chosen('installs'),
          environmentTools: detected.prerequisites.map((t) => t.name).join('\n'),
          autoCheck: original?.autoCheck === true,
          environmentPrompt: original?.environmentPrompt === true,
          environmentPreflight: original?.environmentPreflight === true,
        },
      });
      original = saved;
      await window.atlasWorkspace.refreshProfiles();
      status.textContent =
        'Project profile saved locally. No command ran. Enable automatic checks or approved setup separately in project settings.';
    });
    button('Open project settings', () => {
      power.close();
      return window.atlasWorkspace.open.projects();
    });
  });
  window.atlasSetupAssistant = {
    open: (cwd) => {
      requestedFolder = cwd || '';
      return power.show('Project setup assistant');
    },
  };
  window.atlasUi.register('tasks', 'Project setup assistant');
})();
