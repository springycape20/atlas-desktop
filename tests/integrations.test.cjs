const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createIntegrationService, validateIntegration } = require('../integration-service');
const { createApprovalManager } = require('../approval-manager');
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-tools-')),
    approvals = createApprovalManager();
  const events = [],
    service = createIntegrationService({
      directory,
      approvals,
      activity: (job, event) => events.push({ job: job.id, ...event }),
      ...options,
    });
  const controller = new AbortController(),
    job = { id: 'task-one', signal: controller.signal };
  const binding = await service.bind({ provider: 'codex', owner: 'colab:one', job, signal: controller.signal });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(binding.config.url), {
      requestInit: { headers: binding.config.headers },
    }),
  );
  t.after(async () => {
    controller.abort();
    binding.release();
    await client.close();
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const call = (name, args) => client.callTool({ name, arguments: args });
  const waitApproval = async () => {
    for (let i = 0; i < 100 && !approvals.list().length; i++) await tick();
    assert(approvals.list().length, 'approval expected');
    return approvals.list()[0];
  };
  return { directory, approvals, events, service, controller, job, binding, client, call, waitApproval };
}
const saved = {
  id: 'sample',
  name: 'Example tools',
  command: process.execPath,
  args: [path.join(__dirname, 'fixtures', 'integration-server.cjs')],
  enabled: true,
};
test('cancelling a remembered controller during startup aborts initialization promptly', async (t) => {
  let attempts = 0,
    aborted = false;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async (_spec, { signal }) => {
      if (++attempts === 2)
        return new Promise((resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(Error('Startup stopped'));
            },
            { once: true },
          ),
        );
      return {
        tools: [{ name: 'Screenshot', inputSchema: { type: 'object' } }],
        call: async () => ({ content: [] }),
        close: async () => {},
      };
    },
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const request = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow');
  for (let i = 0; i < 100 && attempts < 2; i++) await tick();
  assert.equal(attempts, 2);
  f.controller.abort();
  await request.catch(() => {});
  for (let i = 0; i < 100 && !aborted; i++) await tick();
  assert(aborted);
});
test('revoking a chat grant interrupts its running desktop action and requires approval again', async (t) => {
  let running = false;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => ({
      tools: ['Screenshot', 'Click'].map((name) => ({ name, inputSchema: { type: 'object' } })),
      call: async (name, _args, signal) => {
        if (name === 'Click') {
          running = true;
          return new Promise((resolve, reject) =>
            signal.addEventListener('abort', () => reject(Error('Revoked')), { once: true }),
          );
        }
        return { content: [] };
      },
      close: async () => {},
    }),
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const first = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow');
  await first;
  const click = f.call('integrations_call', { id: 'windows', tool: 'Click' });
  for (let i = 0; i < 100 && !running; i++) await tick();
  assert(running);
  await f.service.revokeDesktop('colab:one');
  assert((await click).isError);
  assert.equal((await f.service.desktopPermissions()).length, 0);
  const next = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await next).isError);
});
test('one chat grant shares a live controller across screen actions and providers but not other chats or shell tools', async (t) => {
  let connections = 0,
    closed = 0;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => {
      connections++;
      return {
        tools: ['Screenshot', 'Click', 'App', 'PowerShell'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        call: async () => ({ content: [{ type: 'text', text: 'done' }] }),
        close: async () => {
          closed++;
        },
      };
    },
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const first = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow');
  assert(!(await first).isError);
  assert.equal(connections, 2);
  assert.equal(closed, 0);
  assert(!(await f.call('integrations_call', { id: 'windows', tool: 'Click', arguments: { loc: [5, 5] } })).isError);
  assert.equal(f.approvals.list().length, 0);
  assert.equal(connections, 2);
  f.job.cwd = path.join(f.directory, 'project');
  const bin = path.join(f.job.cwd, '.venv', 'Scripts');
  await fs.mkdir(bin, { recursive: true });
  const exe = path.join(bin, 'pythonw.exe'),
    script = path.join(f.job.cwd, 'pong.py');
  await fs.writeFile(exe, '');
  await fs.writeFile(script, '');
  assert(
    !(
      await f.call('integrations_call', {
        id: 'windows',
        tool: 'App',
        arguments: { mode: 'launch_executable', executable: exe, args: [script] },
      })
    ).isError,
  );
  assert.equal(f.approvals.list().length, 0);
  assert.equal(connections, 2);
  const unsafeLaunch = f.call('integrations_call', {
    id: 'windows',
    tool: 'App',
    arguments: { mode: 'launch_executable', executable: exe, args: ['-c', 'dangerous()'] },
  });
  const unsafeRequest = await f.waitApproval();
  assert.equal(unsafeRequest.desktopOwner, undefined);
  assert.deepEqual(unsafeRequest.choices, ['Allow', 'Allow once', 'Deny']);
  f.approvals.answer(unsafeRequest.id, 'Deny');
  assert((await unsafeLaunch).isError);

  const controller = new AbortController(),
    binding = await f.service.bind({
      provider: 'claude',
      owner: 'colab:one',
      job: { id: 'peer' },
      signal: controller.signal,
    }),
    peer = new Client({ name: 'peer', version: '1' });
  await peer.connect(
    new StreamableHTTPClientTransport(new URL(binding.config.url), {
      requestInit: { headers: binding.config.headers },
    }),
  );
  assert(
    !(
      await peer.callTool({
        name: 'integrations_call',
        arguments: { id: 'windows', tool: 'App', arguments: { mode: 'switch', name: 'Game' } },
      })
    ).isError,
  );
  assert.equal(connections, 2);
  binding.release();
  await peer.close();
  const shell = f.call('integrations_call', { id: 'windows', tool: 'PowerShell' });
  const request = await f.waitApproval();
  assert.equal(request.desktopOwner, undefined);
  assert.deepEqual(request.choices, ['Allow', 'Allow once', 'Deny']);
  f.approvals.answer(request.id, 'Deny');
  assert((await shell).isError);
  const other = await f.service.bind({
      provider: 'claude',
      owner: 'colab:two',
      job: { id: 'other' },
      signal: controller.signal,
    }),
    otherClient = new Client({ name: 'other', version: '1' });
  await otherClient.connect(
    new StreamableHTTPClientTransport(new URL(other.config.url), { requestInit: { headers: other.config.headers } }),
  );
  const action = otherClient.callTool({ name: 'integrations_call', arguments: { id: 'windows', tool: 'Screenshot' } });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await action).isError);
  other.release();
  await otherClient.close();
  await f.service.revokeDesktop('colab:one');
  assert.equal(closed, 1);
  const after = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await after).isError);
});
test('restarting the integration service remembers only granted chat owners and disabling clears permission', async (t) => {
  const connect = async () => ({
      tools: [{ name: 'Screenshot', inputSchema: { type: 'object' } }],
      call: async () => ({ content: [{ type: 'text', text: 'screen' }] }),
      close: async () => {},
    }),
    f = await fixture(t, { platform: 'win32', connect });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const action = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow');
  await action;
  await f.service.close();
  const restored = createIntegrationService({
    directory: f.directory,
    platform: 'win32',
    approvals: {
      ask: async () => {
        throw Error('Unexpected repeated approval');
      },
    },
    connect,
  });
  try {
    assert.equal((await restored.desktopPermissions())[0].owner, 'colab:one');
    const controller = new AbortController(),
      binding = await restored.bind({
        provider: 'codex',
        owner: 'colab:one',
        job: { id: 'resumed' },
        signal: controller.signal,
      }),
      client = new Client({ name: 'resumed', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(binding.config.url), {
        requestInit: { headers: binding.config.headers },
      }),
    );
    assert(
      !(await client.callTool({ name: 'integrations_call', arguments: { id: 'windows', tool: 'Screenshot' } })).isError,
    );
    binding.release();
    await client.close();
    await restored.enable('windows', false);
    assert.equal((await restored.desktopPermissions()).length, 0);
  } finally {
    await restored.close();
  }
});
test('Windows active-user takeover is explicitly approved, scoped to one action, and closes its temporary server', async (t) => {
  const connections = [],
    calls = [];
  const f = await fixture(t, {
    platform: 'win32',
    connect: async (spec, { signal }) => {
      const forced = spec.args.includes('--no-control'),
        entry = { spec, forced, closed: false };
      connections.push(entry);
      return {
        tools: [{ name: 'Screenshot', inputSchema: { type: 'object' } }],
        call: async (name, args) => {
          calls.push({ forced, name, args });
          return { isError: !forced, content: [{ type: 'text', text: forced ? 'screen' : 'User is active' }] };
        },
        close: async (options) => {
          entry.closed = true;
          entry.closeOptions = options;
        },
      };
    },
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const request = f.call('integrations_call', { id: 'windows', tool: 'Screenshot', arguments: { display: [0] } }),
    approval = await f.waitApproval();
  assert(approval.choices.includes('Allow once'));
  assert.equal(connections.length, 1);
  assert.equal(calls.length, 0);
  f.approvals.answer(approval.id, 'Allow once');
  assert.equal((await request).isError, false);
  assert.equal(connections.length, 2);
  assert(connections[1].closed);
  assert.equal(connections[1].closeOptions.preserveChildren, true);
  assert(!connections[0].closed);
  assert(!connections[0].spec.args.includes('--no-control'));
  assert.equal(connections[1].spec.args.at(-1), '--no-control');
  assert.equal(connections[1].spec.env.UV_OFFLINE, '1');
  assert(connections[0].spec.args.includes(require('../windows-tool-runtime').SOURCE));
  assert(connections[1].spec.args.includes(require('../windows-tool-runtime').SOURCE));
  assert.deepEqual((await f.service.list()).integrations[0].args, require('../integration-service').windowsPreset.args);
  assert.deepEqual(calls[0], { forced: true, name: 'Screenshot', args: { display: [0] } });
  const normal = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow once');
  assert.equal((await normal).isError, false);
  assert.equal(connections.length, 3);
  assert.equal(calls.at(-1).forced, true);
  assert(connections[2].closed);
  assert.equal((await f.service.desktopPermissions()).length, 0);
  const denied = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert.equal((await denied).isError, true);
  assert.equal(connections.length, 3);
  assert.equal(calls.length, 2);
});
test('cancelling an approved Windows takeover aborts its action and closes the temporary server', async (t) => {
  let temporaryClosed = false,
    started;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async (spec) => ({
      tools: [{ name: 'Click', inputSchema: { type: 'object' } }],
      call: async (_name, _args, signal) => {
        started = true;
        return new Promise((resolve, reject) =>
          signal.addEventListener('abort', () => reject(Error('stopped')), { once: true }),
        );
      },
      close: async () => {
        if (spec.args.includes('--no-control')) temporaryClosed = true;
      },
    }),
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const result = f.call('integrations_call', { id: 'windows', tool: 'Click' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow once');
  for (let i = 0; i < 100 && !started; i++) await tick();
  assert(started);
  f.controller.abort();
  await result.catch(() => {});
  for (let i = 0; i < 100 && !temporaryClosed; i++) await tick();
  assert(temporaryClosed);
});
test('real stdio MCP server is discoverable through the HTTP bridge; actions need approval and preserve images', async (t) => {
  const f = await fixture(t);
  await f.service.save(saved);
  assert.deepEqual(
    (await f.client.listTools()).tools.map((tool) => tool.name),
    [
      'integrations_list',
      'integrations_add',
      'integrations_start',
      'integrations_call',
      'integrations_sequence',
      'integrations_stop',
    ],
  );
  const started = await f.call('integrations_start', { id: 'sample' });
  assert.equal(JSON.parse(started.content[0].text).tools[0].name, 'echo');
  const denied = f.call('integrations_call', { id: 'sample', tool: 'echo', arguments: { message: 'secret' } }),
    approval = await f.waitApproval();
  assert.equal(approval.jobId, 'task-one');
  assert.equal(f.events.length, 0);
  f.approvals.answer(approval.id, 'Deny');
  assert.equal((await denied).isError, true);
  assert.equal(f.events.length, 0);
  const allowed = f.call('integrations_call', { id: 'sample', tool: 'echo', arguments: { message: 'approved' } });
  f.approvals.answer((await f.waitApproval()).id, 'Allow once');
  const result = await allowed;
  assert.equal(result.content[0].text, 'approved');
  assert.equal(result.content[1].type, 'image');
  assert.deepEqual(
    f.events.map((row) => row.status),
    ['running', 'completed'],
  );
});
test('disabled tools and read-only reviewers cannot execute integrations', async (t) => {
  let connects = 0;
  const f = await fixture(t, {
    connect: async () => {
      connects++;
      throw Error('should not connect');
    },
  });
  await f.service.save({ ...saved, enabled: false });
  assert.equal((await f.call('integrations_start', { id: 'sample' })).isError, true);
  assert.equal(connects, 0);
  f.binding.release();
  const binding = await f.service.bind({
    provider: 'codex',
    owner: 'colab:one',
    job: f.job,
    readOnly: true,
    signal: f.controller.signal,
  });
  t.after(() => binding.release());
  assert.equal((await f.call('integrations_start', { id: 'sample' })).isError, true);
  assert.equal(connects, 0);
  assert.equal(f.approvals.list().length, 0);
});
test('cancelling a task dismisses its pending tool approval and prevents replay', async (t) => {
  const f = await fixture(t);
  await f.service.save(saved);
  await f.call('integrations_start', { id: 'sample' });
  const result = f.call('integrations_call', { id: 'sample', tool: 'echo', arguments: { message: 'must not run' } });
  await f.waitApproval();
  f.controller.abort();
  assert.equal((await result).isError, true);
  assert.equal(f.approvals.list().length, 0);
  assert.equal(f.events.length, 0);
});
test('disabling an integration while approval is pending blocks the already requested action', async (t) => {
  const f = await fixture(t);
  await f.service.save(saved);
  await f.call('integrations_start', { id: 'sample' });
  const result = f.call('integrations_call', { id: 'sample', tool: 'echo', arguments: { message: 'must not run' } }),
    approval = await f.waitApproval();
  await f.service.enable('sample', false);
  f.approvals.answer(approval.id, 'Allow once');
  assert.equal((await result).isError, true);
  assert.equal(f.events.length, 0);
});
test('bridge rejects unauthenticated requests, browser origins and expired tasks', async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(f.binding.config.url, { method: 'POST', body: '{}' })).status, 403);
  assert.equal(
    (
      await fetch(f.binding.config.url, {
        method: 'POST',
        headers: { ...f.binding.config.headers, Origin: 'https://example.com' },
        body: '{}',
      })
    ).status,
    403,
  );
  f.binding.release();
  assert.equal((await f.call('integrations_list', {})).isError, true);
});
test('same provider chat keeps a stable bridge config; concurrent bindings are rejected', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.bind({ provider: 'codex', owner: 'colab:one', job: f.job }), /already working/);
  f.binding.release();
  const second = await f.service.bind({ provider: 'codex', owner: 'colab:one', job: { id: 'next' } }),
    claude = await f.service.bind({ provider: 'claude', owner: 'colab:one', job: { id: 'claude' } });
  t.after(() => {
    second.release();
    claude.release();
  });
  assert.deepEqual(second.config, f.binding.config);
  assert.notDeepEqual(claude.config.headers, second.config.headers);
  assert.equal((await f.call('integrations_list', {})).isError, undefined);
});
test('integration config survives restart without starting a process', async (t) => {
  const f = await fixture(t);
  await f.service.save(saved);
  let connected = false;
  const other = createIntegrationService({
    directory: f.directory,
    approvals: f.approvals,
    connect: async () => {
      connected = true;
    },
  });
  t.after(() => other.close());
  const result = await other.list();
  assert.equal(result.integrations[0].name, 'Example tools');
  assert.equal(result.integrations[0].status, 'Stopped');
  assert.equal(connected, false);
});
test('desktop integration requests require approval before adding or installing anything', async (t) => {
  let installed = 0;
  const f = await fixture(t, {
    platform: 'win32',
    install: async () => {
      installed++;
    },
  });
  const added = f.call('integrations_start', { id: 'windows' });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert.equal((await added).isError, true);
  assert.equal(installed, 0);
  assert.equal((await f.service.list()).integrations.length, 0);
});
test('integration definitions reject invalid commands and unsupported transports', () => {
  assert.throws(() => validateIntegration({ id: '../bad', command: 'x' }), /ID/);
  assert.throws(() => validateIntegration({ id: 'okay', command: 'x\ncalc' }), /executable/);
  assert.throws(() => validateIntegration({ id: 'okay', command: 'x', args: '--foo' }), /array/);
  assert.throws(() => validateIntegration({ id: 'okay', url: 'file:///private' }), /HTTP/);
  assert.throws(() => validateIntegration({ id: 'okay', url: 'https://user:pass@example.com/mcp' }), /credentials/);
});
test('two approved providers cannot drive the desktop concurrently', async (t) => {
  let finish,
    called = 0;
  const f = await fixture(t, {
    connect: async () => ({
      tools: [{ name: 'hold', inputSchema: { type: 'object' } }],
      call: async () => {
        called++;
        await new Promise((resolve) => {
          finish = resolve;
        });
        return { content: [{ type: 'text', text: 'done' }] };
      },
      close: async () => {},
    }),
  });
  await f.service.save(saved);
  await f.call('integrations_start', { id: 'sample' });
  const first = f.call('integrations_call', { id: 'sample', tool: 'hold' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow once');
  while (!finish) await tick();
  const second = f.call('integrations_call', { id: 'sample', tool: 'hold' });
  f.approvals.answer((await f.waitApproval()).id, 'Allow once');
  assert.equal((await second).isError, true);
  assert.equal(called, 1);
  finish();
  assert.equal((await first).isError, undefined);
});
test('stopped tasks lose access even with provider permission bypass enabled', async (t) => {
  const f = await fixture(t);
  f.job.stopped = 'cancelled';
  assert.equal((await f.call('integrations_start', { id: 'windows' })).isError, true);
  assert.equal(f.approvals.list().length, 0);
});
test('Colab can add a custom integration only after approval, without running it prematurely', async (t) => {
  const f = await fixture(t);
  const denied = f.call('integrations_add', saved);
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert.equal((await denied).isError, true);
  assert.equal((await f.service.list()).integrations.length, 0);
  const allowed = f.call('integrations_add', saved);
  const approval = await f.waitApproval();
  assert(approval.details.includes(JSON.stringify(saved.command)));
  f.approvals.answer(approval.id, 'Allow once');
  assert.equal((await allowed).isError, undefined);
  assert.equal((await f.service.list()).integrations[0].status, 'Stopped');
  assert.equal(f.events.length, 0);
});

test('explicit chat control switch grants permission and resolves only that chat routine approval', async (t) => {
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => ({
      tools: [{ name: 'Screenshot', inputSchema: { type: 'object' } }],
      call: async () => ({ content: [] }),
      close: async () => {},
    }),
  });
  await assert.rejects(f.service.grantDesktop('invalid'));
  await assert.rejects(f.service.grantDesktop('colab:one'), /Enable/);
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const first = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  const request = await f.waitApproval();
  assert.equal(request.desktopOwner, 'colab:one');
  await f.service.grantDesktop('colab:other');
  assert.equal(f.approvals.list().length, 1);
  await f.service.grantDesktop('colab:one');
  assert(!(await first).isError);
  assert.equal(f.approvals.list().length, 0);
  assert(!(await f.call('integrations_call', { id: 'windows', tool: 'Screenshot' })).isError);
  await f.service.revokeDesktop('colab:one');
  assert(!(await f.service.desktopPermissions()).some((row) => row.owner === 'colab:one'));
});

