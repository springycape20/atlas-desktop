(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasAppearance = api;
})(globalThis, function () {
  const defaults = { uiTheme: 'dark', uiTextScale: 1, uiDensity: 'comfortable' };
  function clean(value) {
    return {
      uiTheme: ['dark', 'light', 'contrast'].includes(value?.uiTheme) ? value.uiTheme : defaults.uiTheme,
      uiTextScale: [1, 1.15, 1.3].includes(value?.uiTextScale) ? value.uiTextScale : defaults.uiTextScale,
      uiDensity: ['comfortable', 'compact'].includes(value?.uiDensity) ? value.uiDensity : defaults.uiDensity,
    };
  }
  return { defaults, clean };
});
