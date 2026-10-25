(function (scope) {
  function tokenize(text, language, prism) {
    if (typeof text !== 'string' || text.length > 120000 || text.split('\n').length > 4000)
      return { lines: null, reason: 'large' };
    const grammar = prism.languages[language];
    if (!grammar) return { lines: null, reason: 'unsupported' };
    const lines = [[]];
    let spans = 0;
    function walk(token, types = []) {
      if (Array.isArray(token)) {
        for (const part of token) walk(part, types);
        return;
      }
      if (typeof token !== 'string') {
        const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : [];
        walk(
          token.content,
          [...types, token.type, ...aliases].filter((type) => /^[a-z][a-z0-9-]*$/i.test(type)),
        );
        return;
      }
      const pieces = token.split('\n');
      for (let i = 0; i < pieces.length; i++) {
        if (i) lines.push([]);
        if (!pieces[i]) continue;
        if (++spans > 40000) throw Error('Complex syntax');
        lines.at(-1).push({ text: pieces[i], types: [...new Set(types)] });
      }
    }
    try {
      walk(prism.tokenize(text, grammar));
      return { lines, reason: '' };
    } catch {
      return { lines: null, reason: 'complex' };
    }
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { tokenize };
    return;
  }
  importScripts('syntax-highlight.js');
  scope.onmessage = (event) => {
    const { id, text, language } = event.data;
    scope.postMessage({ id, ...tokenize(text, language, scope.Prism) });
  };
})(typeof self === 'object' ? self : globalThis);
