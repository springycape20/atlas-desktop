(() => {
  const api = window.atlas;
  if (!api.providerUsage) return;
  const names = { claude: 'Claude', codex: 'Codex' },
    state = {},
    buttons = {},
    statusByJob = new Map();
  let selected = 'claude',
    refreshing = false,
    finishTimer;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const style = el('style');
  style.textContent = `.provider-usage-dock{position:fixed;left:23px;bottom:9px;display:flex;gap:6px;align-items:center;z-index:10}.provider-usage-circle{--usage-color:#55c77d;display:grid;place-items:center;width:32px;height:32px;padding:5px;border:0;border-radius:50%;background:transparent;cursor:pointer;color:var(--usage-color)}.provider-usage-circle[data-provider=claude]{--usage-color:#e49a62}.provider-usage-circle:hover,.provider-usage-circle[aria-expanded=true]{background:#ffffff10}.provider-usage-circle:focus-visible{outline:2px solid var(--usage-color);outline-offset:2px}.provider-usage-circle svg{display:block;width:22px;height:22px;overflow:visible}.usage-ring-track{fill:none;stroke:currentColor;stroke-width:2.8;opacity:.2}.usage-ring-fill{fill:none;stroke:currentColor;stroke-width:2.8;stroke-linecap:butt;transition:stroke-dasharray .7s ease}.provider-usage-circle[data-unknown=true]{color:#8d9ba2}.provider-usage-circle[data-stale=true]{opacity:.65}.provider-usage-popup{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:390px;max-width:calc(100vw - 24px);max-height:min(75vh,560px);overflow:auto;border:1px solid #41474c;border-radius:15px;padding:18px;background:#272a2d;color:#e5e7e9;box-shadow:0 14px 40px #0008;font:13px/1.5 Segoe UI,sans-serif}.usage-popup-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.usage-popup-heading h2{font-size:16px;margin:0}.usage-popup-heading button{border:0;background:none;color:#b9c1c6;cursor:pointer;font-size:21px}.usage-plan{margin:4px 0 16px;color:#a9b0b5;font-size:12px}.usage-limit{margin:15px 0}.usage-limit-top{display:flex;justify-content:space-between;gap:16px;align-items:baseline}.usage-limit-top strong{font-weight:500;min-width:0;overflow-wrap:anywhere}.usage-limit-top span{white-space:nowrap;color:#e3e8ea}.usage-reset{display:block;color:#a9b2b8;font-size:11px;margin-top:4px}.usage-limit-bar{height:5px;margin-top:7px;border-radius:8px;background:#41484c;overflow:hidden}.usage-limit-bar>i{display:block;height:100%;border-radius:inherit;background:var(--usage-color);transition:width .7s ease}.usage-popup-status{color:#b7c0c6;font-size:11px;margin:14px 0 0;white-space:pre-wrap}.usage-popup-actions{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #41474c;margin-top:14px;padding-top:12px}.usage-popup-actions button{border:1px solid #515960;border-radius:8px;padding:7px 11px;color:#e0e6ea;background:#30363c;font:12px Segoe UI,sans-serif;cursor:pointer}.usage-popup-actions button:disabled{opacity:.55;cursor:default}.usage-popup-actions button:focus-visible{outline:2px solid #81caca;outline-offset:2px}@media(max-width:750px){.provider-usage-dock{left:8px;bottom:6px;gap:0}.app>.foot{padding-left:66px}.provider-usage-circle{width:30px;height:28px}}@media(prefers-reduced-motion:reduce){.usage-ring-fill,.usage-limit-bar>i{transition:none}}`;
  document.head.append(style);
  const dock = el('div', undefined, 'provider-usage-dock');
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Provider usage remaining');
  const popup = el('div', undefined, 'provider-usage-popup');
  popup.id = 'providerUsagePopup';
  popup.setAttribute('popover', 'auto');
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-labelledby', 'providerUsageTitle');
  popup.innerHTML =
    '<header class="usage-popup-heading"><h2 id="providerUsageTitle"></h2><button type="button" aria-label="Close usage details" title="Close">×</button></header><p class="usage-plan"></p><div class="usage-limits"></div><p class="usage-popup-status" role="status"></p><div class="usage-popup-actions"><button type="button" class="usage-refresh">Refresh</button><button type="button" class="usage-open">Open app ↗</button></div>';
  for (const provider of ['claude', 'codex']) {
    const button = el('button', undefined, 'provider-usage-circle');
    button.type = 'button';
    button.dataset.provider = provider;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', popup.id);
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="usage-ring-track" cx="12" cy="12" r="9"/><circle class="usage-ring-fill" cx="12" cy="12" r="9" pathLength="100" transform="rotate(-90 12 12)"/></svg>';
    button.addEventListener('click', () => {
      if (popup.matches(':popover-open') && selected === provider) {
        popup.hidePopover();
        return;
      }
      selected = provider;
      renderPopup();
      position();
      if (!popup.matches(':popover-open')) popup.showPopover();
      for (const key of Object.keys(buttons)) buttons[key].setAttribute('aria-expanded', String(key === provider));
      popup.querySelector('.usage-refresh').focus();
      void refresh();
    });
    buttons[provider] = button;
    dock.append(button);
  }
  document.body.append(dock, popup);
  function position() {
    const rect = buttons[selected].getBoundingClientRect();
    popup.style.left = Math.max(12, Math.min(rect.left, innerWidth - 402)) + 'px';
    popup.style.bottom = Math.max(12, innerHeight - rect.top + 10) + 'px';
  }
  function expired(data) {
    return data?.windows?.some((row) => row.main && row.resetsAt && row.resetsAt <= Date.now());
  }
  function remaining(data) {
    return expired(data) ? null : (data?.remainingPercent ?? null);
  }
  function resetText(row) {
    if (!row.resetsAt) return row.usedPercent === 0 ? 'Starts when a message is sent' : 'Reset time not reported';
    const diff = row.resetsAt - Date.now();
    if (diff <= 0) return 'Reset due · awaiting refresh';
    const minutes = Math.ceil(diff / 60000),
      days = Math.floor(minutes / 1440),
      hours = Math.floor((minutes % 1440) / 60),
      mins = minutes % 60;
    return (
      'Resets in ' +
      [days ? days + 'd' : '', hours ? hours + 'h' : '', mins ? mins + 'm' : ''].filter(Boolean).join(' ')
    );
  }
  function paint() {
    for (const [provider, button] of Object.entries(buttons)) {
      const data = state[provider],
        value = remaining(data),
        known = typeof value === 'number',
        text =
          names[provider] +
          ': ' +
          (known ? Math.round(value) + '% remaining' : data ? 'Usage unavailable' : 'Checking usage…') +
          (data?.stale && data.updatedAt ? ' (last reported)' : '');
      button.title = text;
      button.setAttribute('aria-label', text);
      button.dataset.unknown = String(!known);
      button.dataset.stale = String(Boolean(data?.stale));
      button.querySelector('.usage-ring-fill').setAttribute('stroke-dasharray', known ? value + ' 100' : '2 5');
    }
    if (popup.matches(':popover-open')) renderPopup();
  }
  function renderPopup() {
    const data = state[selected];
    popup.style.setProperty('--usage-color', selected === 'claude' ? '#e49a62' : '#55c77d');
    popup.querySelector('h2').textContent = names[selected] + ' usage';
    popup.querySelector('.usage-plan').textContent =
      'Plan usage limits' + (data?.plan ? ' · ' + data.plan.replace(/_/g, ' ') : '');
    const list = popup.querySelector('.usage-limits');
    list.replaceChildren();
    for (const row of data?.windows || []) {
      const section = el('section', undefined, 'usage-limit'),
        top = el('div', undefined, 'usage-limit-top'),
        label = el('strong', row.label),
        amount = el(
          'span',
          row.remainingPercent === null ? 'Not reported' : Math.round(row.remainingPercent) + '% remaining',
        ),
        reset = el(
          'small',
          resetText(row) + (row.usedPercent !== null ? ' · ' + Math.round(row.usedPercent) + '% used' : ''),
          'usage-reset',
        ),
        bar = el('div', undefined, 'usage-limit-bar'),
        fill = el('i');
      top.append(label, amount);
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-label', row.label + ' remaining');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      if (row.remainingPercent !== null) bar.setAttribute('aria-valuenow', String(row.remainingPercent));
      fill.style.width = (row.remainingPercent ?? 0) + '%';
      bar.append(fill);
      section.append(top, reset, bar);
      list.append(section);
    }
    const status = popup.querySelector('.usage-popup-status');
    status.textContent = !data
      ? 'Checking usage…'
      : (data.error || '') +
        (data.error && data.updatedAt
          ? '\nLast successful update: ' + new Date(data.updatedAt).toLocaleTimeString()
          : '');
    if (data && !data.error)
      status.textContent =
        data.message ||
        (data.windows.length
          ? 'Circle shows the lowest remaining main session/weekly limit.\nUpdated ' +
            new Date(data.updatedAt).toLocaleTimeString()
          : "This account does not report subscription limits. Open the provider's usage page for details.");
    popup.querySelector('.usage-refresh').disabled = refreshing;
  }
  async function refresh(force = false) {
    if (refreshing) return;
    refreshing = true;
    if (popup.matches(':popover-open')) renderPopup();
    try {
      const result = await api.providerUsage({ refresh: force });
      Object.assign(state, result);
      paint();
    } catch {
      for (const provider of ['claude', 'codex'])
        state[provider] = { ...(state[provider] || {}), stale: true, error: 'Usage could not be refreshed.' };
      paint();
    } finally {
      refreshing = false;
      if (popup.matches(':popover-open')) renderPopup();
    }
  }
  popup.querySelector('.usage-popup-heading button').onclick = () => popup.hidePopover();
  popup.querySelector('.usage-refresh').onclick = () => void refresh(true);
  popup.querySelector('.usage-open').onclick = async () => {
    try {
      await api.openProviderUsage(selected);
    } catch {
      popup.querySelector('.usage-popup-status').textContent = 'Could not open the usage page. Try again.';
    }
  };
  popup.addEventListener('toggle', (event) => {
    if (event.newState === 'closed')
      for (const button of Object.values(buttons)) button.setAttribute('aria-expanded', 'false');
  });
  api.onProviderUsage?.((value) => {
    state[value.provider] = value;
    paint();
  });
  api.onJobs?.((patch) => {
    let completed = false;
    for (const job of patch.upsert || []) {
      if (statusByJob.get(job.id) === 'running' && job.status !== 'running') completed = true;
      statusByJob.set(job.id, job.status);
    }
    for (const id of patch.removed || []) statusByJob.delete(id);
    if (completed) {
      clearTimeout(finishTimer);
      finishTimer = setTimeout(() => void refresh(true), 15000);
    }
  });
  window.addEventListener('focus', () => void refresh(true));
  window.addEventListener('resize', () => {
    if (popup.matches(':popover-open')) position();
  });
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, 60000);
  paint();
  void refresh();
})();
