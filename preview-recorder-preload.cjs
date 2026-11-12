const { ipcRenderer } = require('electron');
let enabled = false;
ipcRenderer.on('atlas:preview-recording', (_event, value) => {
  enabled = value === true;
});
const privateInput = (element) => {
  const hint = ['type', 'name', 'id', 'autocomplete', 'aria-label', 'placeholder']
    .map((key) => element.getAttribute(key) || '')
    .join(' ');
  return (
    element.closest('[data-private],[data-sensitive]') ||
    /password|secret|token|api.?key|credit|card|email|phone|tel|address|birth|account|one.time|cc-|hidden|(?:full|first|last|user)[_-]?name|\bname\b/i.test(
      hint,
    )
  );
};
function selector(element) {
  if (!(element instanceof Element)) return '';
  const parts = [];
  for (let item = element; item && parts.length < 8; item = item.parentElement) {
    if (item.id && document.querySelectorAll('#' + CSS.escape(item.id)).length === 1) {
      parts.unshift('#' + CSS.escape(item.id));
      break;
    }
    let part = item.tagName.toLowerCase();
    const siblings = item.parentElement
      ? [...item.parentElement.children].filter((row) => row.tagName === item.tagName)
      : [];
    if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(item) + 1) + ')';
    parts.unshift(part);
  }
  const value = parts.join(' > ');
  return value.length <= 500 && document.querySelectorAll(value).length === 1 ? value : '';
}
document.addEventListener(
  'click',
  (event) => {
    if (!enabled || !event.isTrusted) return;
    const element = event.target.closest('button,a,input[type=button],input[type=submit],[role=button]');
    if (!element || privateInput(element)) return;
    const value = selector(element);
    if (value) ipcRenderer.send('atlas:preview-record-step', { action: 'click', selector: value });
  },
  true,
);
document.addEventListener(
  'change',
  (event) => {
    const element = event.target;
    if (
      !enabled ||
      !event.isTrusted ||
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ||
      privateInput(element)
    )
      return;
    if (element.tagName === 'INPUT' && !['text', 'search', 'number', 'url', ''].includes(element.type)) return;
    const value = selector(element);
    if (value && element.value.length <= 4000)
      ipcRenderer.send('atlas:preview-record-step', { action: 'fill', selector: value, value: element.value });
  },
  true,
);
