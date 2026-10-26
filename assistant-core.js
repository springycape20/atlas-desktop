// Decode provider events without exposing tool output or reasoning to speech.
function createDecoder(provider, onText, onActivity = () => {}, { reasoning = false } = {}) {
  let buffer = '',
    hasPartial = false;
  const seen = new Set(),
    tools = new Map();
  function line(value) {
    let event;
    try {
      event = JSON.parse(value);
    } catch {
      return;
    }
    if (provider === 'codex' && ['item.started', 'item.completed', 'item.updated'].includes(event.type) && event.item) {
      const item = event.item;
      if (item.type === 'todo_list')
        onActivity({
          kind: 'plan',
          text: (item.items || []).map((x) => (x.completed ? 'Done: ' : 'Next: ') + x.text).join('\n'),
        });
      else if (item.type === 'file_change')
        onActivity({ kind: 'files', text: (item.changes || []).map((x) => x.kind + ': ' + x.path).join('\n') });
      else if (['command_execution', 'mcp_tool_call', 'web_search'].includes(item.type))
        onActivity({
          kind: 'activity',
          text:
            item.type +
            ' · ' +
            (item.status || event.type) +
            (Number.isInteger(item.exit_code) ? ' · exit ' + item.exit_code : ''),
        });
    }
    if (provider === 'claude' && event.type === 'assistant')
      for (const part of event.message?.content || [])
        if (part.type === 'tool_use') {
          const key = 'tool:' + part.id;
          if (!seen.has(key)) {
            seen.add(key);
            const activity = {
              id: 'claude:' + part.id,
              kind: part.name === 'TodoWrite' ? 'plan' : part.name === 'Bash' ? 'command' : 'activity',
              tool: String(part.name || ''),
              status: 'running',
              text: String(
                part.name === 'TodoWrite'
                  ? (part.input?.todos || []).map((todo) => todo.status + ': ' + todo.content).join('\n')
                  : part.name === 'Bash'
                    ? part.input?.command
                    : part.name +
                      (part.input?.file_path
                        ? ' · ' + part.input.file_path
                        : part.input?.pattern
                          ? ' · ' + part.input.pattern
                          : ''),
              ).slice(0, 1200),
            };
            tools.set(part.id, activity);
            onActivity(activity);
          }
        }
    // Opt-in: the thinking Claude returns in its messages (summarized by the API on current models).
    // Redacted thinking has nothing readable and is skipped.
    if (provider === 'claude' && reasoning && event.type === 'assistant')
      for (const [index, part] of (event.message?.content || []).entries())
        if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) {
          const key = 'thinking:' + (event.message.id || '') + ':' + index;
          if (!seen.has(key)) {
            seen.add(key);
            onActivity({ id: key, kind: 'reasoning', text: part.thinking.trim().slice(0, 4000) });
          }
        }
    if (provider === 'claude' && event.type === 'assistant')
      for (const part of event.message?.content || [])
        if (part.type === 'text' && part.text?.trim()) {
          const key = 'progress:' + (event.message.id || part.text);
          if (!seen.has(key)) {
            seen.add(key);
            onActivity({ id: key, kind: 'progress', text: part.text.slice(0, 1200) });
          }
        }
    if (provider === 'claude' && event.type === 'user')
      for (const part of event.message?.content || [])
        if (part.type === 'tool_result' && tools.has(part.tool_use_id))
          onActivity({ ...tools.get(part.tool_use_id), status: part.is_error ? 'failed' : 'completed' });
    if (provider === 'codex' && event.type === 'item.completed' && event.item?.type === 'agent_message') {
      const key = event.item.id || event.item.text;
      if (!seen.has(key)) {
        seen.add(key);
        onText((event.item.text || '') + '\n');
      }
    }
    if (provider === 'claude') {
      if (event.type === 'stream_event' && event.event?.type === 'message_start') hasPartial = false;
      if (event.type === 'stream_event' && event.event?.delta?.type === 'text_delta') {
        hasPartial = true;
        onText(event.event.delta.text || '');
      }
      if (event.type === 'assistant' && !hasPartial) {
        const key = event.message?.id;
        if (!seen.has(key)) {
          seen.add(key);
          for (const part of event.message?.content || []) if (part.type === 'text') onText(part.text || '');
        }
      }
    }
  }
  return {
    push(part) {
      buffer += part;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      lines.forEach(line);
    },
    finish() {
      if (buffer.trim()) line(buffer);
      buffer = '';
    },
  };
}
module.exports = { createDecoder };
