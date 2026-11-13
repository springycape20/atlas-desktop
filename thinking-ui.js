(() => {
  // Decorative waiting copy, never a description of the model's private reasoning.
  const phrases = [
    'Pondering',
    'Processing',
    'Contemplating',
    'Connecting the dots',
    'Rethinking life choices',
    'Considering the possibilities',
    'Consulting the imaginary council',
    'Untangling the idea spaghetti',
    'Thinking it through',
    'Persuading the pixels',
    'Brewing a fresh thought',
    'Herding stray ideas',
    'Negotiating with the brain cells',
    'Looking for the plot twist',
    'Polishing the lightbulb',
    'Assembling a cunning plan',
    'Checking under the thought sofa',
    'Turning coffee into possibilities',
    'Recalculating the meaning of everything',
    'Giving the gears a pep talk',
  ];
  let bag = [],
    lastPhrase;
  function nextPhrase() {
    if (!bag.length) {
      bag = phrases.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.at(-1) === lastPhrase) [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]];
    }
    lastPhrase = bag.pop();
    return lastPhrase;
  }
  const waiting = new Map();
  function stop(target) {
    const state = waiting.get(target);
    if (!state) return;
    clearInterval(state.timer);
    state.observer.disconnect();
    waiting.delete(target);
  }
  function start(target) {
    if (!target) return;
    stop(target);
    const host = document.createElement('span'),
      spinner = document.createElement('span'),
      text = document.createElement('span');
    host.className = 'atlas-thinking';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-label', 'ATLAS is working. Waiting for a response.');
    spinner.className = 'atlas-thinking-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    text.className = 'atlas-thinking-phrase';
    text.setAttribute('aria-hidden', 'true');
    host.append(spinner, text);
    target.replaceChildren(host);
    const paint = () => {
      text.replaceChildren(
        ...Array.from(nextPhrase() + '…', (letter, i) => {
          const span = document.createElement('span');
          span.textContent = letter;
          span.style.setProperty('--letter', i);
          return span;
        }),
      );
    };
    paint();
    const observer = new MutationObserver(() => {
      if (!target.contains(host)) stop(target);
    });
    observer.observe(target, { childList: true, subtree: true });
    const timer = setInterval(() => {
      if (!target.isConnected || !target.contains(host)) {
        stop(target);
        return;
      }
      if (document.hidden || !target.getClientRects().length || matchMedia('(prefers-reduced-motion: reduce)').matches)
        return;
      paint();
    }, 4000);
    waiting.set(target, { timer, observer });
  }
  window.atlasThinking = { start, stop };
  window.addEventListener('beforeunload', () => {
    for (const target of waiting.keys()) stop(target);
  });
})();
