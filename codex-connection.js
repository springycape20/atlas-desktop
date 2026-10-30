const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

// One stdio connection per application; independent turns are keyed by thread.
class CodexConnection {
  constructor(executable, spawnProcess = spawn) {
    this.executable = executable;
    this.spawn = spawnProcess;
    this.pending = new Map();
    this.turns = new Map();
    this.counter = 0;
    this.internalSessions = new Set();
  }
  async connect() {
    if (this.ready) return this.ready;
    const child = this.spawn(this.executable, ['app-server'], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.on('data', () => {});
    child.stdin.on('error', (error) => this.failed(child, error));
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (this.child !== child) return;
      try {
        this.receive(JSON.parse(line));
      } catch (error) {
        this.failed(child, error);
      }
    });
    child.once('error', (error) => this.failed(child, error));
    child.once('exit', () =>
      this.failed(child, Error('Codex connection closed. Retry to reconnect; the task was not replayed.')),
    );
    this.ready = this.request('initialize', { clientInfo: { name: 'atlas', title: 'ATLAS', version: '0.3.0' } }).then(
      () => this.send({ method: 'initialized' }),
    );
    try {
      await this.ready;
    } catch (error) {
      this.failed(child, error);
      throw error;
    }
  }
  send(message) {
    if (!this.child) throw Error('Codex is disconnected.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('Codex ' + method + ' timed out.'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  failed(child, error) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = null;
    this.internalSessions.clear();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    for (const t of [...this.turns.values()]) t.finish(error);
    child.kill();
  }
  hasInternalSession(id) {
    return this.internalSessions.has(id);
  }
  close() {
    if (this.child) this.failed(this.child, Error('ATLAS closed.'));
  }
  receive(message) {
    if (message.method === 'thread/closed') this.internalSessions.delete(message.params?.threadId);
    if (message.method === 'account/rateLimits/updated') {
      this.onRateLimits?.(message.params);
      return;
    }
    if (message.id !== undefined && !message.method) {
      const p = this.pending.get(message.id);
      if (!p) return;
      this.pending.delete(message.id);
      clearTimeout(p.timer);
      message.error
        ? p.reject(Error(message.error.message || JSON.stringify(message.error)))
        : p.resolve(message.result);
      return;
    }
    const p = message.params || {},
      t = this.turns.get(p.threadId);
    if (message.id !== undefined) {
      if (t?.onApproval) {
        void Promise.resolve()
          .then(() => t.onApproval(message.method, { ...p, changes: p.changes || t.fileItems?.get(p.itemId)?.changes }))
          .then(
            (result) => {
              if (this.child) this.send({ id: message.id, result });
            },
            (error) => {
              if (this.child) this.send({ id: message.id, error: { code: -32603, message: error.message } });
            },
          );
        return;
      }
      // Requests without a live task are never approved implicitly.
      if (/requestApproval$/.test(message.method)) this.send({ id: message.id, result: { decision: 'decline' } });
      else
        this.send({
          id: message.id,
          error: { code: -32601, message: 'ATLAS cannot handle this interactive request. Use the provider app.' },
        });
      t?.activity({ kind: 'attention', text: 'An interactive request requires the provider app.' });
      return;
    }
    if (!t) return;
    if (message.method === 'item/started' && p.item?.type === 'fileChange') {
      t.fileItems ||= new Map();
      t.fileItems.set(p.item.id, p.item);
    }
    if (message.method === 'item/completed' && p.item?.type === 'fileChange') t.fileItems?.delete(p.item.id);
    if (message.method === 'thread/tokenUsage/updated') {
      const usage = !t.resumed ? p.tokenUsage?.total || p.tokenUsage?.last : p.tokenUsage?.last;
      if (usage)
        t.usage = {
          complete: !t.resumed && Boolean(p.tokenUsage?.total),
          scope: !t.resumed && p.tokenUsage?.total ? 'new thread total' : 'last model call; turn total unavailable',
          ...(Number.isFinite(usage.inputTokens) ? { inputTokens: usage.inputTokens } : {}),
          ...(Number.isFinite(usage.outputTokens) ? { outputTokens: usage.outputTokens } : {}),
        };
    }
    if (message.method === 'item/started' && p.item?.type === 'agentMessage' && p.item.phase === 'commentary')
      t.commentary.add(p.item.id);
    const turnId = p.turnId || p.turn?.id;
    if (t.turnId && turnId && t.turnId !== turnId) return;
    if (turnId && !t.turnId) t.turnId = turnId;
    if (t.cancelled && t.turnId && !t.interrupting) {
      t.interrupting = true;
      void this.request('turn/interrupt', { threadId: p.threadId, turnId: t.turnId }).catch((error) => t.finish(error));
    }
    if (message.method === 'item/agentMessage/delta') {
      if (t.commentary.has(p.itemId)) return;
      if (t.cancelled) return;
      if (t.lastItem && t.lastItem !== p.itemId) t.onText('\n\n');
      t.lastItem = p.itemId;
      t.messages.set(p.itemId, (t.messages.get(p.itemId) || '') + p.delta);
      t.onText(p.delta);
    }
    if (message.method === 'item/completed' && p.item?.type === 'agentMessage') {
      if (p.item.phase === 'commentary') {
        t.activity({ kind: 'progress', text: p.item.text || 'Working' });
        return;
      }
      const old = t.messages.get(p.item.id) || '';
      if (!t.cancelled && p.item.text?.startsWith(old) && p.item.text.length > old.length)
        t.onText((t.lastItem && t.lastItem !== p.item.id ? '\n\n' : '') + p.item.text.slice(old.length));
      t.lastItem = p.item.id;
      t.messages.set(p.item.id, p.item.text || old);
      if (p.item.phase === 'final_answer') t.final = p.item.text;
    }
    // Opt-in: pass on the reasoning summary Codex chose to expose, never the raw reasoning content.
    if (message.method === 'item/completed' && p.item?.type === 'reasoning' && t.showReasoning) {
      const summary = (Array.isArray(p.item.summary) ? p.item.summary : [])
        .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
        .filter((part) => part.trim())
        .join('\n\n');
      if (summary) t.activity({ id: p.threadId + ':' + p.item.id, kind: 'reasoning', text: summary.slice(0, 4000) });
    }
    if (
      ['item/started', 'item/completed'].includes(message.method) &&
      p.item &&
      !['agentMessage', 'reasoning'].includes(p.item.type)
    ) {
      const item = p.item,
        completed = message.method === 'item/completed';
      const text =
        item.type === 'commandExecution'
          ? item.command
          : item.type === 'fileChange'
            ? (item.changes || [])
                .map((change) => (change.kind?.type || change.kind || 'Changed') + ': ' + change.path)
                .join('\n')
            : item.type === 'mcpToolCall'
              ? 'Tool: ' + [item.server, item.tool].filter(Boolean).join(' / ')
              : item.type === 'webSearch'
                ? 'Search: ' + (item.query || item.action?.query || 'Web search')
                : item.type;
      t.activity({
        id: p.threadId + ':' + item.id,
        kind: item.type === 'commandExecution' ? 'command' : item.type === 'fileChange' ? 'files' : 'activity',
        tool: item.type,
        text: String(text || item.type).slice(0, 1200),
        status: completed
          ? item.status === 'failed' || (Number.isInteger(item.exitCode) && item.exitCode !== 0)
            ? 'failed'
            : 'completed'
          : 'running',
        ...(Number.isInteger(item.exitCode) ? { exitCode: item.exitCode } : {}),
      });
    }
    if (message.method === 'turn/plan/updated')
      t.activity({
        kind: 'plan',
        text: (p.plan || [])
          .map((step) => (step.status === 'completed' ? 'Done: ' : 'Next: ') + step.step)
          .join('\n')
          .slice(0, 1200),
      });
    if (message.method === 'turn/completed') {
      const turn = p.turn;
      if (t.cancelled || turn.status === 'interrupted') t.finish(Error('Job cancelled or paused.'));
      else if (turn.status === 'failed')
        t.finish(
          Error([turn.error?.message, JSON.stringify(turn.error?.codexErrorInfo || '')].filter(Boolean).join(' ')),
        );
      else
        t.finish(null, {
          output: t.final || [...t.messages.values()].join('\n\n'),
          sessionId: p.threadId,
          usage: t.usage || null,
        });
    }
  }
  async run({
    prompt,
    cwd,
    settings,
    sessionId,
    preparePrompt,
    internal = false,
    onText = () => {},
    onSession = () => {},
    activity = () => {},
    onApproval,
    signal,
  }) {
    await this.connect();
    if (signal?.aborted) throw Error('Job cancelled.');
    if (sessionId && this.turns.has(sessionId)) throw Error('This Codex conversation is already running.');
    const approvalPolicy = settings.permissionBypass ? 'never' : 'on-request';
    const params = {
      cwd,
      approvalPolicy,
      sandbox: settings.permissionBypass ? 'danger-full-access' : settings.codexSandbox,
    };
    if (settings.atlasMcp)
      params.config = {
        'mcp_servers.atlas_tools': {
          url: settings.atlasMcp.url,
          http_headers: settings.atlasMcp.headers,
          enabled: true,
          required: true,
          tool_timeout_sec: 600,
        },
      };
    if (settings.codexModel) params.model = settings.codexModel;
    // Fixed Colab instructions are set once per thread as developer instructions, not in every turn.
    if (settings.systemPrompt) params.developerInstructions = settings.systemPrompt;
    // Internal Colab passes stay in this app-server's memory. Never resume old
    // persisted helper threads or fall back to saving a private pass to Recents.
    if (internal && sessionId && !this.internalSessions.has(sessionId)) sessionId = '';
    const result =
      internal && sessionId
        ? { thread: { id: sessionId, ephemeral: true } }
        : await this.request(
            sessionId ? 'thread/resume' : 'thread/start',
            sessionId ? { ...params, threadId: sessionId } : { ...params, ...(internal ? { ephemeral: true } : {}) },
          );
    if (internal) {
      if (result.thread?.ephemeral !== true)
        throw Error(
          'This Codex version did not confirm a temporary Colab session. Update Codex; the task was not submitted.',
        );
      this.internalSessions.add(result.thread.id);
    }
    const threadId = result.thread.id;
    if (preparePrompt)
      prompt = preparePrompt({ sessionId: threadId, resumed: Boolean(sessionId) && threadId === sessionId });
    onSession(threadId);
    if (signal?.aborted) throw Error('Job cancelled.');
    if (this.turns.has(threadId)) throw Error('This Codex conversation is already running.');
    return new Promise((resolve, reject) => {
      const t = {
        resumed: Boolean(sessionId),
        onText,
        activity,
        onApproval,
        messages: new Map(),
        commentary: new Set(),
        showReasoning: settings.showReasoning === true,
        turnId: null,
        cancelled: false,
      };
      const abort = () => {
        t.cancelled = true;
        if (t.turnId && !t.interrupting) {
          t.interrupting = true;
          void this.request('turn/interrupt', { threadId, turnId: t.turnId }).catch((error) => t.finish(error));
        }
      };
      const timer =
        settings.timeoutSeconds > 0
          ? setTimeout(() => {
              abort();
              t.finish(Error('Codex response timed out. The turn was interrupted.'));
            }, settings.timeoutSeconds * 1000)
          : null;
      t.finish = (error, value) => {
        if (this.turns.get(threadId) !== t) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        this.turns.delete(threadId);
        error ? reject(error) : resolve(value);
      };
      this.turns.set(threadId, t);
      signal?.addEventListener('abort', abort, { once: true });
      this.request('turn/start', {
        threadId,
        cwd,
        approvalPolicy,
        sandboxPolicy: settings.permissionBypass
          ? { type: 'dangerFullAccess' }
          : settings.codexSandbox === 'read-only'
            ? { type: 'readOnly' }
            : { type: 'workspaceWrite', writableRoots: [cwd] },
        ...(settings.codexModel ? { model: settings.codexModel } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        // Codex only produces reasoning summaries when asked; with the setting off nothing changes.
        // Live checks found "auto" returns empty summaries and "concise" only a heading, so ask for "detailed".
        ...(settings.showReasoning === true ? { summary: 'detailed' } : {}),
        input: [{ type: 'text', text: prompt }],
      }).then(
        (result) => {
          t.turnId = result.turn.id;
          if (t.cancelled) abort();
        },
        (error) => t.finish(error),
      );
    });
  }
}
module.exports = { CodexConnection };
