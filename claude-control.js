function createClaudeControl({ write, manager, job, trustedAtlasTools = false, onResult = () => {} }) {
  let buffer = '';
  async function handle(event) {
    if (event.type === 'result') {
      onResult();
      return;
    }
    if (event.type !== 'control_request') return;
    const request = event.request || {};
    let response = { behavior: 'deny', message: 'This request is not supported in ATLAS. Use Claude Code.' };
    if (request.subtype === 'can_use_tool') {
      if (
        trustedAtlasTools &&
        !job.signal?.aborted &&
        [
          'integrations_list',
          'integrations_add',
          'integrations_start',
          'integrations_call',
          'integrations_sequence',
          'integrations_stop',
        ].some((name) => request.tool_name === 'mcp__atlas_tools__' + name)
      ) {
        response = { behavior: 'allow', updatedInput: request.input || {} };
      } else if (request.tool_name === 'AskUserQuestion') {
        const answers = {};
        let denied = false;
        for (const question of request.input?.questions || []) {
          const choices = (question.options || []).map((option) => option.label).slice(0, 10);
          choices.push('Other answer');
          const result = await manager.ask({
            jobId: job.id,
            provider: 'claude',
            title: question.header || 'Claude question',
            details: question.question,
            permissionRequest: false,
            choices,
            textInput: true,
            signal: job.signal,
          });
          if (!result) {
            denied = true;
            break;
          }
          answers[question.question] = result.choice === 'Other answer' ? result.text : result.choice;
        }
        response = denied
          ? { behavior: 'deny', message: 'Question cancelled.' }
          : { behavior: 'allow', updatedInput: { ...request.input, answers } };
      } else {
        const choice = await manager.ask({
          jobId: job.id,
          provider: 'claude',
          title: 'Allow ' + String(request.tool_name || 'tool') + '?',
          details: JSON.stringify(request.input || {}, null, 2),
          signal: job.signal,
        });
        response = ['Allow', 'Allow once'].includes(choice)
          ? { behavior: 'allow', updatedInput: request.input || {} }
          : { behavior: 'deny', message: 'The user declined this action.' };
      }
    }
    write(
      JSON.stringify({
        type: 'control_response',
        response: { subtype: 'success', request_id: event.request_id, response },
      }) + '\n',
    );
  }
  return {
    push(part) {
      buffer += part;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines)
        if (line.trim()) {
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          void handle(event).catch(() => {
            write(
              JSON.stringify({
                type: 'control_response',
                response: { subtype: 'error', request_id: event.request_id, error: 'Permission request expired.' },
              }) + '\n',
            );
          });
        }
    },
  };
}
module.exports = { createClaudeControl };