test('one desktop grant covers file reads, writes and app launches while denied files stay manual', async (t) => {
  const calls = [],
    f = await fixture(t, {
      platform: 'win32',
      connect: async () => ({
        tools: ['Screenshot', 'FileSystem', 'App'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        call: async (name, args) => {
          calls.push({ name, args });
          return { content: [] };
        },
        close: async () => {},
      }),
    });
  f.job.cwd = f.directory;
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  const file = path.join(f.directory, 'pong.py');
  await fs.writeFile(file, '');
  for (const args of [
    { mode: 'read', path: file },
    { mode: 'write', path: file, content: 'test' },
    { mode: 'info', path: file },
  ])
    assert(!(await f.call('integrations_call', { id: 'windows', tool: 'FileSystem', arguments: args })).isError);
  assert(
    !(await f.call('integrations_call', { id: 'windows', tool: 'App', arguments: { mode: 'launch', name: 'Notepad' } }))
      .isError,
  );
  assert.equal(f.approvals.list().length, 0);
  await f.service.revokeDesktop('colab:one');
  const denied = f.call('integrations_call', {
    id: 'windows',
    tool: 'FileSystem',
    arguments: { mode: 'read', path: file },
  });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await denied).isError);
  await f.service.grantDesktop('colab:one');
  const again = f.call('integrations_call', {
      id: 'windows',
      tool: 'FileSystem',
      arguments: { mode: 'read', path: file },
    }),
    request = await f.waitApproval();
  assert(request.details.includes('previously denied'));
  assert.equal(request.desktopOwner, undefined);
  assert.deepEqual(request.choices, ['Allow', 'Allow once', 'Deny']);
  f.approvals.answer(request.id, 'Deny');
  assert((await again).isError);
  assert.equal(calls.length, 4);
});

