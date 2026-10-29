const node = (tag, text, cls) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (cls) value.className = cls;
  return value;
};
window.atlasUi = {
  node,
  actionButton: (label, run, parent) => {
    const button = node('button', label);
    button.type = 'button';
    button.onclick = () =>
      Promise.resolve()
        .then(run)
        .catch((error) => (document.getElementById('demoStatus').textContent = error.message));
    parent.append(button);
    return button;
  },
};
window.atlasSettings = { register: (section) => document.querySelector('.settings-body').append(section) };
