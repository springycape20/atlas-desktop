(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!api.milestoneHandovers || !power) return;
  power.register('Milestone handovers', async ({ body, node, button, status }) => {
    body.append(
      node('h2', 'Carry a reviewed milestone into a fresh chat'),
      node(
        'p',
        'Create a local packet from a finished task. Review the goal, decisions, constraints and actual checks, then open an unsent fresh-chat draft. The original chat stays available. No model runs while preparing this packet.',
      ),
    );
    const jobs = (await api.jobs()).filter((job) => job.status !== 'running' && job.endedAt);
    const picker = node('select');
    const pickerLabel = node('label', 'Finished task for handover');
    pickerLabel.append(picker);
    for (const job of jobs) picker.append(new Option(String(job.prompt || job.id).slice(0, 100), job.id));
    body.append(pickerLabel);
    button('Create milestone packet', async () => {
      if (!picker.value) throw Error('Finish a task first.');
      await api.milestoneHandovers({ action: 'create', jobId: picker.value });
      await power.show('Milestone handovers');
    });
    const packets = await api.milestoneHandovers({ action: 'list' });
    for (let packet of Array.isArray(packets) ? packets : []) {
      const details = node('details'),
        heading = node('summary', packet.title + (packet.reviewedAt ? ' · reviewed' : ' · needs review'));
      details.append(heading);
      details.append(node('p', packet.cwd + '\n' + packet.note));
      const fields = {};
      for (const [key, title] of [
        ['goal', 'Goal'],
        ['summary', 'Prior summary (model-reported)'],
        ['decisions', 'Decisions and constraints'],
        ['files', 'Changed files'],
        ['checks', 'Executed checks'],
        ['unresolved', 'Unresolved issues'],
        ['nextSteps', 'Next steps'],
      ]) {
        const label = node('label', title),
          input = node('textarea');
        input.rows = 3;
        input.maxLength = key === 'goal' ? 20000 : 6000;
        input.value = packet[key] || '';
        label.append(input);
        details.append(label);
        fields[key] = input;
      }
      const edited = () => Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
      const save = async () => {
        packet = await api.milestoneHandovers({
          action: 'save',
          id: packet.id,
          revision: packet.revision,
          packet: edited(),
        });
        heading.textContent = packet.title + ' · needs review';
      };
      button(
        'Save changes (requires review again)',
        async () => {
          await save();
          status.textContent = 'Saved. Review the updated packet before opening a draft.';
        },
        details,
      );
      button(
        'I reviewed this packet',
        async () => {
          await save();
          packet = await api.milestoneHandovers({
            action: 'review',
            id: packet.id,
            revision: packet.revision,
            confirm: true,
          });
          heading.textContent = packet.title + ' · reviewed';
          status.textContent = 'Current packet reviewed. Choose a fresh unsent draft below.';
        },
        details,
      );
      const provider = node('select');
      provider.setAttribute('aria-label', 'Provider for fresh Assistant handoff');
      for (const [value, label] of [
        ['', 'Keep normal routing'],
        ['codex', 'Hand off to Codex'],
        ['claude', 'Hand off to Claude'],
      ])
        provider.append(new Option(label, value));
      details.append(provider);
      for (const scope of ['assistant', 'colab'])
        button(
          'Open fresh ' + (scope === 'colab' ? 'Colab' : 'Assistant') + ' draft',
          async () => {
            if (Object.entries(fields).some(([key, input]) => input.value !== (packet[key] || '')))
              throw Error('Save and review your latest edits first.');
            const draft = await api.milestoneHandovers({ action: 'draft', id: packet.id, revision: packet.revision });
            if (scope === 'assistant' && provider.value)
              draft.text = 'Use ' + provider.value + ' for this task.\n\n' + draft.text;
            await window.atlasWorkspace.handoverDraft(draft, scope);
            power.close();
          },
          details,
        );
      button(
        'Delete local packet',
        async () => {
          await api.milestoneHandovers({ action: 'remove', id: packet.id });
          await power.show('Milestone handovers');
        },
        details,
      );
      body.append(details);
    }
    if (!packets?.length) body.append(node('p', 'No milestone packets yet.'));
  });
  window.atlasUi?.register('tasks', 'Milestone handovers');
  power.register('Check logs', async ({ body, node, button, status }) => {
    body.append(
      node('h2', 'Local completion-check logs'),
      node(
        'p',
        'Automatic completion checks keep up to 4 MiB per command on this PC. Models receive focused excerpts. Logs can contain project data; review before sharing. Older tasks and some manually run commands may have no saved log.',
      ),
    );
    let count = 0;
    for (const job of await api.jobs())
      for (const [index, row] of (job.verification?.results || []).entries()) {
        if (!row.logFile) continue;
        count++;
        const details = node('details');
        details.append(node('summary', row.command + ' · ' + row.status + (row.logLimited ? ' · size capped' : '')));
        button(
          'Read local preview',
          async () => {
            const result = await api.checkLog({ jobId: job.id, index });
            let pre = details.querySelector('pre');
            if (!pre) {
              pre = node('pre');
              details.append(pre);
            }
            pre.textContent = result.text || '(no output)';
            status.textContent =
              (result.previewLimited ? 'Preview shows the first 64 KB. Reveal the file to inspect more. ' : '') +
              (result.logLimited ? 'Recording reached the 4 MiB cap. ' : '') +
              result.logError;
          },
          details,
        );
        button('Reveal saved log', () => api.checkLog({ jobId: job.id, index, action: 'reveal' }), details);
        body.append(details);
      }
    if (!count) body.append(node('p', 'No saved completion-check logs in retained tasks.'));
  });
  window.atlasUi?.register('tasks', 'Check logs');
})();
