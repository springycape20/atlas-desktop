(() => {
  const { node, actionButton } = window.atlasUi;
  const dialog = document.getElementById('settingsDialog');
  const section = node('section', undefined, 'setting-section');
  section.append(
    node('h3', 'Appearance'),
    node('p', 'Preview changes here, then choose Save settings to keep them on this computer.'),
  );
  const fields = {};
  for (const [key, label, choices] of [
    [
      'uiMotion',
      'Motion',
      [
        ['system', 'Follow system preference'],
        ['reduced', 'Reduce motion'],
      ],
    ],
    [
      'uiTheme',
      'Theme',
      [
        ['dark', 'Dark'],
        ['light', 'Light'],
        ['contrast', 'High contrast'],
      ],
    ],
    [
      'uiTextScale',
      'Text size',
      [
        [1, 'Standard · 100%'],
        [1.15, 'Larger · 115%'],
        [1.3, 'Largest · 130%'],
      ],
    ],
    [
      'uiDensity',
      'Spacing',
      [
        ['comfortable', 'Comfortable'],
        ['compact', 'Compact'],
      ],
    ],
  ]) {
    const row = node('label', undefined, 'field');
    row.append(node('span', label));
    const select = node('select');
    select.id = key;
    for (const [value, title] of choices) {
      const option = node('option', title);
      option.value = value;
      select.append(option);
    }
    fields[key] = select;
    row.append(select);
    section.append(row);
    select.addEventListener('change', () => apply(read()));
  }
  const read = () =>
    window.atlasAppearance.clean({
      uiTheme: fields.uiTheme.value,
      uiTextScale: Number(fields.uiTextScale.value),
      uiDensity: fields.uiDensity.value,
      uiMotion: fields.uiMotion.value,
    });
  const apply = (value) => {
    const safe = window.atlasAppearance.clean(value);
    document.documentElement.dataset.uiTheme = safe.uiTheme;
    document.documentElement.dataset.uiDensity = safe.uiDensity;
    document.documentElement.dataset.uiMotion = safe.uiMotion;
    document.documentElement.style.setProperty('--atlas-text-scale', safe.uiTextScale);
    return safe;
  };
  const fill = (value) => {
    for (const [key, setting] of Object.entries(apply(value))) fields[key].value = setting;
  };
  actionButton(
    'Reset appearance',
    () => {
      fill(window.atlasAppearance.defaults);
      fields.uiTheme.dispatchEvent(new Event('change', { bubbles: true }));
    },
    section,
  );
  window.atlasSettings.register(section);
  let saved = window.atlasAppearance.clean(typeof settings === 'object' ? settings : {});
  fill(saved);
  // Read the persisted value once at startup; never persist a preview on close.
  window.atlas
    .getSettings()
    .then((value) => {
      saved = window.atlasAppearance.clean(value);
      if (!dialog.open) fill(saved);
    })
    .catch(() => {});
  let wasOpen = dialog.open;
  new MutationObserver(() => {
    if (wasOpen === dialog.open) return;
    wasOpen = dialog.open;
    fill(saved);
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  window.atlasAppearanceUi = {
    read,
    saved: (value) => {
      saved = window.atlasAppearance.clean(value);
      apply(saved);
    },
  };
})();