test('desktop sequence uses one retained controller, one approval and a final capture', async (t) => {
  let connections = 0,
    closed = 0;
  const actions = [],
    f = await fixture(t, {
      platform: 'win32',
      connect: async () => {
        connections++;
        return {
          tools: ['Move', 'Click', 'Type', 'Screenshot'].map((name) => ({ name, inputSchema: { type: 'object' } })),
          call: async (name, args) => {
            actions.push(name);
            return { content: [{ type: 'text', text: name + ' complete' }] };
          },
          close: async () => {
            closed++;
          },
        };
      },
    });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const sequence = f.call('integrations_sequence', {
    steps: [
      { tool: 'Move', arguments: { loc: [10, 20] } },
      { tool: 'Click', arguments: { loc: [10, 20] } },
      { tool: 'Type', arguments: { text: 'hello' } },
    ],
  });
  f.approvals.answer((await f.waitApproval()).id, 'Allow');
  assert(!(await sequence).isError);
  assert.deepEqual(actions, ['Move', 'Click', 'Type', 'Screenshot']);
  assert.equal(connections, 2);
  assert.equal(closed, 0);
  assert.equal(f.approvals.list().length, 0);
  assert(
    !(
      await f.call('integrations_sequence', {
        steps: [{ tool: 'Click', arguments: { loc: [20, 20] } }],
        screenshotAfter: false,
      })
    ).isError,
  );
  assert.equal(connections, 2);
  assert.equal(closed, 0);
  const invalid = await f.call('integrations_sequence', {
    steps: [{ tool: 'PowerShell', arguments: { command: 'x' } }],
  });
  assert(invalid.isError);
  assert.equal(actions.length, 5);
});
test('ordinary desktop tool exceptions keep the healthy controller connected', async (t) => {
  let connections = 0,
    closed = 0;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => {
      connections++;
      return {
        tools: ['Click', 'Screenshot'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        isOpen: () => true,
        call: async (name) => {
          if (name === 'Click') throw Error('Element no longer exists');
          return { content: [] };
        },
        close: async () => {
          closed++;
        },
      };
    },
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  assert((await f.call('integrations_call', { id: 'windows', tool: 'Click' })).isError);
  assert.equal(closed, 0);
  assert(!(await f.call('integrations_call', { id: 'windows', tool: 'Screenshot' })).isError);
  assert.equal(connections, 2);
});
test('a failed desktop sequence stops before later inputs and does not replay actions', async (t) => {
  const actions = [],
    f = await fixture(t, {
      platform: 'win32',
      connect: async () => ({
        tools: ['Click', 'Type', 'Screenshot'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        call: async (name) => {
          actions.push(name);
          return { isError: name === 'Click', content: [{ type: 'text', text: 'test result' }] };
        },
        close: async () => {},
      }),
    });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  assert(
    (
      await f.call('integrations_sequence', {
        steps: [
          { tool: 'Click', arguments: {} },
          { tool: 'Type', arguments: { text: 'must not type' } },
        ],
      })
    ).isError,
  );
  assert.deepEqual(actions, ['Click']);
});
test('providers cannot disconnect remembered control as automatic cleanup', async (t) => {
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => ({ tools: [], call: async () => ({ content: [] }), close: async () => {} }),
  });
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  const stop = f.call('integrations_stop', { id: 'windows' });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert(!(await stop).isError);
  assert.equal((await f.service.desktopPermissions()).length, 1);
  assert((await f.service.list()).integrations[0].enabled);
});

