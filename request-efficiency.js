const { createHash } = require('node:crypto');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const estimate = (text) => Math.ceil(String(text || '').length / 4);
function budget(sections, { prompt = '', imageCount = 0, scope = 'assistant', limit = 16000 } = {}) {
  const rows = [{ id: 'prompt', label: 'Current request', text: prompt, included: true }, ...sections].map((row) => ({
    id: row.id,
    label: row.label,
    included: row.included !== false,
    characters: row.included === false ? 0 : String(row.text || '').length,
    estimatedTokens: row.included === false ? 0 : estimate(row.text),
  }));
  const estimatedTokens = rows.reduce((sum, row) => sum + row.estimatedTokens, 0);
  return {
    rows,
    estimatedTokens,
    limit,
    overBudget: estimatedTokens > limit,
    imageCount,
    scope,
    estimated: true,
    complete: false,
    expectedPasses:
      scope === 'colab'
        ? 'At least a builder and reviewer; retries/milestones add passes.'
        : 'One initial model turn; tools, fallback or opted-in repair can add calls.',
    note: 'Text estimate uses four characters per token. Image cost, hidden provider instructions, retained provider history, tools and reasoning are not measured. This is not a subscription allowance or a hard spending cap.',
  };
}
function createContextReuse({ now = Date.now, maxSessions = 64, refreshAfter = 5, maxAgeMs = 900000 } = {}) {
  const sessions = new Map();
  return {
    prepare({ prompt, blocks = [], identity, enabled = true, forceFull = false }) {
      const valid = blocks.filter(
        (row) =>
          row &&
          typeof row.id === 'string' &&
          blocks.filter((other) => other?.id === row.id).length === 1 &&
          typeof row.text === 'string' &&
          row.text.length > 120 &&
          prompt.indexOf(row.text) >= 0 &&
          prompt.indexOf(row.text) === prompt.lastIndexOf(row.text),
      );
      let prepared;
      return {
        render({ sessionId, resumed }) {
          const key = JSON.stringify([identity, sessionId || '']);
          const previous = sessions.get(key);
          const reuse =
            enabled &&
            !forceFull &&
            resumed &&
            sessionId &&
            previous &&
            now() - previous.fullAt < maxAgeMs &&
            previous.turns < refreshAfter;
          let text = prompt;
          const omitted = [],
            hashes = {};
          for (const row of valid) {
            hashes[row.id] = hash(row.text);
            if (reuse && row.cacheable === true && previous.hashes[row.id] === hashes[row.id]) {
              const marker =
                '[Unchanged reference already supplied in this retained session: ' +
                String(row.label || row.id).slice(0, 160) +
                '. Read the source again if needed.]';
              if (marker.length < row.text.length) {
                text = text.replace(row.text, marker);
                omitted.push(row.id);
              }
            }
          }
          prepared = {
            key,
            sessionId,
            hashes,
            turns: reuse ? previous.turns + 1 : 1,
            at: now(),
            fullAt: reuse ? previous.fullAt : now(),
            omitted,
            charactersAvoided: prompt.length - text.length,
            fullRefresh: !reuse,
          };
          return text;
        },
        commit(sessionId) {
          if (!prepared || !sessionId || sessionId !== prepared.sessionId) return;
          sessions.delete(prepared.key);
          sessions.set(prepared.key, prepared);
          while (sessions.size > maxSessions) sessions.delete(sessions.keys().next().value);
        },
        fail() {
          if (prepared) sessions.delete(prepared.key);
        },
        report() {
          return prepared
            ? {
                omitted: prepared.omitted,
                charactersAvoided: prepared.charactersAvoided,
                estimatedTokensAvoided: Math.floor(prepared.charactersAvoided / 4),
                fullRefresh: prepared.fullRefresh,
                estimated: true,
              }
            : null;
        },
      };
    },
    clear() {
      sessions.clear();
    },
  };
}
module.exports = { budget, estimate, createContextReuse, hash };
