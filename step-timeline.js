// The tool steps one provider pass took (commands, file changes, MCP and gateway calls, searches),
// built from the activity events the connections report. Plain file reads, plans and progress
// narration are left out. Steps are provider-reported apart from ATLAS gateway actions.
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']),
  SEARCHES = new Set(['Grep', 'WebSearch', 'WebFetch']),
  SKIPPED = new Set(['Read', 'Glob', 'LS', 'NotebookRead', 'TodoWrite']);
function stepType(event = {}) {
  if (!event || ['reasoning', 'progress', 'plan'].includes(event.kind)) return null;
  const tool = String(event.tool || '');
  if (tool === 'atlas-gateway') return 'gateway';
  if (tool === 'commandExecution' || tool === 'Bash') return 'command';
  if (tool === 'fileChange' || EDITS.has(tool)) return 'file';
  if (tool === 'webSearch' || SEARCHES.has(tool)) return 'search';
  if (tool === 'mcpToolCall' || tool.startsWith('mcp__')) return 'mcp';
  if (SKIPPED.has(tool)) return null;
  // Other Codex item types (context compaction, image views…) are not tool actions.
  if (event.provider === 'codex') return null;
  return tool ? 'tool' : null;
}
function createStepCapture({ limit = 40 } = {}) {
  const steps = new Map();
  let omitted = 0;
  return {
    add(event, now = Date.now()) {
      const type = stepType(event),
        text = String(event?.text || '').trim();
      if (!type || !text) return false;
      const id = String(event.id || type + ':' + text),
        done = event.status && event.status !== 'running';
      const existing = steps.get(id);
      if (existing) {
        if (event.status) existing.status = event.status;
        if (Number.isInteger(event.exitCode)) existing.exitCode = event.exitCode;
        if (done && !existing.endedAt) existing.endedAt = now;
        return true;
      }
      if (steps.size >= limit) {
        omitted++;
        return false;
      }
      steps.set(id, {
        type,
        provider: event.provider === 'claude' ? 'claude' : 'codex',
        text: text.slice(0, 300),
        status: event.status || 'completed',
        ...(Number.isInteger(event.exitCode) ? { exitCode: event.exitCode } : {}),
        startedAt: now,
        endedAt: done ? now : null,
      });
      return true;
    },
    list: () => [...steps.values()].map((row) => ({ ...row })),
    get omitted() {
      return omitted;
    },
  };
}
module.exports = { stepType, createStepCapture };
