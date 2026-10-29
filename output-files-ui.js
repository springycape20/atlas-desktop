(() => {
  const api = window.atlas;
  const node = (tag, text, cls) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (cls) item.className = cls;
    return item;
  };
  const button = (label, run, parent) => {
    const item = node('button', label, 'quiet-button');
    item.type = 'button';
    item.onclick = () =>
      Promise.resolve()
        .then(run)
        .catch((error) => {
          status.textContent = error.message;
        });
    parent.append(item);
    return item;
  };
  const imageData = (value) => typeof value === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,/.test(value);
  let activePreviews = 0;
  const previewQueue = [];
  const schedulePreview = (task) => {
    if (previewQueue.length >= 24) return false;
    previewQueue.push(task);
    const drain = () => {
      while (activePreviews < 2 && previewQueue.length) {
        activePreviews++;
        Promise.resolve()
          .then(previewQueue.shift())
          .finally(() => {
            activePreviews--;
            drain();
          });
      }
    };
    drain();
    return true;
  };
  const local = (value) =>
    !/^v?\d+(?:\.\d+)+(?:[-+][\w.-]+)?$/i.test(value) &&
    !/^https?:|^data:|^javascript:/i.test(value) &&
    /\.[a-z0-9]{1,12}(?:#L\d+(?:-L?\d+)?|:\d+(?::\d+)?)?$/i.test(value);
  const cleanReference = (value) => {
    let text = String(value).trim().replace(/^<|>$/g, '');
    try {
      text = decodeURIComponent(text);
    } catch {}
    return text;
  };
  const request = (context, action, path) => api.projectFile({ ...context, action, path });
  const dialog = node('dialog', undefined, 'project-file-dialog');
  dialog.setAttribute('aria-labelledby', 'projectFileTitle');
  const header = node('header'),
    title = node('h1', 'Project files');
  title.id = 'projectFileTitle';
  header.append(title);
  button('Close', () => dialog.close(), header);
  const tools = node('div', undefined, 'project-file-tools'),
    content = node('div', undefined, 'project-file-content'),
    status = node('p', undefined, 'project-file-status');
  status.setAttribute('role', 'status');
  dialog.append(header, tools, content, status);
  let version = 0,
    returnFocus,
    keepContent = false;
  const show = () => {
    if (!dialog.open) {
      returnFocus = document.activeElement;
      dialog.showModal();
    }
  };
  dialog.addEventListener('close', () => {
    if (keepContent) return;
    version++;
    content.replaceChildren();
    delete dialog.dataset.docked;
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  const assetPath = (file, reference) => {
    const value = cleanReference(reference).split('#')[0];
    if (/^https?:|^\/\//i.test(value)) throw Error('Remote assets are not loaded.');
    if (/^[a-z]:[\\/]|^file:/i.test(value)) return value;
    if (value.startsWith('/')) return '.' + value;
    return file.split('/').slice(0, -1).concat(value).join('/');
  };
  async function staticPage(value, context, sequence) {
    const doc = new DOMParser().parseFromString(value.text, 'text/html');
    let omitted = 0,
      total = 0;
    for (const link of [...doc.querySelectorAll('link[rel=stylesheet]')].slice(0, 8)) {
      try {
        const css = await request(context, 'read', assetPath(value.path, link.getAttribute('href') || ''));
        if (css.kind === 'text') {
          const style = doc.createElement('style');
          style.textContent = css.text;
          link.replaceWith(style);
        } else omitted++;
      } catch {
        omitted++;
      }
    }
    for (const item of doc.querySelectorAll('script,base,meta,iframe,object,embed,link')) item.remove();
    for (const element of doc.querySelectorAll('*'))
      for (const attribute of [...element.attributes]) {
        if (
          /^on/i.test(attribute.name) ||
          ['srcset', 'action', 'formaction', 'srcdoc', 'autofocus'].includes(attribute.name)
        )
          element.removeAttribute(attribute.name);
        if (attribute.name === 'href' && !attribute.value.startsWith('#')) element.removeAttribute('href');
        if (attribute.name === 'src' && element.tagName !== 'IMG') element.removeAttribute('src');
      }
    const images = [...doc.querySelectorAll('img')];
    for (const [index, img] of images.entries()) {
      const source = img.getAttribute('src') || '';
      img.removeAttribute('src');
      if (imageData(source)) {
        img.src = source;
        continue;
      }
      if (index >= 8) {
        omitted++;
        continue;
      }
      try {
        const asset = await request(context, 'read', assetPath(value.path, source));
        if (asset.kind === 'image' && imageData(asset.preview) && total + asset.preview.length <= 16 * 1024 * 1024) {
          img.src = asset.preview;
          total += asset.preview.length;
        } else omitted++;
      } catch {
        omitted++;
      }
    }
    if (sequence !== version || !dialog.open) return;
    const csp = doc.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content =
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none';";
    doc.head.prepend(csp);
    const frame = node('iframe');
    frame.title = 'Static preview of ' + value.name;
    frame.setAttribute('sandbox', '');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    content.replaceChildren(frame);
    status.textContent =
      'Static page preview: scripts, forms and network requests are disabled.' +
      (omitted ? ' ' + omitted + ' unavailable or remote assets omitted.' : '');
  }
  async function preview(context, reference, back) {
    show();
    dialog.dataset.mode = 'preview';
    const sequence = ++version;
    title.textContent = reference;
    tools.replaceChildren();
    content.replaceChildren(node('p', 'Reading project file…'));
    status.textContent = '';
    const value = await request(context, 'read', reference);
    if (sequence !== version || !dialog.open) return;
    title.textContent = value.path || reference;
    content.replaceChildren();
    button('Refresh', () => preview(context, reference, back), tools);
    button('Show in folder', () => request(context, 'reveal', reference), tools);
    button(
      'Open in editor',
      async () => {
        await window.atlasProjectEditor.open(context, reference);
        dialog.close();
      },
      tools,
    );
    button('Copy relative path', () => navigator.clipboard.writeText(value.path || reference), tools);
    button('Browse project files', () => browse(context, back || '.'), tools);
    button(
      'Attach to next message',
      async () => {
        const current =
          context.scope === 'colab'
            ? window.atlasColab?.current().id
            : typeof conversationId === 'string'
              ? conversationId
              : '';
        const owner = context.chatId || context.conversationId;
        if (owner && current !== owner) throw Error('Switch back to this conversation before attaching the file.');
        const success = await window.atlasWorkspace.addAttachments(context.scope || 'assistant', () =>
          request(context, 'attach', reference),
        );
        status.textContent = success
          ? 'Attached to the next unsent message. Review it before sending.'
          : 'The file could not be attached. Check the composer message.';
      },
      tools,
    );
    if (value.kind === 'image' && imageData(value.preview)) {
      const image = node('img');
      image.src = value.preview;
      image.alt = value.name;
      image.className = 'project-file-image';
      content.append(image);
    } else if (value.kind === 'text' || value.kind === 'html') {
      const source = () => {
        version++;
        content.replaceChildren(node('pre', value.text, 'project-file-source'));
        status.textContent = 'Read-only source preview. No code is executed.';
      };
      if (value.kind === 'html') {
        button('Page preview (scripts off)', () => staticPage(value, context, ++version), tools);
        button('Source', source, tools);
        await staticPage(value, context, sequence);
      } else source();
    } else content.append(node('p', value.message || 'No inline preview for this file type.'));
    if (value.kind !== 'html')
      status.textContent = (value.size ?? 0).toLocaleString() + ' bytes · current project file · read-only preview';
  }
  async function browse(context, directory = '.') {
    show();
    dialog.dataset.mode = 'browser';
    const sequence = ++version;
    title.textContent = 'Project files';
    content.replaceChildren(node('p', 'Reading directory…'));
    tools.replaceChildren();
    status.textContent = '';
    const result = await request(context, 'list', directory);
    if (sequence !== version || !dialog.open) return;
    if (!Array.isArray(result.entries)) throw Error('Project files are unavailable. Choose a project folder first.');
    title.textContent = 'Project files · ' + (result.path || '/');
    button('Project root', () => browse(context, '.'), tools);
    button(
      'Keep beside chat for dragging',
      () => {
        keepContent = true;
        dialog.close();
        // Close is queued by the browser; preserve the tree until it has fired.
        setTimeout(() => {
          keepContent = false;
          dialog.show();
          dialog.dataset.docked = 'true';
        }, 20);
      },
      tools,
    );
    if (result.path)
      button('Up one folder', () => browse(context, result.path.split('/').slice(0, -1).join('/') || '.'), tools);
    const filter = node('input');
    filter.type = 'search';
    filter.placeholder = 'Filter this folder';
    filter.setAttribute('aria-label', 'Filter project files');
    tools.append(filter);
    const searchProject = async (contents) => {
      const query = filter.value.trim();
      if (!query) {
        status.textContent = 'Enter a search phrase first.';
        return;
      }
      const current = ++version;
      status.textContent = 'Searching project locally…';
      const found = await api.projectFile({ ...context, action: 'search', query, contents });
      if (version !== current || !dialog.open) return;
      list.replaceChildren();
      for (const entry of found.entries || []) {
        const row = button(entry.path + (entry.line ? ':' + entry.line : ''), () => preview(context, entry.path), list);
        if (entry.excerpt) row.append(node('small', entry.excerpt));
      }
      if (!list.children.length) list.append(node('p', 'No matches found.'));
      status.textContent = found.limited
        ? 'Search limit reached. Use a more specific phrase.'
        : 'Project search complete. Private paths are excluded.';
    };
    button('Search filenames', () => searchProject(false), tools);
    button('Search file contents', () => searchProject(true), tools);
    const list = node('div', undefined, 'project-file-list');
    content.replaceChildren(list);
    const paint = () => {
      list.replaceChildren();
      for (const entry of result.entries.filter((row) => row.name.toLowerCase().includes(filter.value.toLowerCase()))) {
        const row = button(
          (entry.directory ? 'Folder · ' : '') + entry.name,
          () => (entry.directory ? browse(context, entry.path) : preview(context, entry.path, result.path)),
          list,
        );
        row.title = entry.path;
        if (!entry.directory) {
          row.draggable = true;
          row.ondragstart = (event) =>
            event.dataTransfer.setData(
              'application/x-atlas-project-file',
              JSON.stringify({ context, path: entry.path }),
            );
        }
      }
      if (!list.children.length) list.append(node('p', 'No visible files match.'));
    };
    filter.oninput = paint;
    paint();
    status.textContent =
      (result.limited ? 'Showing the first 200 entries. Open a subfolder to narrow the list. ' : '') +
      'Private credential/configuration paths and links outside the project are excluded. Files are not sent to a provider unless you attach and send them.';
  }
  function reference(label, value, image, context) {
    const path = cleanReference(value);
    if (image && /^https?:\/\//i.test(path)) {
      const link = node('button', 'Open remote image: ' + (label || path), 'project-file-link');
      link.type = 'button';
      link.onclick = () =>
        api.openLink(String(value).replace(/^<|>$/g, '')).catch((error) => window.toast?.(error.message));
      return link;
    }
    if (!local(path)) return null;
    if ((context.previewCount = (context.previewCount || 0) + 1) > 12) return node('span', label + ' (' + path + ')');
    if (!image) {
      const link = node('button', label || path, 'project-file-link');
      link.type = 'button';
      link.title = 'Preview project file: ' + path;
      link.onclick = () => preview(context, path).catch((error) => (status.textContent = error.message));
      return link;
    }
    const figure = node('figure', undefined, 'project-output-card'),
      caption = node('figcaption'),
      open = node('button', label || path, 'project-file-link'),
      placeholder = node('p', 'Loading project image…');
    open.type = 'button';
    open.onclick = () => preview(context, path).catch((error) => (status.textContent = error.message));
    caption.append(open);
    figure.append(placeholder, caption);
    const queued = schedulePreview(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!figure.isConnected) return;
      try {
        const data = await request(context, 'read', path);
        if (!figure.isConnected) return;
        if (data.kind === 'image' && imageData(data.preview)) {
          const used = [...document.querySelectorAll('.project-output-card img')].reduce(
            (total, img) => total + img.src.length,
            0,
          );
          if (used + data.preview.length > 32 * 1024 * 1024) {
            placeholder.textContent = 'Inline image budget reached. Select the filename to view this image.';
            return;
          }
          const img = node('img');
          img.src = data.preview;
          img.alt = label || data.name;
          img.loading = 'lazy';
          img.onclick = open.onclick;
          figure.insertBefore(img, caption);
          placeholder.remove();
        } else placeholder.textContent = data.message || 'This reference is not a supported image.';
      } catch (error) {
        placeholder.textContent = 'Image unavailable: ' + error.message;
      }
    });
    if (!queued) placeholder.textContent = 'Automatic preview queue is full. Select the filename to view this image.';
    return figure;
  }
  window.atlasProjectFiles = { reference, preview, browse };
  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(dialog);
    for (const [scope, selector] of [
      ['assistant', '.composer'],
      ['colab', '.colab-composer'],
    ]) {
      const composer = document.querySelector(selector);
      composer?.addEventListener('dragover', (event) => {
        if ([...event.dataTransfer.types].includes('application/x-atlas-project-file')) event.preventDefault();
      });
      composer?.addEventListener(
        'drop',
        (event) => {
          const value = event.dataTransfer.getData('application/x-atlas-project-file');
          if (!value) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          Promise.resolve()
            .then(async () => {
              const data = JSON.parse(value);
              const current =
                scope === 'colab'
                  ? window.atlasColab.current().id
                  : typeof conversationId === 'string'
                    ? conversationId
                    : '';
              if (data.context.scope !== scope || (data.context.chatId || data.context.conversationId) !== current)
                throw Error('Drop files into their original conversation.');
              await window.atlasWorkspace.addAttachments(scope, () => request(data.context, 'attach', data.path));
            })
            .catch((error) => window.toast?.(error.message));
        },
        true,
      );
    }
    for (const scope of ['assistant', 'colab']) {
      const toolbar = document.getElementById('attachmentMenu-' + scope);
      if (!toolbar) continue;
      button(
        'Browse project files',
        () => {
          toolbar.hidePopover();
          const chat = scope === 'colab' ? window.atlasColab.current() : null;
          return browse({
            scope,
            cwd: chat?.cwd || (typeof cwd === 'string' ? cwd : ''),
            ...(scope === 'colab'
              ? { chatId: chat.id, jobId: chat.jobId || chat.lastJob?.id }
              : { conversationId: typeof conversationId === 'string' ? conversationId : '' }),
          });
        },
        toolbar,
      );
    }
  });
})();