test('desktop sequences reserve input across providers and stop immediately on cancellation', async (t) => {
  let running = false;
  const actions = [],
    f = await fixture(t, {
      platform: 'win32',
      connect: async () => ({
        tools: ['Click', 'Type', 'Screenshot'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        call: async (name, _args, signal) => {
          actions.push(name);
          if (name === 'Click') {
            running = true;
            await new Promise((resolve, reject) =>
              signal.addEventListener('abort', () => reject(Error('Stopped')), { once: true }),
            );
          }
          return { content: [] };
        },
        close: async () => {},
      }),
    });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  const sequence = f.call('integrations_sequence', {
    steps: [
      { tool: 'Click', arguments: {} },
      { tool: 'Type', arguments: { text: 'must not type' } },
    ],
  });
  for (let i = 0; i < 100 && !running; i++) await tick();
  assert(running);
  const other = await f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  assert(other.isError);
  f.controller.abort();
  await sequence.catch(() => {});
  await tick();
  assert.deepEqual(actions, ['Click']);
});

test('uncertain timed-out input closes its controller without replaying the action', async (t) => {
  let connections = 0,
    closed = 0,
    clicks = 0;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => {
      connections++;
      return {
        tools: ['Click', 'Screenshot'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        isOpen: () => true,
        call: async (name) => {
          if (name === 'Click') {
            clicks++;
            throw Object.assign(Error('Request timed out'), { code: -32001 });
          }
          return { content: [] };
        },
        close: async () => {
          closed++;
        },
      };
    },
  });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  assert((await f.call('integrations_call', { id: 'windows', tool: 'Click' })).isError);
  assert.equal(closed, 1);
  assert.equal(clicks, 1);
  assert(!(await f.call('integrations_call', { id: 'windows', tool: 'Screenshot' })).isError);
  assert.equal(connections, 3);
  assert.equal(clicks, 1);
});

