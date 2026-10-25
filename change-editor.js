(() => {
  const api = window.atlas;
  if (!api.changes) return;
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const syntax = window.atlasSyntax;
  let editPaint = 0,
    diffPaint = 0,
    syntaxTimer;
  const jobs = new Map();
  let summary = null,
    currentJob = null,
    pinnedJob = '',
    selectedFile = null,
    selectedPath = '',
    dirty = false,
    mode = 'diff',
    busy = false,
    queued = false,
    timer,
    loadSequence = 0;
  const style = el('style');
  style.textContent = `.change-bubble{position:fixed;left:50%;transform:translateX(-50%);bottom:8px;z-index:12;display:flex;align-items:center;gap:10px;border:1px solid #3b505c;border-radius:22px;padding:8px 14px;background:#142630;color:#d7e6ed;box-shadow:0 4px 18px #0006;font:12px Segoe UI,sans-serif;cursor:pointer}.change-bubble[hidden]{display:none}.changes-plus{color:#75d69e}.changes-minus{color:#f29292}.change-editor{position:fixed;inset:0;margin:auto;width:min(860px,94vw);height:min(560px,78vh);min-width:320px;min-height:280px;max-width:96vw;max-height:90vh;padding:0;box-sizing:border-box;overflow:hidden;resize:both;border:1px solid #405965;border-radius:14px;background:#0b1720;color:#d9e7ed;box-shadow:0 20px 80px #000a;z-index:30}.change-editor[open]{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto}.change-editor-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #29404b;cursor:move;touch-action:none}.change-editor-header h2{margin:0;font:600 15px Segoe UI,sans-serif}.change-editor button{color:#caddE6;cursor:pointer;font:12px Segoe UI,sans-serif}.change-editor button:disabled{opacity:.45;cursor:default}.change-editor button:focus-visible,.change-bubble:focus-visible{outline:2px solid #81caca;outline-offset:2px}.change-editor-header button{border:0;background:none;font-size:20px}.change-editor-toolbar{display:flex;gap:7px;align-items:center;padding:9px 12px;border-bottom:1px solid #29404b;flex-wrap:wrap}.change-editor-toolbar button{background:#152d39;border:1px solid #36505b;border-radius:7px;padding:5px 10px}.change-editor-toolbar [aria-pressed=true]{border-color:#81caca;color:#aff1f3}.change-editor-toolbar .change-totals{margin-right:auto;font:12px Segoe UI,sans-serif}.change-editor-body{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:0;overflow:hidden}.change-editor-files{overflow:auto;border-right:1px solid #29404b;padding:7px}.change-editor-files button{display:block;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;border:0;border-radius:6px;background:transparent;padding:8px 7px;margin:2px 0}.change-editor-files [aria-current=true]{background:#1c3c49}.change-editor-code{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}.change-editor-path{margin:0;padding:7px 12px;font:11px/1.5 Consolas,monospace;color:#a8bec9;overflow-wrap:anywhere;border-bottom:1px solid #213842}.change-diff{flex:1;min-height:0;overflow:auto;padding:8px 0;margin:0;font:12px/1.7 Consolas,monospace;tab-size:2}.change-diff-line{display:flex;min-width:max-content}.change-diff-line.added{background:#1c6e3435;color:#a5e9bd}.change-diff-line.removed{background:#8b2b3835;color:#f3acb4}.change-diff-line.hunk{color:#8fc4e1;background:#173343;padding:3px 10px;margin:4px 0}.change-line-no{display:inline-block;flex:0 0 36px;width:36px;text-align:right;padding-right:8px;color:#698593;user-select:none}.change-diff-text{white-space:pre;padding-right:16px}.change-code-input{flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;outline:0;padding:12px;background:#07131c;color:#d7e8f0;font:12px/1.7 Consolas,monospace;tab-size:2;white-space:pre;overflow:auto}.change-code-input[hidden],.change-diff[hidden]{display:none}.change-editor-footer{border-top:1px solid #29404b;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;font:11px/1.5 Segoe UI,sans-serif;color:#9bb7c4}.change-editor-status{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}.change-editor-footer button{flex-shrink:0;border:0;background:none;text-decoration:underline}.change-editor-empty{padding:14px;color:#9bb7c4;white-space:normal}@media(max-width:640px){.change-editor-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.change-editor-files{max-height:90px;display:flex;overflow:auto;border-right:0;border-bottom:1px solid #29404b}.change-editor-files button{flex:0 0 auto;width:auto;max-width:220px}.change-bubble{bottom:9px;font-size:11px;padding:7px 11px}.change-editor-toolbar{gap:5px}}`;
  style.textContent += `.change-code-surface{position:relative;flex:1;min-height:0;overflow:hidden;background:#07131c}.change-code-surface[hidden]{display:none}.change-code-surface .change-code-input{position:absolute;inset:0;height:100%;margin:0;z-index:1;letter-spacing:0;border-radius:0;caret-color:#e5edf2}.change-code-highlight{display:none;position:absolute;inset:0;margin:0;padding:12px;box-sizing:border-box;border:0;border-radius:0;overflow:hidden;pointer-events:none;white-space:pre;font:12px/1.7 Consolas,monospace;letter-spacing:0;tab-size:2;color:#d4d4d4}.change-code-highlight code{display:block;min-width:max-content;font:inherit;letter-spacing:inherit;white-space:inherit;tab-size:inherit;background:none;padding:0}.change-code-surface[data-highlighted=true] .change-code-highlight{display:block}.change-code-surface[data-highlighted=true] .change-code-input{background:transparent;color:transparent;-webkit-text-fill-color:transparent}.change-code-surface[data-highlighted=true] .change-code-input::selection{background:#264f7880;color:transparent}.change-diff-text{color:#d4d4d4}.change-diff-line.added .diff-prefix{color:#75d69e}.change-diff-line.removed .diff-prefix{color:#f29292}.change-editor .token.keyword{color:#c586c0}.change-editor .token.boolean,.change-editor .token.tag{color:#569cd6}.change-editor .token.function,.change-editor .token.decorator{color:#dcdcaa}.change-editor .token.class-name,.change-editor .token.builtin{color:#4ec9b0}.change-editor .token.number{color:#b5cea8}.change-editor .token.string,.change-editor .token.attr-value{color:#ce9178}.change-editor .token.comment,.change-editor .token.prolog,.change-editor .token.doctype{color:#6a9955}.change-editor .token.property,.change-editor .token.attr-name,.change-editor .token.parameter{color:#9cdcfe}.change-editor .token.constant{color:#4fc1ff}.change-editor .token.regex{color:#d16969}@media(forced-colors:active){.change-code-surface[data-highlighted=true] .change-code-input{color:CanvasText;-webkit-text-fill-color:CanvasText;background:Canvas}.change-code-highlight{visibility:hidden}}`;
  document.head.append(style);
  const bubble = el('button', undefined, 'change-bubble');
  bubble.type = 'button';
  bubble.hidden = true;
  bubble.innerHTML =
    '<span aria-hidden="true">&lt;/&gt;</span><span class="changes-plus"></span><span class="changes-minus"></span><span class="change-count"></span>';
  const panel = el('dialog', undefined, 'change-editor');
  panel.id = 'changeEditor';
  bubble.setAttribute('aria-haspopup', 'dialog');
  bubble.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-labelledby', 'changeEditorTitle');
  panel.innerHTML =
    '<header class="change-editor-header"><h2 id="changeEditorTitle">Task changes</h2><button type="button" aria-label="Close change editor">×</button></header><div class="change-editor-toolbar"><span class="change-totals"></span><button type="button" data-mode="diff" aria-pressed="true">Changes</button><button type="button" data-mode="edit" aria-pressed="false">Edit</button><button type="button" class="change-refresh">Refresh</button><button type="button" class="change-save" disabled>Save</button></div><div class="change-editor-body"><nav class="change-editor-files" aria-label="Changed files"></nav><section class="change-editor-code"><p class="change-editor-path"></p><pre class="change-diff" tabindex="0" aria-label="Changed code"></pre><div class="change-code-surface" hidden><pre class="change-code-highlight" aria-hidden="true"><code></code></pre><textarea class="change-code-input" spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Edit changed file"></textarea></div></section></div><footer class="change-editor-footer"><span class="change-editor-status" role="status"></span><button type="button" class="change-apply" hidden>Review isolated changes</button></footer>';
  document.body.append(bubble, panel);
  const status = panel.querySelector('.change-editor-status'),
    input = panel.querySelector('textarea'),
    diff = panel.querySelector('.change-diff'),
    fileList = panel.querySelector('.change-editor-files'),
    save = panel.querySelector('.change-save');
  const editor = panel.querySelector('.change-code-surface'),
    highlight = panel.querySelector('.change-code-highlight'),
    highlightCode = highlight.querySelector('code');
  function syncCodeScroll() {
    highlight.style.width = input.clientWidth + 'px';
    highlight.style.height = input.clientHeight + 'px';
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  }
  input.addEventListener('scroll', syncCodeScroll);
  if (window.ResizeObserver) new ResizeObserver(syncCodeScroll).observe(editor);
  window.addEventListener('resize', syncCodeScroll);
  function plainEdit() {
    const enabled =
      syntax?.language(selectedPath) && input.value.length <= 120000 && input.value.split('\n').length <= 4000;
    editor.dataset.highlighted = String(Boolean(enabled));
    highlightCode.textContent = input.value + '\u200b';
    syncCodeScroll();
  }
  function colorEdit() {
    const version = ++editPaint,
      text = input.value,
      path = selectedPath;
    clearTimeout(syntaxTimer);
    plainEdit();
    if (!syntax || editor.dataset.highlighted !== 'true') return;
    syntaxTimer = setTimeout(async () => {
      const result = await syntax.highlight(text, path);
      if (version !== editPaint || path !== selectedPath || text !== input.value) return;
      if (!result.lines) {
        editor.dataset.highlighted = 'false';
        return;
      }
      const fragment = document.createDocumentFragment();
      result.lines.forEach((line, i) => {
        if (i) fragment.append(document.createTextNode('\n'));
        syntax.append(fragment, line);
      });
      fragment.append(document.createTextNode('\u200b'));
      highlightCode.replaceChildren(fragment);
      syncCodeScroll();
    }, 60);
  }
  function chosenJob() {
    if (panel.open && pinnedJob) return jobs.get(pinnedJob);
    const colab = document.body.dataset.workspace === 'colab',
      id = colab ? window.atlasColab?.current().id : null,
      foreground = typeof foregroundRequest === 'string' ? foregroundRequest : '',
      conversation = typeof conversationId === 'string' ? conversationId : '';
    if (!colab && jobs.has(foreground)) return jobs.get(foreground);
    return [...jobs.values()]
      .filter((job) =>
        colab ? job.collaboration && job.colabChatId === id : !job.collaboration && job.conversationId === conversation,
      )
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
  }
  function discardDraft() {
    if (!dirty) return true;
    if (!window.confirm('Discard your unsaved edits?')) return false;
    dirty = false;
    return true;
  }
  function updateControls() {
    const editable = Boolean(
      selectedFile && summary?.canEdit && selectedFile.content !== null && selectedFile.status !== 'deleted',
    );
    input.readOnly = !editable;
    save.disabled = !dirty || !editable || busy;
    panel.querySelector('[data-mode=edit]').disabled = selectedFile?.content === null || !selectedFile;
    panel.querySelector('.change-apply').hidden = !currentJob?.workspaceId;
  }
  function view(next) {
    mode = next;
    for (const button of panel.querySelectorAll('[data-mode]'))
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    diff.hidden = mode !== 'diff';
    editor.hidden = mode !== 'edit';
    if (mode === 'edit') syncCodeScroll();
    updateControls();
  }
  function renderDiff(file) {
    const paint = ++diffPaint,
      rows = [];
    diff.replaceChildren();
    if (!file.hunks?.length) {
      diff.append(
        el(
          'div',
          file.message || 'No line changes. This may be a file, mode, or empty-file change.',
          'change-editor-empty',
        ),
      );
      return;
    }
    for (const hunk of file.hunks) {
      diff.append(
        el(
          'div',
          '@@ −' + hunk.oldStart + ',' + hunk.oldLines + ' +' + hunk.newStart + ',' + hunk.newLines + ' @@',
          'change-diff-line hunk',
        ),
      );
      let old = hunk.oldStart,
        next = hunk.newStart;
      for (const line of hunk.lines) {
        const kind = line[0],
          row = el('span', undefined, 'change-diff-line ' + (kind === '+' ? 'added' : kind === '-' ? 'removed' : '')),
          left = el('span', kind === '+' || kind === '\\' ? '' : String(old), 'change-line-no'),
          right = el('span', kind === '-' || kind === '\\' ? '' : String(next), 'change-line-no'),
          text = el('span', line, 'change-diff-text');
        row.append(left, right, text);
        diff.append(row);
        rows.push({ node: text, kind, line: kind === '-' ? old : next, text: line.slice(1) });
        if (kind === ' ' || kind === '-') old++;
        if (kind === ' ' || kind === '+') next++;
      }
    }
    if (syntax)
      void Promise.all([
        syntax.highlight(file.originalContent || '', selectedPath),
        syntax.highlight(file.content || '', selectedPath),
      ]).then(([before, after]) => {
        if (paint !== diffPaint) return;
        for (const row of rows) {
          if (!['+', '-', ' '].includes(row.kind)) continue;
          const runs = (row.kind === '-' ? before : after).lines?.[row.line - 1];
          if (
            !runs ||
            runs
              .map((run) => run.text)
              .join('')
              .replace(/\r$/, '') !== row.text
          )
            continue;
          row.node.replaceChildren(el('span', row.kind, 'diff-prefix'));
          syntax.append(row.node, runs);
        }
      });
    if (file.truncated)
      diff.append(
        el(
          'div',
          'Diff preview truncated. Open the file in your usual editor for the full change.',
          'change-editor-empty',
        ),
      );
  }
  async function loadFile(name) {
    if (!currentJob || !discardDraft()) return;
    const sequence = ++loadSequence,
      jobId = currentJob.id;
    status.textContent = 'Loading changed code…';
    try {
      const file = await api.changes({ jobId, action: 'file', path: name });
      if (sequence !== loadSequence || currentJob?.id !== jobId) return;
      const oldTop = selectedPath === name ? diff.scrollTop : 0,
        oldLeft = selectedPath === name ? diff.scrollLeft : 0;
      selectedPath = name;
      selectedFile = file;
      input.value = file.content ?? '';
      dirty = false;
      colorEdit();
      panel.querySelector('.change-editor-path').textContent = name + ' · ' + file.status;
      renderDiff(file);
      diff.scrollTop = oldTop;
      diff.scrollLeft = oldLeft;
      for (const button of fileList.querySelectorAll('button'))
        button.setAttribute('aria-current', String(button.dataset.path === name));
      status.textContent =
        file.message ||
        (summary.canEdit
          ? 'Compare changes or edit this file. Ctrl+S saves.'
          : summary.readOnlyReason || 'Read-only while an agent is editing this folder.');
      view(file.content === null ? 'diff' : mode);
    } catch (error) {
      if (sequence === loadSequence) status.textContent = error.message;
    }
  }
  function renderSummary() {
    const count = summary?.files?.length || 0;
    bubble.hidden = !count;
    const suffix = summary?.complete === false ? ' (partial totals)' : '';
    bubble.querySelector('.changes-plus').textContent = '+' + (summary?.added || 0);
    bubble.querySelector('.changes-minus').textContent = '−' + (summary?.removed || 0);
    bubble.querySelector('.change-count').textContent = count + ' ' + (count === 1 ? 'file' : 'files');
    bubble.setAttribute(
      'aria-label',
      'Review changes: ' +
        (summary?.added || 0) +
        ' lines added, ' +
        (summary?.removed || 0) +
        ' lines removed, ' +
        count +
        ' files' +
        suffix,
    );
    bubble.title = 'Open changed code' + suffix;
    if (!panel.open) return;
    panel.querySelector('h2').textContent = currentJob?.workspaceId
      ? 'Task changes · isolated checkout'
      : 'Task changes';
    panel.title = summary?.cwd || '';
    panel.querySelector('.change-totals').textContent =
      '+' + (summary?.added || 0) + '  −' + (summary?.removed || 0) + ' · ' + count + ' files' + suffix;
    fileList.replaceChildren();
    for (const file of summary?.files || []) {
      const button = el('button', file.path);
      button.type = 'button';
      button.dataset.path = file.path;
      button.title = file.path + ' · ' + file.status + ' · +' + (file.added ?? '—') + ' −' + (file.removed ?? '—');
      button.setAttribute('aria-current', String(file.path === selectedPath));
      button.onclick = () => void loadFile(file.path);
      fileList.append(button);
    }
    if (!count && !dirty) {
      selectedPath = '';
      selectedFile = null;
      input.value = '';
      colorEdit();
      diff.replaceChildren(el('div', summary?.message || 'No changes since the task snapshot.', 'change-editor-empty'));
      panel.querySelector('.change-editor-path').textContent = '';
      view('diff');
    }
    if (summary?.limited) status.textContent = 'Some large, generated, or linked files are excluded from this preview.';
    updateControls();
  }
  async function refresh(force = false) {
    if (busy) {
      queued = true;
      return;
    }
    const job = chosenJob();
    if (!job) {
      bubble.hidden = true;
      return;
    }
    if (currentJob?.id !== job.id) {
      if (panel.open && dirty) return;
      currentJob = job;
      summary = null;
      bubble.hidden = true;
      selectedFile = null;
      selectedPath = '';
    } else currentJob = job;
    if (!job.changeId) {
      bubble.hidden = true;
      if (panel.open) status.textContent = job.changesError || 'Preparing the task snapshot…';
      return;
    }
    busy = true;
    updateControls();
    const id = job.id;
    try {
      const result = await api.changes({ jobId: id, refresh: force });
      if (currentJob?.id !== id) return;
      summary = result;
      renderSummary();
      if (panel.open && !dirty) {
        if (selectedPath && result.files.some((file) => file.path === selectedPath)) {
          if (mode === 'diff') await loadFile(selectedPath);
        } else if (result.files.length) await loadFile(result.files[0].path);
      }
    } catch (error) {
      if (panel.open) status.textContent = error.message;
    } finally {
      busy = false;
      updateControls();
      if (queued) {
        queued = false;
        void refresh();
      }
    }
  }
  bubble.onclick = () => {
    if (!discardDraft()) return;
    pinnedJob = currentJob?.id || '';
    if (!panel.open) panel.show();
    renderSummary();
    void refresh(true);
  };
  panel.querySelector('.change-editor-header button').onclick = () => {
    if (discardDraft()) {
      panel.close();
      pinnedJob = '';
      void refresh();
    }
  };
  panel.addEventListener('cancel', (event) => {
    if (!discardDraft()) event.preventDefault();
  });
  for (const button of panel.querySelectorAll('[data-mode]')) button.onclick = () => view(button.dataset.mode);
  panel.querySelector('.change-refresh').onclick = () => {
    if (discardDraft()) void refresh(true);
  };
  input.addEventListener('input', () => {
    colorEdit();
    dirty = input.value !== selectedFile?.content;
    status.textContent = dirty ? 'Unsaved edits.' : 'No unsaved edits.';
    updateControls();
  });
  async function saveFile() {
    if (save.disabled || !currentJob || !selectedFile) return;
    const jobId = currentJob.id;
    save.disabled = true;
    try {
      await api.changes({
        jobId,
        action: 'save',
        path: selectedPath,
        content: input.value,
        version: selectedFile.version,
      });
      dirty = false;
      mode = 'diff';
      status.textContent = 'Saved to ' + selectedPath;
      await refresh(true);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      updateControls();
    }
  }
  save.onclick = () => void saveFile();
  panel.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveFile();
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !input.readOnly) {
      event.preventDefault();
      input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
    }
  });
  panel.querySelector('.change-apply').onclick = () => {
    if (currentJob?.workspaceId && discardDraft()) window.atlasWorkspace?.review(currentJob.workspaceId);
  };
  const header = panel.querySelector('.change-editor-header');
  let drag;
  header.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', (event) => {
    if (!drag) return;
    panel.style.margin = '0';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, drag.left + event.clientX - drag.x)) + 'px';
    panel.style.top = Math.max(0, Math.min(innerHeight - panel.offsetHeight, drag.top + event.clientY - drag.y)) + 'px';
  });
  header.addEventListener('pointerup', () => (drag = null));
  header.addEventListener('lostpointercapture', () => (drag = null));
  function keepInViewport() {
    if (!panel.open || !panel.style.left) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(innerWidth - rect.width, rect.left)) + 'px';
    panel.style.top = Math.max(0, Math.min(innerHeight - rect.height, rect.top)) + 'px';
  }
  window.addEventListener('resize', keepInViewport);
  if (window.ResizeObserver) new ResizeObserver(keepInViewport).observe(panel);
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 500);
  }
  api.onJobs((patch) => {
    for (const id of patch.removed || []) jobs.delete(id);
    for (const job of patch.upsert || []) jobs.set(job.id, job);
    schedule();
  });
  void api
    .jobs()
    .then((items) => {
      for (const job of items) jobs.set(job.id, job);
      schedule();
    })
    .catch(() => {});
  window.addEventListener('atlas-colab-chat-change', schedule);
  window.addEventListener('atlas-assistant-task', schedule);
  window.addEventListener('focus', schedule);
  panel.addEventListener('close', () => (pinnedJob = ''));
  setInterval(() => {
    if (!document.hidden && (panel.open || chosenJob()?.status === 'running')) void refresh();
  }, 3000);
})();
