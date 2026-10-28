(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { field, folder } = window.atlasCapabilities;
  power.register('Search all work', async ({ body, node, button, current, status }) => {
    body.append(
      node('h2', 'Search chats, task results, decisions and project files'),
      node(
        'p',
        'Search local records with a phrase of at least two characters. Project source excerpts are opt-in and use the existing bounded index and private-file exclusions. Provider chat search covers locally stored transcripts, not private web history.',
      ),
    );
    const query = field(body, 'Search phrase'),
      cwd = field(body, 'Project folder for optional file search', folder());
    const include = document.createElement('input');
    include.type = 'checkbox';
    const label = node('label', 'Include project file excerpts');
    label.append(include);
    body.append(label);
    const results = node('div');
    let revision = 0;
    const search = async () => {
      const version = ++revision,
        text = query.value.trim();
      results.replaceChildren();
      if (text.length < 2) {
        status.textContent = 'Enter at least two characters.';
        return;
      }
      status.textContent = 'Searching local records…';
      const sources = [
        [
          'tasks and messages',
          async () => (await api.searchWork({ query: text })).map((row) => ({ ...row, matched: true })),
        ],
        [
          'provider transcripts',
          async () =>
            (await api.historyList({ query: text })).map((chat) => ({
              kind: 'transcript',
              matched: true,
              title: chat.title,
              text: chat.searchText || chat.title,
              chat,
              id: chat.id,
            })),
        ],
        [
          'saved memories',
          async () =>
            (await api.memory({ action: 'list' })).map((item) => ({
              kind: 'memory',
              title: item.category + ' · ' + (item.projectFolder || 'Global'),
              text: item.text,
              id: item.id,
              at: item.updatedAt,
            })),
        ],
      ];
      if (include.checked)
        sources.push([
          'project files',
          async () => {
            const result = await api.projectKnowledge({ cwd: cwd.value.trim(), query: text });
            return (result.results || []).map((file) => ({
              kind: 'file',
              matched: true,
              title: file.path + ':' + file.line,
              text: file.excerpt,
              id: file.path,
            }));
          },
        ]);
      const settled = await Promise.allSettled(sources.map(([, read]) => read()));
      if (!current() || version !== revision) return;
      const rows = settled.flatMap((value) => (value.status === 'fulfilled' ? value.value : []));
      for (const chat of window.atlasColab?.history() || [])
        rows.push({
          kind: 'Colab chat',
          title: chat.title,
          text: (chat.turns || [])
            .map((turn) => turn.content)
            .join('\n')
            .slice(-20000),
          colabId: chat.id,
        });
      const matches = window.atlasSearchResults.rank(rows, text);
      for (const match of matches) {
        const row = node('details');
        row.append(node('summary', match.title + ' · ' + match.kind), node('pre', match.text));
        if (match.jobId)
          button(
            'Open task',
            async () => {
              await api.taskOpen(match.jobId);
              power.close();
            },
            row,
          );
        else if (match.colabId)
          button(
            'Open Colab chat',
            () => {
              window.atlasColab.selectChat(match.colabId);
              power.close();
            },
            row,
          );
        else if (match.conversationId)
          button(
            'Open Chat conversation',
            async () => {
              await window.atlasAssistant.open(match.conversationId);
              power.close();
            },
            row,
          );
        else if (match.chat)
          button(
            'Read local transcript',
            async () => {
              const chat = await api.historyRead({ provider: match.chat.provider, id: match.chat.id });
              row.append(node('pre', (chat.turns || []).map((turn) => turn.role + ': ' + turn.content).join('\n\n')));
            },
            row,
          );
        results.append(row);
      }
      if (!matches.length) results.append(node('p', 'No matching retained records.'));
      const failed = settled.flatMap((value, index) => (value.status === 'rejected' ? [sources[index][0]] : []));
      status.textContent =
        matches.length +
        ' results shown (maximum 200).' +
        (failed.length ? ' Unavailable sources: ' + failed.join(', ') + '.' : '');
    };
    button('Search local work', search);
    body.append(results);
    query.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void search().catch((error) => (status.textContent = error.message));
      }
    });
  });
  window.atlasUi.register('library', 'Search all work');
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void window.atlasUi.open('library', 'Search all work');
    }
  });
})();
