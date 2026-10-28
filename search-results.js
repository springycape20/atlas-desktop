(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasSearchResults = api;
})(globalThis, () => {
  function rank(rows, query) {
    const needle = String(query || '')
      .trim()
      .toLowerCase()
      .slice(0, 200);
    if (needle.length < 2) return [];
    const seen = new Set();
    return rows
      .slice(0, 3000)
      .map((row) => {
        const title = String(row.title || 'Untitled').slice(0, 200),
          text = String(row.text || '').slice(0, 20000),
          at = text.toLowerCase().indexOf(needle),
          titleHit = title.toLowerCase().includes(needle);
        return {
          ...row,
          title,
          text: at >= 0 ? text.slice(Math.max(0, at - 120), at + 1000) : text.slice(0, 1000),
          score: titleHit ? 2 : at >= 0 ? 1 : row.matched === true ? 0.5 : 0,
        };
      })
      .filter((row) => {
        const key = [row.kind, row.id || row.jobId || row.conversationId || row.colabId || row.title, row.text].join(
          '|',
        );
        if (!row.score || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score || (b.at || 0) - (a.at || 0))
      .slice(0, 200);
  }
  return { rank };
});
