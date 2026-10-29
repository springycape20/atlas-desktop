(() => {
  function render(host, state) {
    const width = Math.max(300, host.clientWidth || 700),
      rows = state.items.slice(0, 40),
      ns = 'http://www.w3.org/2000/svg',
      svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + Math.max(80, rows.length * 74 + 20));
    svg.style.width = '100%';
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Task dependency graph. Arrows point from prerequisites to dependent tasks. Editable selectors follow this graph.',
    );
    const make = (type, attrs, text) => {
      const element = document.createElementNS(ns, type);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
      if (text) element.textContent = text;
      svg.append(element);
      return element;
    };
    const positions = new Map(rows.map((row, index) => [row.id, index * 74 + 10]));
    for (const row of rows)
      for (const id of row.prerequisites || []) {
        if (!positions.has(id)) continue;
        const y1 = positions.get(id) + 28,
          y2 = positions.get(row.id) + 28;
        make('path', {
          d: `M 60 ${y1} C 12 ${y1},12 ${y2},60 ${y2}`,
          fill: 'none',
          stroke: '#91aaa9',
          'stroke-width': 1.5,
        });
        make('path', { d: `M 52 ${y2 - 4} L 60 ${y2} L 52 ${y2 + 4}`, fill: 'none', stroke: '#91aaa9' });
      }
    for (const row of rows) {
      const y = positions.get(row.id);
      make('rect', { x: 60, y, width: width - 70, height: 56, rx: 5, fill: '#192326', stroke: '#40545b' });
      make(
        'text',
        { x: 72, y: y + 23, fill: '#e6eeee', 'font-size': 14 },
        row.prompt.slice(0, Math.max(20, Math.floor((width - 100) / 8))),
      );
      make(
        'text',
        { x: 72, y: y + 43, fill: '#a8b7ba', 'font-size': 12 },
        row.status + ((row.prerequisites || []).length ? ' · requires ' + row.prerequisites.length + ' task(s)' : ''),
      );
    }
    host.append(svg);
  }
  window.atlasTaskGraph = { render };
})();