test('routine PowerShell shares saved control, normalizes its project paths and activates the border before execution', async (t) => {
  const events = [],
    calls = [],
    f = await fixture(t, {
      platform: 'win32',
      desktopControl: async (event) => events.push(event),
      connect: async () => ({
        tools: ['PowerShell'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        call: async (name, args) => {
          assert(events.some((row) => row.active));
          calls.push(args);
          return { content: [] };
        },
        close: async () => {},
      }),
    });
  f.job.cwd = f.directory;
  await fs.writeFile(path.join(f.directory, 'app.txt'), '');
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  assert(
    !(
      await f.call('integrations_call', {
        id: 'windows',
        tool: 'PowerShell',
        arguments: { command: 'Get-Content app.txt' },
      })
    ).isError,
  );
  assert.equal(f.approvals.list().length, 0);
  assert(calls[0].command.includes(path.join(await fs.realpath(f.directory), 'app.txt')));
  assert(events.some((row) => row.active && row.jobId === f.job.id));
  const dangerous = f.call('integrations_call', {
    id: 'windows',
    tool: 'PowerShell',
    arguments: { command: 'Remove-Item app.txt' },
  });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await dangerous).isError);
  assert.equal(calls.length, 1);
  const denied = f.call('integrations_call', {
    id: 'windows',
    tool: 'PowerShell',
    arguments: { command: 'Get-Content app.txt' },
  });
  assert((await f.waitApproval()).details.includes('previously denied'));
  f.approvals.answer(f.approvals.list()[0].id, 'Deny');
  assert((await denied).isError);
  await f.service.revokeDesktop('colab:one');
  assert(events.some((row) => row.active === false && row.owner === 'colab:one'));
});

