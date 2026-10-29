function chooseContext(result, { budgetChars = 16000 } = {}) {
  const rows = [...(result.results || [])],
    chosen = [],
    omitted = [];
  let used = 0;
  for (const row of rows.sort((a, b) => (b.score || 0) - (a.score || 0))) {
    const reason = row.reason || (row.score ? 'Query match and file relevance' : 'Related import or test');
    const size = String(row.excerpt || '').length + row.path.length + 200;
    if (used + size > budgetChars) {
      omitted.push({ path: row.path, reason: 'Context budget' });
      continue;
    }
    used += size;
    chosen.push({ ...row, reason });
  }
  return {
    ...result,
    results: chosen,
    contextSelection: {
      characters: used,
      budgetChars,
      omitted,
      note: 'Ranking is based on local query/import/test hints; token counts are estimates.',
    },
  };
}
module.exports = { chooseContext };
