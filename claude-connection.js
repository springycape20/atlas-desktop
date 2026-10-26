const { spawn } = require('node:child_process'),
  { createInterface } = require('node:readline'),
  { randomUUID } = require('node:crypto'),
  path = require('node:path');
const runtime = require('./claude-runtime'),
  { createDecoder } = require('./assistant-core'),
  { createClaudeControl } = require('./claude-control');
class ClaudeConnection {
  constructor({
    executable,
    cwd,
    settings = {},
    sessionId = '',
    spawnProcess = spawn,
    launch = runtime.launch,
    handshakeMs = 30000,
    onClosed = () => {},
  }) {
    Object.assign(this, { executable, cwd, settings, spawnProcess, launch, handshakeMs, onClosed });
    this.sessionId = sessionId || randomUUID();
    this.resume = Boolean(sessionId);
    this.pending = new Map();
    this.closed = false;
    this.busy = false;
    this.used = false;
    this.stderr = '';
    this.usageBaseline = this.resume ? null : {};
    this.costBaseline = this.resume ? null : 0;
  }
  async connect() {
    if (this.closed) throw Error('Claude connection is closed. Retry to reconnect.');
    if (this.ready) return this.ready;
    const args = [
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
      this.resume ? '--resume' : '--session-id',
      this.sessionId,
    ];
    if (this.settings.claudeModel) args.push('--model', this.settings.claudeModel);
    // Fixed Colab instructions go in the system prompt once per worker instead of in every pass.
    if (this.settings.systemPrompt) args.push('--append-system-prompt', this.settings.systemPrompt);
    // The ATLAS gateway performs the action approval, avoiding a second prompt
    // for the wrapper itself. Other provider tools keep their normal rules.
    if (this.settings.atlasMcp)
      args.push(
        '--mcp-config',
        JSON.stringify({
          mcpServers: {
            atlas_tools: { type: 'http', url: this.settings.atlasMcp.url, headers: this.settings.atlasMcp.headers },
          },
        }),
        '--allowedTools',
        [
          'integrations_list',
          'integrations_add',
          'integrations_start',
          'integrations_call',
          'integrations_sequence',
          'integrations_stop',
        ]
          .map((name) => 'mcp__atlas_tools__' + name)
          .join(','),
      );
    if (this.settings.readOnly) args.push('--tools', 'Read,Glob,Grep,WebSearch,WebFetch', '--permission-mode', 'plan');
    else if (this.settings.permissionBypass) args.push('--dangerously-skip-permissions');
    const env = this.settings.effort ? { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: this.settings.effort } : process.env,
      spec = this.launch(this.executable, args, env);
    const child = (this.child = this.spawnProcess(spec.executable, spec.args, {
      cwd: this.cwd,
      env: spec.env,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
    child.stdin.on('error', (error) => this.fail(error));
    child.stderr.on('data', (data) => {
      this.stderr = (this.stderr + data.toString()).slice(-12000);
    });
    this.reader = createInterface({ input: child.stdout });
    this.reader.on('line', (line) => {
      if (this.closed || !line.trim()) return;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        this.stderr = (this.stderr + '\n' + line).slice(-12000);
        return;
      }
      try {
        this.receive(row, line);
      } catch (error) {
        this.fail(error);
      }
    });
    child.once('error', (error) => this.fail(Error('Could not start Claude: ' + error.message)));
    child.once('close', () =>
      this.fail(Error(this.stderr.trim() || 'Claude disconnected. Retry to reconnect; the task was not replayed.')),
    );
    this.ready = this.request({ subtype: 'initialize', hooks: {} }).then((info) => {
      this.info = info;
      return info;
    });
    try {
      return await this.ready;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }
  write(value) {
    if (this.closed || !this.child || this.child.stdin.destroyed)
      throw Error('Claude disconnected. Retry to reconnect.');
    this.child.stdin.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n');
  }
  request(request) {
    return new Promise((resolve, reject) => {
      const id = randomUUID(),
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Error('Claude initialization/control request timed out.'));
        }, this.handshakeMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ type: 'control_request', request_id: id, request });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  receive(event, line) {
    if (event.type === 'control_response') {
      const response = event.response || {},
        pending = this.pending.get(response.request_id);
      if (pending) {
        this.pending.delete(response.request_id);
        clearTimeout(pending.timer);
        response.subtype === 'success'
          ? pending.resolve(response.response || {})
          : pending.reject(Error(response.error || 'Claude rejected a control request.'));
      }
      return;
    }
    if (this.resetting) {
      if (event.type === 'system' && event.subtype === 'init' && event.session_id)
        this.resetting.nextSessionId = event.session_id;
      if (event.type === 'conversation_reset') {
        this.resetting.seenReset = true;
        if (this.resetting.seenResult) this.resetting.resolve();
        return;
      }
      if (event.type === 'result') {
        if (event.is_error || (event.subtype && event.subtype !== 'success'))
          this.resetting.reject(
            Object.assign(Error('Claude could not clear the previous context.'), { code: 'CLAUDE_RESET_UNSUPPORTED' }),
          );
        else {
          if (event.session_id) this.resetting.nextSessionId = event.session_id;
          this.resetting.seenResult = true;
          if (this.resetting.seenReset) this.resetting.resolve();
        }
        return;
      }
      if (event.type === 'control_request') this.deny(event);
      return;
    }
    const turn = this.turn;
    if (event.type === 'control_request') {
      if (turn) turn.control.push(line + '\n');
      else this.deny(event);
      return;
    }
    if (!turn || !turn.sent) {
      if (event.type === 'result' && event.is_error)
        this.fail(Error(event.result || event.errors?.join(' ') || 'Claude startup failed.'));
      return;
    }
    if (
      event.user_message_uuid &&
      event.user_message_uuid !== turn.uuid &&
      !(event.user_message_uuids || []).includes(turn.uuid)
    )
      return;
    if (event.session_id && event.session_id !== this.sessionId) {
      this.fail(Error('Claude returned an unexpected session. Start a new chat.'));
      return;
    }
    turn.decode.push(line + '\n');
    if (event.type === 'result') {
      if (event.is_error || (event.subtype && event.subtype !== 'success')) {
        turn.finish(Error(event.result || event.errors?.join(' ') || 'Claude request failed.'));
        this.close();
        return;
      }
      turn.finish(null, {
        output: event.result || '',
        sessionId: event.session_id || this.sessionId,
        usage: this.consumeUsage(event),
      });
    }
  }
  consumeUsage(event) {
    const finite = (value) => Number.isFinite(value) && value >= 0,
      main = event.usage || {},
      totals = event.modelUsage,
      previous = this.usageBaseline,
      validTotals = Boolean(
        totals &&
        Object.keys(totals).length &&
        Object.values(totals).every((row) =>
          ['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'outputTokens'].every((key) =>
            finite(row[key]),
          ),
        ),
      );
    let input = 0,
      output = 0,
      complete = Boolean(validTotals && previous);
    if (complete)
      for (const [model, current] of Object.entries(totals)) {
        const old = previous[model] || {};
        for (const key of ['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'outputTokens']) {
          const value = current[key],
            baseline = old[key] || 0;
          if (!finite(value) || value < baseline) {
            complete = false;
            break;
          }
          if (key === 'outputTokens') output += value - baseline;
          else input += value - baseline;
        }
      }
    this.usageBaseline = validTotals ? structuredClone(totals) : null;
    const usage = complete
      ? {
          inputTokens: input,
          outputTokens: output,
          complete: true,
          scope: 'CLI model usage delta for this turn (including reported subagents)',
        }
      : {
          ...(finite(main.input_tokens)
            ? {
                inputTokens:
                  main.input_tokens +
                  (finite(main.cache_read_input_tokens) ? main.cache_read_input_tokens : 0) +
                  (finite(main.cache_creation_input_tokens) ? main.cache_creation_input_tokens : 0),
              }
            : {}),
          ...(finite(main.output_tokens) ? { outputTokens: main.output_tokens } : {}),
          complete: false,
          scope: 'Main-agent turn usage only; whole-session delta unavailable',
        };
    if (finite(event.total_cost_usd)) {
      if (this.costBaseline !== null && event.total_cost_usd >= this.costBaseline)
        usage.reportedCostUsd = event.total_cost_usd - this.costBaseline;
      this.costBaseline = event.total_cost_usd;
      usage.costEstimated = true;
    }
    return usage;
  }
  deny(event) {
    try {
      this.write({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: event.request_id,
          response: { behavior: 'deny', message: 'No active ATLAS task is waiting for this action.' },
        },
      });
    } catch {}
  }
  async reset() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            Object.assign(Error('Claude did not confirm a conversation reset.'), { code: 'CLAUDE_RESET_UNSUPPORTED' }),
          ),
        this.handshakeMs,
      );
      this.resetting = {
        resolve: () => {
          clearTimeout(timer);
          if (this.resetting.nextSessionId) this.sessionId = this.resetting.nextSessionId;
          this.usageBaseline = {};
          this.costBaseline = 0;
          this.resetting = null;
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          this.resetting = null;
          reject(error);
        },
      };
      try {
        this.write({
          type: 'user',
          uuid: randomUUID(),
          session_id: this.sessionId,
          parent_tool_use_id: null,
          message: { role: 'user', content: '/clear' },
        });
      } catch (error) {
        this.resetting.reject(error);
      }
    });
  }
  async run({
    prompt,
    sessionId = '',
    signal,
    onText = () => {},
    activity = () => {},
    onSession = () => {},
    manager,
    job = {},
    settings = this.settings,
  }) {
    if (this.turn) throw Error('This Claude session is already working.');
    if (signal?.aborted) throw Error('Job cancelled or paused.');
    return new Promise((resolve, reject) => {
      const controller = new AbortController(),
        turn = { sent: false, uuid: randomUUID() };
      this.turn = turn;
      const abort = () => {
        turn.finish(Error('Job cancelled or paused.'));
        this.close();
      };
      const timer =
        settings.timeoutSeconds > 0
          ? setTimeout(() => {
              turn.finish(Error('Claude response timed out.'));
              this.close();
            }, settings.timeoutSeconds * 1000)
          : null;
      turn.decode = createDecoder('claude', onText, activity, { reasoning: settings.showReasoning === true });
      turn.control = createClaudeControl({
        trustedAtlasTools: Boolean(this.settings.atlasMcp) && !this.settings.readOnly,
        manager: manager || { ask: async () => null },
        job: { id: job.id, signal: controller.signal },
        write: (text) => {
          if (this.turn === turn && !controller.signal.aborted) this.write(text);
        },
      });
      turn.finish = (error, result) => {
        if (this.turn !== turn) return;
        this.turn = null;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.abort();
        turn.decode.finish();
        error ? reject(error) : resolve(result);
      };
      signal?.addEventListener('abort', abort, { once: true });
      (async () => {
        try {
          await this.connect();
          if (this.turn !== turn) return;
          if (!sessionId && this.used) await this.reset();
          if (this.turn !== turn) return;
          onSession(this.sessionId);
          turn.sent = true;
          this.used = true;
          this.write({
            type: 'user',
            uuid: turn.uuid,
            session_id: this.sessionId,
            parent_tool_use_id: null,
            message: { role: 'user', content: prompt },
          });
        } catch (error) {
          turn.finish(error);
          this.close();
        }
      })();
    });
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.resetting?.reject(error);
    this.turn?.finish(error);
    this.reader?.close();
    if (process.platform === 'win32' && this.child?.pid) {
      const killer = spawn('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('error', () => this.child?.kill());
    } else this.child?.kill();
    this.onClosed(this);
  }
  close() {
    this.fail(Error('Claude connection closed. Retry to reconnect.'));
  }
}
class ClaudeConnectionPool {
  constructor(options = {}) {
    this.options = options;
    this.workers = new Set();
    this.sessions = new Set();
    this.noReset = new Set();
    this.closed = false;
  }
  async run(options) {
    if (this.closed) throw Error('ATLAS is closing.');
    const key = JSON.stringify([
        options.executable,
        path.resolve(options.cwd),
        options.owner || '',
        options.settings.claudeModel || '',
        options.settings.effort || '',
        Boolean(options.settings.readOnly),
        Boolean(options.settings.permissionBypass),
        options.settings.atlasMcp || null,
        // A worker's system prompt is fixed at launch, so workers with different ones are never shared.
        options.settings.systemPrompt
          ? require('node:crypto').createHash('sha256').update(options.settings.systemPrompt).digest('hex')
          : '',
      ]),
      session = options.sessionId;
    if (session && this.sessions.has(session)) throw Error('This Claude conversation is already working.');
    if (session) this.sessions.add(session);
    let worker;
    try {
      worker = [...this.workers].find(
        (item) => item.key === key && !item.busy && (!session || item.sessionId === session),
      );
      if (!worker && [...this.workers].some((item) => item.key === key && item.busy))
        throw Error('This Claude conversation is already working.');
      if (!worker) {
        if (session)
          for (const old of [...this.workers])
            if (old.sessionId === session) {
              if (old.busy) throw Error('This Claude conversation is already working.');
              old.close();
            }
        worker = new ClaudeConnection({ ...this.options, ...options, onClosed: (item) => this.workers.delete(item) });
        worker.key = key;
        this.workers.add(worker);
      }
      if (!session && worker.used && this.noReset.has(options.executable)) {
        worker.close();
        worker = new ClaudeConnection({ ...this.options, ...options, onClosed: (item) => this.workers.delete(item) });
        worker.key = key;
        this.workers.add(worker);
      }
      worker.busy = true;
      try {
        return await worker.run(options);
      } catch (error) {
        if (error.code !== 'CLAUDE_RESET_UNSUPPORTED' || session || this.closed || options.signal?.aborted) throw error;
        // Only setup failed: the next user prompt has not been sent. Never replay
        // submitted work; older clients get a fresh worker before submission.
        this.noReset.add(options.executable);
        worker = new ClaudeConnection({ ...this.options, ...options, onClosed: (item) => this.workers.delete(item) });
        worker.key = key;
        worker.busy = true;
        this.workers.add(worker);
        return await worker.run(options);
      }
    } finally {
      if (worker) worker.busy = false;
      if (session) this.sessions.delete(session);
    }
  }
  close() {
    this.closed = true;
    for (const worker of [...this.workers]) worker.close();
  }
}
module.exports = { ClaudeConnection, ClaudeConnectionPool };
