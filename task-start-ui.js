(() => {
  const choices = new Map();
  for (const [scope, selector] of [
    ['assistant', '.composer'],
    ['colab', '.colab-composer'],
  ]) {
    const label = document.createElement('label'),
      check = document.createElement('input');
    check.type = 'checkbox';
    check.setAttribute('aria-label', 'Create Git checkpoint before next ' + scope + ' task');
    label.append(check, document.createTextNode('Checkpoint before next task'));
    label.className = 'task-checkpoint-choice';
    (document.getElementById('attachmentMenu-' + scope) || document.querySelector(selector)).append(label);
    choices.set(scope, check);
  }
  window.atlasTaskStart = {
    async prepare(scope, cwd) {
      const choice = choices.get(scope);
      if (!choice?.checked) return;
      const row = await window.atlas.projectWorkbench({
        action: 'capture-git',
        cwd,
        name: 'Before ' + scope + ' task · ' + new Date().toLocaleString(),
      });
      choice.checked = false;
      return row;
    },
  };
})();
