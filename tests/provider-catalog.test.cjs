const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { DatabaseSync } = require('node:sqlite'),
  { HistoryClient } = require('../history-client');
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-catalog-'));
  const client = new HistoryClient({ home });
  t.after(() => client.close());
  t.after(() => fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return { home, client };
}
test('Codex catalog uses native saved names and workspaces, lists beyond 100 and marks missing transcripts', async (t) => {
  const { home, client } = await fixture(t),
    base = path.join(home, '.codex'),
    sessions = path.join(base, 'sessions');
  await fs.mkdir(sessions, { recursive: true });
  const db = new DatabaseSync(path.join(base, 'state_5.sqlite'));
  db.exec(
    'CREATE TABLE threads(id TEXT,name TEXT,title TEXT,rollout_path TEXT,cwd TEXT,project_id TEXT,originator TEXT,updated_at_ms INTEGER);CREATE TABLE projects(id TEXT,name TEXT);CREATE TABLE project_roots(project_id TEXT,path TEXT)',
  );
  db.prepare('INSERT INTO projects VALUES (?,?)').run('project', 'Human workspace name');
  db.prepare('INSERT INTO project_roots VALUES (?,?)').run('project', home);
  const add = db.prepare('INSERT INTO threads VALUES (?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 125; i++) {
    const file = path.join(sessions, i + '.jsonl');
    await fs.writeFile(
      file,
      [
        { type: 'session_meta', payload: { id: 'session-' + i, cwd: home } },
        { type: 'response_item', payload: { role: 'user', content: 'Boilerplate first prompt' } },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n'),
    );
    add.run(
      'session-' + i,
      'Actual chat name ' + i,
      'Wrong inferred title',
      file,
      home,
      'project',
      i === 0 ? 'atlas' : 'Codex Desktop',
      i,
    );
  }
  add.run(
    'missing-session',
    'Still visible in client',
    'Fallback title',
    path.join(sessions, 'missing.jsonl'),
    home,
    'project',
    'Codex Desktop',
    999,
  );
  db.close();
  const result = await client.request('catalog', { provider: 'codex' });
  assert.equal(result.chats.length, 126);
  assert.equal(result.workspaces[0].name, 'Human workspace name');
  const named = result.chats.find((chat) => chat.sessionId === 'session-124');
  assert.equal(named.title, 'Actual chat name 124');
  assert.equal(named.workspaceName, 'Human workspace name');
  assert.equal(named.importable, true);
  assert.equal(result.chats.find((chat) => chat.sessionId === 'session-0').internal, true);
  assert.equal(result.chats.find((chat) => chat.sessionId === 'missing-session').importable, false);
  const read = await client.request('read', { provider: 'codex', id: named.id });
  assert.equal(read.title, 'Actual chat name 124');
  assert.equal(read.turns[0].content, 'Boilerplate first prompt');
});
test('Claude saved custom titles and workspace indexes override inferred prompts', async (t) => {
  const { home, client } = await fixture(t),
    folder = path.join(home, '.claude', 'projects', 'project');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'session.jsonl');
  await fs.writeFile(
    file,
    [
      { type: 'user', sessionId: 'claude-session', cwd: home, message: { content: 'Long first prompt' } },
      { type: 'custom-title', sessionId: 'claude-session', customTitle: 'My renamed Claude conversation' },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
  await fs.writeFile(
    path.join(folder, 'sessions-index.json'),
    JSON.stringify({
      projectName: 'Claude workspace',
      entries: [{ sessionId: 'claude-session', summary: 'Old summary', projectPath: home, fullPath: file }],
    }),
  );
  const result = await client.request('catalog', { provider: 'claude' });
  assert.equal(result.chats.length, 1);
  assert.equal(result.chats[0].title, 'My renamed Claude conversation');
  assert.equal(result.chats[0].workspaceName, 'Claude workspace');
});
test('Claude exports include project names from their companion projects file', async (t) => {
  const { home, client } = await fixture(t),
    file = path.join(home, 'conversations.json');
  await fs.writeFile(
    file,
    JSON.stringify([
      {
        uuid: 'exported-chat',
        name: 'A real named chat',
        project_uuid: 'project',
        chat_messages: [{ sender: 'human', text: 'Continue' }],
      },
    ]),
  );
  await fs.writeFile(
    path.join(home, 'projects.json'),
    JSON.stringify([{ uuid: 'project', name: 'Actual exported project' }]),
  );
  const chats = await client.request('import-file', { file });
  assert.equal(chats[0].workspaceName, 'Actual exported project');
  assert.equal(chats[0].title, 'A real named chat');
  assert.equal(chats[0].nativeName, true);
});
