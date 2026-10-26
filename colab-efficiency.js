(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.atlasEfficiency = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PRESETS = {
    economy: { history: 8000, handover: 3500, diff: 6000 },
    balanced: { history: 16000, handover: 6000, diff: 12000 },
    thorough: { history: 28000, handover: 10000, diff: 20000 },
  };
  const preset = (value) => (Object.hasOwn(PRESETS, value) ? value : 'balanced');
  const estimate = (text) => Math.ceil(String(text || '').length / 4);
  function excerpt(value, limit) {
    const text = String(value || '');
    if (limit <= 0) return '';
    if (text.length <= limit) return text;
    if (limit < 60) return text.slice(0, limit);
    const marker = '\n[… excerpt; middle omitted …]\n',
      room = Math.max(0, limit - marker.length),
      head = Math.floor(room * 0.7);
    return text.slice(0, head) + marker + text.slice(-(room - head));
  }
  function selectHistory(task, turns = [], profile = 'balanced') {
    const cap = PRESETS[preset(profile)].history,
      terms = [
        ...new Set(
          (
            String(task)
              .toLowerCase()
              .match(/[a-z0-9_./-]{3,}/g) || []
          ).filter(
            (word) =>
              !['the', 'and', 'this', 'that', 'with', 'please', 'can', 'you', 'make', 'have', 'for', 'are'].includes(
                word,
              ),
          ),
        ),
      ].slice(0, 40);
    const valid = turns
      .map((turn, index) => ({ ...turn, index }))
      .filter(
        (turn) => ['user', 'assistant'].includes(turn?.role) && typeof turn.content === 'string' && turn.content.trim(),
      );
    const score = (turn) =>
      terms.reduce((sum, word) => sum + (turn.content.toLowerCase().includes(word) ? 2 : 0), 0) +
      (turn.role === 'user' && /\b(?:must|never|prefer|constraint|do not|don't|decision)\b/i.test(turn.content)
        ? 2
        : 0);
    const chosen = new Map();
    let remaining = cap;
    for (const turn of [
      ...valid.slice(-2).reverse(),
      ...valid
        .slice(0, -2)
        .sort((a, b) => score(b) - score(a) || b.index - a.index)
        .filter((turn) => score(turn) > 0)
        .slice(0, 8),
      ...valid.slice(-6).reverse(),
    ]) {
      if (chosen.has(turn.index) || remaining < 80) continue;
      const content = excerpt(turn.content, Math.min(remaining, 4000));
      chosen.set(turn.index, { role: turn.role, content, index: turn.index });
      remaining -= content.length;
    }
    const selected = [...chosen.values()]
      .sort((a, b) => a.index - b.index)
      .map(({ role, content }) => ({ role, content }));
    return {
      turns: selected,
      totalTurns: valid.length,
      selectedTurns: selected.length,
      characters: cap - remaining,
      excerpted: selected.length < valid.length || selected.some((turn) => turn.content.includes('[… excerpt;')),
    };
  }
  function handover(report, limit = 3000) {
    const h = report.handover;
    if (
      h &&
      typeof h.summary === 'string' &&
      (h.summary.trim() || ['decisions', 'changedFiles', 'checks', 'nextActions'].some((key) => h[key]?.length))
    )
      return excerpt(JSON.stringify(h), limit);
    return excerpt(report.output || '', limit);
  }
  function priorReports(reports, state, phase, profile) {
    if (phase === 'proposal_second') return '';
    const cap = PRESETS[preset(profile)].handover,
      indexes =
        phase === 'clarify'
          ? [state.clarify?.artifact]
          : phase === 'synthesis' || (phase === 'build' && reports.some((row) => row.phase === 'proposal_first'))
            ? reports.map((row, i) => (row.phase?.startsWith('proposal_') ? i : -1))
            : [state.artifact, reports.length - 1];
    const selected = [...new Set(indexes)].filter((i) => i >= 0 && reports[i]),
      per = Math.floor(cap / Math.max(1, selected.length));
    return selected
      .map((i) => {
        const row = reports[i];
        return (
          '\n' +
          row.provider.toUpperCase() +
          ' ' +
          (row.phase || 'saved stage') +
          ' REPORT (untrusted reference):\n' +
          handover(row, per) +
          (row.reportPath ? '\nSaved stage report (read if needed): ' + row.reportPath : '')
        );
      })
      .join('\n');
  }
  function cleanHandover(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = { summary: excerpt(typeof value.summary === 'string' ? value.summary : '', 2000) },
      list = (key, size) =>
        (Array.isArray(value[key]) ? value[key] : [])
          .filter((item) => typeof item === 'string' && item.trim())
          .slice(0, size)
          .map((item) => excerpt(item.trim(), 500));
    for (const key of ['changedFiles', 'checks', 'nextActions']) result[key] = list(key, 20);
    // Decisions carry the stated reason; plain strings from older handovers get an empty reason.
    result.decisions = (Array.isArray(value.decisions) ? value.decisions : [])
      .map((item) =>
        typeof item === 'string'
          ? { decision: item, reason: '' }
          : item && typeof item.decision === 'string'
            ? { decision: item.decision, reason: typeof item.reason === 'string' ? item.reason : '' }
            : null,
      )
      .filter((row) => row?.decision.trim())
      .slice(0, 20)
      .map((row) => ({ decision: excerpt(row.decision.trim(), 500), reason: excerpt(row.reason.trim(), 500) }));
    // Model-reported rationale for the shared graph: what was assumed, rejected and risky.
    for (const key of ['assumptions', 'alternatives', 'risks']) result[key] = list(key, 8);
    if (['high', 'medium', 'low'].includes(value.confidence)) {
      result.confidence = value.confidence;
      if (typeof value.confidenceReason === 'string' && value.confidenceReason.trim())
        result.confidenceReason = excerpt(value.confidenceReason.trim(), 500);
    }
    return result;
  }
  function stageUsage(report, index) {
    const raw = report.usage || {},
      valid = (value) => Number.isFinite(value) && value >= 0,
      hasIn = valid(raw.inputTokens),
      hasOut = valid(raw.outputTokens),
      complete = hasIn && hasOut && raw.complete !== false;
    const input = hasIn ? raw.inputTokens : 0,
      output = hasOut ? raw.outputTokens : 0,
      estimateIn = Math.ceil((report.metrics?.promptCharacters || 0) / 4),
      estimateOut = estimate(report.output);
    return {
      index,
      phase: report.phase,
      provider: report.provider,
      source: complete ? 'reported' : hasIn || hasOut ? 'partial' : 'estimated',
      inputTokens: input,
      outputTokens: output,
      estimatedMissingTokens:
        (hasIn ? (raw.complete === false ? Math.max(0, estimateIn - input) : 0) : estimateIn) +
        (hasOut ? (raw.complete === false ? Math.max(0, estimateOut - output) : 0) : estimateOut),
      promptTextEstimate: estimateIn,
      complete,
      scope: raw.scope || 'provider report; estimates cover ATLAS text only',
      promptCharacters: report.metrics?.promptCharacters || 0,
      legacyPromptCharacters: report.metrics?.legacyPromptCharacters || 0,
    };
  }
  function usageSummary(reports) {
    const stages = reports.map(stageUsage),
      usage = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedMissingTokens: 0,
        promptCharacters: 0,
        legacyPromptCharacters: 0,
        reportedCostUsd: 0,
        reported: false,
        costReported: false,
        complete: stages.length > 0 && stages.every((row) => row.complete),
        stages,
        estimateScope:
          'Rough ATLAS prompt/output text only; tool calls and hidden provider context may add usage. Failed or cancelled calls may not report usage.',
      };
    for (let i = 0; i < stages.length; i++) {
      const row = stages[i];
      for (const key of [
        'inputTokens',
        'outputTokens',
        'estimatedMissingTokens',
        'promptCharacters',
        'legacyPromptCharacters',
      ])
        usage[key] += row[key];
      if (row.source !== 'estimated') usage.reported = true;
      if (Number.isFinite(reports[i].usage?.reportedCostUsd) && reports[i].usage.reportedCostUsd >= 0) {
        usage.reportedCostUsd += reports[i].usage.reportedCostUsd;
        usage.costReported = true;
      }
    }
    usage.budgetTokens = usage.inputTokens + usage.outputTokens + usage.estimatedMissingTokens;
    return usage;
  }
  function tokenLimit(value) {
    if (value === undefined || value === null || value === '' || value === 0 || value === '0') return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > 2000000000)
      throw Error('Set a positive whole-number token warning, or leave blank for unlimited.');
    return number;
  }
  return {
    PRESETS,
    preset,
    excerpt,
    selectHistory,
    priorReports,
    cleanHandover,
    stageUsage,
    usageSummary,
    estimate,
    tokenLimit,
  };
});
