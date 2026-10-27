// The once-per-project offer to turn on completion checks, shown under a task that finished
// unverified. The main process only accepts commands it recorded with the offer.
(function (root) {
  const style = document.createElement('style');
  style.textContent =
    '.check-offer{margin-top:12px;padding:12px 14px;border:1px solid #6b5a33;border-radius:10px;background:#1d1a12;color:#e8dcc0;font:12px/1.6 Segoe UI,sans-serif}.check-offer p{margin:0 0 8px;white-space:normal}.check-offer label{display:flex;align-items:center;gap:8px;font-family:Consolas,monospace;margin:2px 0}.check-offer input{width:auto}.check-offer small{display:block;color:#bba987;margin:8px 0}.check-offer-actions{display:flex;flex-wrap:wrap;gap:8px}';
  document.head.append(style);
  function button(text, primary) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = primary ? 'primary-button' : 'quiet-button';
    element.textContent = text;
    return element;
  }
  function card(offer, { jobId, onAnswered = () => {}, onVerified = () => {}, toast = () => {} } = {}) {
    const box = document.createElement('section'),
      intro = document.createElement('p'),
      note = document.createElement('small'),
      actions = document.createElement('div');
    box.className = 'check-offer';
    box.setAttribute('aria-label', 'Turn on completion checks');
    intro.textContent = offer.configured
      ? 'No checks ran for this task. ' +
        (offer.profileName || 'This project') +
        ' has completion checks, but automatic checks are off:'
      : 'No checks ran for this task. ATLAS found these checks in ' + offer.cwd + ':';
    box.append(intro);
    const boxes = (offer.checks || []).map((command) => {
      const label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.value = command;
      label.append(input, document.createTextNode(command));
      box.append(label);
      return input;
    });
    note.textContent =
      'Enable runs the selected checks after future tasks in this project. Run on this task runs them once now in the task folder; an isolated worktree may need its dependencies installed first. ATLAS asks about each project once.';
    const enable = button('Enable for this project', true),
      run = button('Run on this task'),
      decline = button("Don't ask for this project"),
      all = [enable, run, decline],
      chosen = () => boxes.filter((input) => input.checked).map((input) => input.value),
      busy = (value) => all.forEach((element) => (element.disabled = value));
    async function answer(choice) {
      busy(true);
      try {
        const result = await root.atlas.checkOffer({ cwd: offer.cwd, answer: choice, commands: chosen() });
        onAnswered(choice === 'enable' ? 'enabled' : 'declined', result);
      } catch (error) {
        toast(error.message);
        busy(false);
      }
    }
    enable.onclick = () => answer('enable');
    decline.onclick = () => answer('decline');
    run.onclick = async () => {
      busy(true);
      run.textContent = 'Running checks…';
      try {
        const result = await root.atlas.checkOffer({ action: 'run', jobId, commands: chosen() });
        onVerified(result.verification);
      } catch (error) {
        toast(error.message);
      } finally {
        busy(false);
        run.textContent = 'Run on this task';
      }
    };
    actions.className = 'check-offer-actions';
    actions.append(enable, run, decline);
    box.append(note, actions);
    return box;
  }
  root.atlasCheckOffer = { card };
})(globalThis);