test('manual approval of a risky command reuses the desktop lease and keeps the selected working folder', async (t) => {
  let connections = 0,
    closed = 0;
  const executed = [],
    borders = [],
    f = await fixture(t, {
      platform: 'win32',
      desktopControl: async (event) => borders.push(event),
      connect: async () => {
        connections++;
        return {
          tools: [{ name: 'PowerShell', inputSchema: { type: 'object' } }],
          call: async (_name, args) => {
            executed.push(args.command);
            return { content: [] };
          },
          close: async () => {
            closed++;
          },
        };
      },
    });
  f.job.cwd = f.directory;
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  await f.service.grantDesktop('colab:one');
  assert(
    !(await f.call('integrations_call', { id: 'windows', tool: 'PowerShell', arguments: { command: 'Get-Date' } }))
      .isError,
  );
  borders.length = 0;
  const dangerous = f.call('integrations_call', {
      id: 'windows',
      tool: 'PowerShell',
      arguments: { command: 'Remove-Item app.txt' },
    }),
    approval = await f.waitApproval();
  assert(approval.details.includes('Working folder: ' + f.directory));
  f.approvals.answer(approval.id, 'Allow once');
  assert(!(await dangerous).isError);
  assert.equal(connections, 2);
  assert.equal(closed, 0);
  assert(executed.at(-1).includes('Set-Location -LiteralPath'));
  assert(executed.at(-1).includes(await fs.realpath(f.directory)));
  assert(executed.at(-1).endsWith('Remove-Item app.txt'));
  assert(!borders.some((row) => row.active === false));
});

