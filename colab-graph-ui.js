(() => {
  const toolbar = document.querySelector('.colab-chat-actions');
  if (!toolbar || !window.atlasColabGraph) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'colabGraph';
  button.className = 'quiet-button';
  button.textContent = 'Workflow graph';
  button.title = 'Explore the shared task, handovers and blockers';
  toolbar.prepend(button);
  const style = document.createElement('style');
  style.textContent = `
  .colab-graph-dialog{width:min(1240px,96vw);height:min(840px,92vh);max-width:96vw;padding:18px;color:#d3e7ea;background:#0a171d;border:1px solid #31505a;border-radius:16px;overflow:hidden}
  .colab-graph-dialog[open]{display:flex;flex-direction:column;gap:10px}.colab-graph-dialog::backdrop{background:#02090dbc;backdrop-filter:blur(3px)}
  .colab-graph-dialog header{display:flex;align-items:center;gap:12px}.colab-graph-dialog h2{font-size:20px;margin:0;flex:1}.colab-graph-dialog p{margin:0;font-size:12px;color:#a1b8c0}.colab-graph-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.colab-graph-controls input,.colab-graph-controls select{background:#0b2028;color:#d3e7ea;border:1px solid #31505a;border-radius:7px;padding:7px;min-width:0;max-width:100%}.colab-graph-controls input{flex:1;min-width:120px}.colab-graph-controls select:first-child{max-width:280px}.colab-graph-controls button{padding:6px 11px}
  .colab-graph-body{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:10px;flex:1;min-height:0}.colab-graph-viewport{overflow:auto;border:1px solid #29414a;border-radius:10px;background:radial-gradient(circle at 1px 1px,#21353e 1px,transparent 0) 0 0/20px 20px;min-height:140px;overscroll-behavior:contain}.colab-graph-viewport svg{display:block;max-width:none}.colab-graph-detail{overflow:auto;padding:12px;background:#10232b;border-radius:10px;min-width:0}.colab-graph-detail h3{font-size:14px;overflow-wrap:anywhere;margin:0 0 10px}.colab-graph-detail pre{font:12px/1.6 Segoe UI,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}.colab-graph-detail button{display:block;text-align:left;width:100%;padding:7px;margin-top:5px;overflow-wrap:anywhere;font-size:11px}.colab-graph-node{cursor:pointer;outline:none}.colab-graph-node:focus rect{stroke:#fff;stroke-width:3}.colab-graph-node text{pointer-events:none;font:12px Segoe UI,sans-serif;fill:#d5e6ec}.colab-graph-node .graph-node-meta{font-size:10px;fill:#a2bac3}.colab-graph-node[data-selected=true] rect{stroke:#fff;stroke-width:2}.colab-graph-node[data-dim=true]{opacity:.25}.colab-graph-dialog footer{font-size:11px;color:#8faeb8;line-height:1.5}.graph-edge{fill:none;stroke:#476471;stroke-width:1.4}.graph-edge[data-related=true]{stroke:#72cbd6;stroke-width:2}.graph-empty{padding:25px;font-size:14px;fill:#a1b8c0}
  @media(max-width:750px){.colab-graph-dialog{padding:12px;max-height:94vh;height:94vh}.colab-graph-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(140px,1fr) minmax(90px,28%)}.colab-graph-controls select:first-child{max-width:100%;flex:1}.colab-graph-dialog h2{font-size:16px}.colab-chat-actions{flex-wrap:wrap}}
  `;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.className = 'colab-graph-dialog';
  dialog.setAttribute('aria-label', 'Colab workflow graph');
  const header = document.createElement('header'),
    title = document.createElement('h2'),
    close = document.createElement('button'),
    intro = document.createElement('p');
  title.textContent = 'Shared workflow';
  close.type = 'button';
  close.className = 'quiet-button';
  close.textContent = 'Close';
  close.onclick = () => dialog.close();
  header.append(title, close);
  intro.textContent = 'Codex and Claude share a compact board of requirements, decisions and handovers.';
  const controls = document.createElement('div');
  controls.className = 'colab-graph-controls';
  const runs = document.createElement('select'),
    search = document.createElement('input'),
    filter = document.createElement('select');
  runs.setAttribute('aria-label', 'Task graph');
  search.type = 'search';
  search.placeholder = 'Find a node…';
  search.setAttribute('aria-label', 'Find graph nodes');
  filter.setAttribute('aria-label', 'Graph node filter');
  for (const [value, label] of [
    ['all', 'All nodes'],
    ['workflow', 'Workflow'],
    ['milestone', 'Milestones'],
    ['issue', 'Blockers'],
    ['step', 'Steps'],
    ['file', 'Files'],
    ['check', 'Checks'],
    ['decision', 'Decisions'],
  ])
    filter.add(new Option(label, value));
  function control(label, fn, aria = label) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'quiet-button';
    element.textContent = label;
    element.setAttribute('aria-label', aria);
    element.onclick = fn;
    return element;
  }
  let zoom = 1,
    size = { width: 900, height: 500 },
    selected = '',
    runId = '',
    chatId = '',
    latestId = '',
    signature = '',
    graph = null;
  const body = document.createElement('div'),
    viewport = document.createElement('div'),
    detail = document.createElement('aside'),
    footer = document.createElement('footer');
  body.className = 'colab-graph-body';
  viewport.className = 'colab-graph-viewport';
  viewport.setAttribute('aria-label', 'Scrollable workflow graph');
  detail.className = 'colab-graph-detail';
  detail.setAttribute('aria-live', 'polite');
  body.append(viewport, detail);
  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
    return element;
  }
  function setZoom(value) {
    zoom = Math.max(0.03, Math.min(2.5, value));
    const element = viewport.querySelector('svg');
    if (element) {
      element.style.width = size.width * zoom + 'px';
      element.style.height = size.height * zoom + 'px';
    }
  }
  function fit() {
    setZoom(Math.min((viewport.clientWidth - 12) / size.width, (viewport.clientHeight - 12) / size.height, 1));
  }
  controls.append(
    runs,
    search,
    filter,
    control('−', () => setZoom(zoom * 0.8), 'Zoom out'),
    control('+', () => setZoom(zoom / 0.8), 'Zoom in'),
  );
  controls.append(
    control('Fit', fit),
    control('100%', () => setZoom(1), 'Actual size'),
  );
  dialog.append(header, intro, controls, body, footer);
  document.body.append(dialog);
  const colors = {
    task: '#80d2dd',
    criterion: '#9fbee8',
    milestone: '#d9c26f',
    step: '#7f9fb0',
    decision: '#c8a5e4',
    file: '#c2c89e',
    check: '#87c4b4',
    issue: '#f3b36b',
  };
  function describe() {
    detail.replaceChildren();
    const row = graph?.nodes.find((node) => node.id === selected),
      heading = document.createElement('h3'),
      copy = document.createElement('pre');
    heading.textContent = row?.label || 'Explore the workflow';
    copy.textContent = row
      ? [
          row.kind.toUpperCase() + ' · ' + row.status,
          'Source: ' + row.origin,
          row.provider ? 'Client: ' + row.provider : '',
          row.detail,
        ]
          .filter(Boolean)
          .join('\n\n')
      : 'Select a node to see its public summary and connected steps. Scroll to pan, use Fit or zoom controls, and search to highlight matches.';
    detail.append(heading, copy);
    if (!row) return;
    for (const edge of graph.edges.filter((edge) => edge.source === row.id || edge.target === row.id).slice(0, 30)) {
      const incoming = edge.target === row.id,
        other = graph.nodes.find((node) => node.id === (incoming ? edge.source : edge.target));
      if (!other) continue;
      const link = control((incoming ? '← ' : '→ ') + edge.kind + ': ' + other.label, () => choose(other.id, true));
      link.title = 'Connection source: ' + edge.origin;
      detail.append(link);
    }
  }
  function choose(id, reveal = false) {
    selected = id;
    paint();
    if (reveal) {
      const element = [...viewport.querySelectorAll('.colab-graph-node')].find((node) => node.dataset.id === id);
      element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      element?.focus({ preventScroll: true });
    }
  }
  function paint() {
    const query = search.value.trim().toLowerCase(),
      related = new Set([selected]);
    for (const edge of graph?.edges || [])
      if (edge.source === selected || edge.target === selected) {
        related.add(edge.source);
        related.add(edge.target);
      }
    for (const node of viewport.querySelectorAll('.colab-graph-node')) {
      const row = graph.nodes.find((row) => row.id === node.dataset.id);
      node.dataset.selected = String(row.id === selected);
      node.dataset.dim = String(
        Boolean(
          (query && !(row.label + ' ' + row.detail).toLowerCase().includes(query)) ||
          (!query && selected && !related.has(row.id)),
        ),
      );
    }
    for (const edge of viewport.querySelectorAll('.graph-edge'))
      edge.dataset.related = String(
        Boolean(selected && (edge.dataset.source === selected || edge.dataset.target === selected)),
      );
    describe();
  }
  function draw() {
    viewport.replaceChildren();
    if (!graph?.nodes?.length) {
      const empty = document.createElement('p');
      empty.className = 'graph-empty';
      empty.textContent =
        'Send a task in Colab to build its workflow graph. Each task keeps its own graph in this chat.';
      viewport.append(empty);
      detail.replaceChildren();
      footer.textContent = 'Graphs are stored locally with your Colab history.';
      return;
    }
    const keep = (node) =>
        filter.value === 'all' ||
        node.kind === 'task' ||
        node.kind === 'stage' ||
        (filter.value === 'workflow' ? ['criterion', 'milestone'].includes(node.kind) : node.kind === filter.value),
      nodes = graph.nodes.filter(keep),
      positions = new Map(),
      below = new Map();
    const stages = nodes.filter((node) => node.kind === 'stage'),
      maxRank = Math.max(0, ...stages.map((node) => node.rank || 0)),
      // Milestones get their own row above the stages; everything else moves down to make room.
      top = nodes.some((node) => node.kind === 'milestone') ? 110 : 0;
    for (const row of nodes) {
      let x, y;
      if (row.kind === 'milestone') {
        x = 270 + (Math.max(1, row.rank || 1) - 1) * 240;
        y = 10;
      } else if (row.kind === 'task') {
        x = 20;
        y = 170 + top;
      } else if (row.kind === 'criterion' && !row.milestone) {
        x = 20;
        y = 320 + top + (below.get(0) || 0) * 100;
        below.set(0, (below.get(0) || 0) + 1);
      } else {
        const rank = Math.max(1, row.rank || 1);
        x = 270 + (rank - 1) * 240;
        if (row.kind === 'stage') y = (row.provider === 'claude' ? 230 : 80) + top;
        else {
          // Children stack under their stage column; compact step nodes take less room.
          const offset = below.get(rank) || 0;
          below.set(rank, offset + (row.kind === 'step' ? 50 : 100));
          y = 400 + top + offset;
        }
      }
      positions.set(row.id, { x, y, h: row.kind === 'step' ? 40 : 70, kind: row.kind });
    }
    size = {
      width: Math.max(900, 540 + maxRank * 240, ...[...positions.values()].map((p) => p.x + 250)),
      height: Math.max(580, ...[...positions.values()].map((p) => p.y + 110)),
    };
    const canvas = svg('svg', {
        viewBox: `0 0 ${size.width} ${size.height}`,
        role: 'group',
        'aria-label': 'Task relationship diagram',
      }),
      defs = svg('defs'),
      marker = svg('marker', {
        id: 'colabGraphArrow',
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 6,
        markerHeight: 6,
        orient: 'auto-start-reverse',
      });
    marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#6a96a3' }));
    defs.append(marker);
    canvas.append(defs);
    for (const edge of graph.edges) {
      const a = positions.get(edge.source),
        b = positions.get(edge.target);
      if (!a || !b) continue;
      const sourceX = a.x + 200,
        sourceY = a.y + a.h / 2,
        targetX = b.x,
        targetY = b.y + b.h / 2,
        bend = Math.max(30, Math.abs(targetX - sourceX) / 2),
        // A stage's step chain sits directly beneath it, so link it straight down; other edges curve.
        stacked = b.kind === 'step' && ['step', 'stage'].includes(a.kind) && a.x === b.x && b.y > a.y;
      const line = svg('path', {
        d: stacked
          ? `M${a.x + 100},${a.y + a.h} L${b.x + 100},${b.y}`
          : `M${sourceX},${sourceY} C${sourceX + bend},${sourceY} ${targetX - bend},${targetY} ${targetX},${targetY}`,
        class: 'graph-edge',
        'marker-end': 'url(#colabGraphArrow)',
      });
      line.dataset.source = edge.source;
      line.dataset.target = edge.target;
      const hint = svg('title');
      hint.textContent = edge.kind + ' · ' + edge.origin;
      line.append(hint);
      canvas.append(line);
    }
    for (const row of nodes) {
      const p = positions.get(row.id),
        group = svg('g', {
          transform: `translate(${p.x} ${p.y})`,
          class: 'colab-graph-node',
          tabindex: 0,
          role: 'button',
          'aria-label': row.label + ' · ' + row.status,
        });
      group.dataset.id = row.id;
      const step = row.kind === 'step',
        color =
          row.kind === 'stage'
            ? row.provider === 'claude'
              ? '#e3a178'
              : '#7ac6a2'
            : step && row.status === 'failed'
              ? '#f39a8b'
              : colors[row.kind] || '#8ba9bc';
      group.append(
        svg('rect', {
          width: 200,
          height: p.h,
          rx: step ? 8 : 11,
          fill: '#11262e',
          stroke: color,
          'stroke-width': row.status === 'running' || (step && row.status === 'failed') ? 2.5 : 1,
        }),
      );
      const label = svg('text', { x: 12, y: step ? 16 : 23 });
      label.textContent = row.label.length > 27 ? row.label.slice(0, 26) + '…' : row.label;
      const meta = svg('text', { x: 12, y: step ? 32 : 45, class: 'graph-node-meta' });
      meta.textContent = (row.provider ? row.provider + ' · ' : row.kind + ' · ') + row.status;
      const hint = svg('title');
      hint.textContent = row.label + '\n' + row.origin;
      group.append(label, meta, hint);
      group.onclick = () => choose(row.id);
      group.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose(row.id);
        }
      };
      canvas.append(group);
    }
    viewport.append(canvas);
    setZoom(zoom);
    paint();
    footer.textContent =
      graph.nodes.length +
      ' nodes · ' +
      graph.edges.length +
      ' relationships · ' +
      graph.outcome +
      (graph.omitted ? ' · Bounded view: earlier or excess details omitted.' : '') +
      ' · Provider reports are labelled; only ATLAS executed checks count as app verification. Saved locally; no extra model calls.';
  }
  function refresh(force = false) {
    if (!dialog.open && !force) return;
    const data = window.atlasColab.graphHistory(),
      history = data.runs,
      switched = chatId !== data.chatId;
    chatId = data.chatId;
    if (switched || runId === latestId || !history.some((run) => run.id === runId)) runId = history.at(-1)?.id || '';
    latestId = history.at(-1)?.id || '';
    graph = history.find((run) => run.id === runId)?.graph || null;
    const next = [chatId, runId, graph, filter.value, history.length];
    if (!force && Array.isArray(signature) && next.every((value, index) => value === signature[index])) return;
    signature = next;
    runs.replaceChildren(
      ...history.map(
        (run, index) =>
          new Option(index + 1 + '. ' + (run.graph.task || 'Task').slice(0, 65) + ' · ' + run.graph.outcome, run.id),
      ),
    );
    runs.value = runId;
    runs.disabled = !history.length;
    if (switched) selected = '';
    if (selected && !graph?.nodes.some((node) => node.id === selected)) selected = '';
    draw();
  }
  button.onclick = () => {
    runId = '';
    dialog.showModal();
    refresh(true);
    requestAnimationFrame(fit);
  };
  runs.onchange = () => {
    runId = runs.value;
    selected = '';
    refresh(true);
    fit();
  };
  search.oninput = () => {
    if (graph) paint();
  };
  filter.onchange = () => {
    draw();
    fit();
  };
  window.addEventListener('atlas-colab-chat-change', () => refresh());
  window.addEventListener('resize', () => {
    if (dialog.open) fit();
  });
})();