test('Allow once covers only the approved desktop sequence and final screenshot', async (t) => {
  const actions = [],
    f = await fixture(t, {
      platform: 'win32',
      connect: async () => ({
        tools: ['Click', 'Type', 'Screenshot'].map((name) => ({ name, inputSchema: { type: 'object' } })),
        call: async (name) => {
          actions.push(name);
          return { content: [] };
        },
        close: async () => {},
      }),
    });
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const run = f.call('integrations_sequence', {
    steps: [
      { tool: 'Click', arguments: {} },
      { tool: 'Type', arguments: { text: 'hello' } },
    ],
  });
  const request = await f.waitApproval();
  assert.deepEqual(request.choices, ['Allow', 'Allow once', 'Deny']);
  f.approvals.answer(request.id, 'Allow once');
  assert(!(await run).isError);
  assert.deepEqual(actions, ['Click', 'Type', 'Screenshot']);
  assert.equal((await f.service.desktopPermissions()).length, 0);
  assert.equal(f.approvals.list().length, 0);
  const next = f.call('integrations_call', { id: 'windows', tool: 'Screenshot' });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await next).isError);
  assert.equal(actions.length, 3);
  const denied = f.call('integrations_sequence', { steps: [{ tool: 'Click', arguments: {} }] });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await denied).isError);
  assert.equal(actions.length, 3);
});
test('Allow on a non-desktop tool remembers the exact request without a screen grant', async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    connect: async () => ({
      tools: [{ name: 'inspect', inputSchema: { type: 'object' } }],
      call: async () => {
        calls++;
        return { content: [] };
      },
      close: async () => {},
    }),
  });
  await f.service.save(saved);
  const args = { id: 'sample', tool: 'inspect', arguments: { file: 'one' } },
    first = f.call('integrations_call', args);
  f.approvals.answer((await f.waitApproval()).id, 'Allow');
  assert(!(await first).isError);
  assert(!(await f.call('integrations_call', args)).isError);
  assert.equal(calls, 2);
  assert.equal((await f.service.desktopPermissions()).length, 0);
  const changed = f.call('integrations_call', { ...args, arguments: { file: 'two' } });
  f.approvals.answer((await f.waitApproval()).id, 'Deny');
  assert((await changed).isError);
  assert.equal(calls, 2);
});

// Windows control with a fake PowerShell tool. beforeAction runs before each connection after the first,
// which is the one that runs a command.
async function shellFixture(t, { beforeAction } = {}) {
  const executed = [];
  let connections = 0;
  const f = await fixture(t, {
    platform: 'win32',
    connect: async () => {
      if (++connections > 1) await beforeAction?.();
      return {
        tools: [{ name: 'PowerShell', inputSchema: { type: 'object' } }],
        call: async (_name, args) => {
          executed.push(args.command);
          return { content: [] };
        },
        close: async () => {},
      };
    },
  });
  f.job.cwd = f.directory;
  await fs.mkdir(path.join(f.directory, 'tools', 'uv'), { recursive: true });
  await fs.writeFile(path.join(f.directory, 'tools', 'uv', 'uvx.exe'), '');
  await f.service.save(require('../integration-service').windowsPreset);
  const shell = (command) => f.call('integrations_call', { id: 'windows', tool: 'PowerShell', arguments: { command } });
  return { ...f, executed, shell };
}
const chatChoices = ['Allow for this chat', 'Allow once', 'Deny'];

test('Allow for this chat runs later non-routine PowerShell in that chat without asking', async (t) => {
  const f = await shellFixture(t);
  const first = f.shell('npm test'),
    request = await f.waitApproval();
  assert.deepEqual(request.choices, chatChoices);
  assert.match(request.permissionScope, /without asking[\s\S]*still ask/);
  f.approvals.answer(request.id, 'Allow for this chat');
  assert(!(await first).isError);
  assert(!(await f.shell('node build.js')).isError);
  assert.equal(f.approvals.list().length, 0);
  assert.equal(f.executed.length, 2);
  assert(f.executed[1].includes('Set-Location -LiteralPath'), 'still runs in the task folder');
  assert(f.executed[1].endsWith('node build.js'));
  assert.deepEqual(
    (await f.service.shellPermissions()).map((row) => row.owner),
    ['colab:one'],
  );
  assert(f.events.some((event) => event.approvedBy === 'chat' && event.status === 'completed'));
  await assert.rejects(f.service.grantShell('invalid'));
});

test('a chat that allows PowerShell still asks before deleting, and says why', async (t) => {
  const f = await shellFixture(t);
  await f.service.grantShell('colab:one');
  const remove = f.shell('Remove-Item dist -Recurse'),
    request = await f.waitApproval();
  assert.deepEqual(request.choices, ['Allow', 'Allow once', 'Deny']);
  assert.match(request.details, /Asks even in a chat that allows PowerShell: This command deletes files/);
  f.approvals.answer(request.id, 'Deny');
  assert((await remove).isError);
  assert.equal(f.executed.length, 0);
});

test('PowerShell allowed in one chat still asks in other chats and the other workspace', async (t) => {
  const f = await shellFixture(t);
  await f.service.grantShell('colab:one');
  for (const owner of ['colab:two', 'assistant:one']) {
    const other = await f.service.bind({
        provider: 'claude',
        owner,
        job: { id: owner, cwd: f.directory },
        signal: f.controller.signal,
      }),
      client = new Client({ name: owner, version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(other.config.url), { requestInit: { headers: other.config.headers } }),
    );
    const run = client.callTool({
        name: 'integrations_call',
        arguments: { id: 'windows', tool: 'PowerShell', arguments: { command: 'npm test' } },
      }),
      request = await f.waitApproval();
    assert.deepEqual(request.choices, chatChoices, owner);
    f.approvals.answer(request.id, 'Deny');
    assert((await run).isError);
    other.release();
    await client.close();
  }
  assert.equal(f.executed.length, 0);
});

test('revoking PowerShell for a chat stops a command waiting to run and asks again', async (t) => {
  let open;
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const f = await shellFixture(t, { beforeAction: () => gate });
  await f.service.grantShell('colab:one');
  const waiting = f.shell('npm test');
  for (let i = 0; i < 100 && !f.events.some((event) => event.status === 'running'); i++) await tick();
  await f.service.revokeShell('colab:one');
  open();
  const result = await waiting;
  assert(result.isError);
  assert.match(JSON.stringify(result.content), /PowerShell permission for this chat was revoked/);
  assert.equal(f.executed.length, 0);
  const again = f.shell('npm test');
  assert.deepEqual((await f.waitApproval()).choices, chatChoices);
  f.approvals.answer(f.approvals.list()[0].id, 'Deny');
  assert((await again).isError);
  await assert.rejects(f.service.revokeShell(undefined), /Invalid chat permission/);
});

test('PowerShell grants survive a restart and end when Windows control is disabled', async (t) => {
  const f = await shellFixture(t);
  await f.service.grantShell('colab:one');
  await f.service.close();
  const restored = createIntegrationService({
    directory: f.directory,
    platform: 'win32',
    approvals: f.approvals,
    connect: async () => ({ tools: [], call: async () => ({ content: [] }), close: async () => {} }),
  });
  try {
    assert.deepEqual(
      (await restored.shellPermissions()).map((row) => row.owner),
      ['colab:one'],
    );
    await restored.enable('windows', false);
    assert.deepEqual(await restored.shellPermissions(), []);
  } finally {
    await restored.close();
  }
});
