const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { createAtomicStore, readStored } = require('./atomic-store');
const EVERY = { once: 0, hourly: 3600000, daily: 86400000, weekly: 604800000 },
  LIMIT = 20,
  MAX_FAILURES = 3;
// A run more than an hour late is recorded as missed: nobody expects a model task to start
// the moment ATLAS reopens, or to spend usage catching up.
const LATE = 3600000;
function createScheduledTasks({ directory, start, approve, busy = () => false, blocked = () => '', now = Date.now }) {
  const file = path.join(directory, 'scheduled-tasks.json'),
    store = createAtomicStore(file),
    saved = readStored(file, Array.isArray);
  let rows = (saved?.value || []).filter((row) => row && typeof row === 'object');
  for (const row of rows) if (row.lastStatus === 'running') row.lastStatus = 'interrupted';
  let running = false;
  const persist = () => store.save(rows);
  const list = () => structuredClone(rows);
  function advance(row) {
    if (!row.every) {
      row.enabled = false;
      return;
    }
    row.nextAt += (Math.floor((now() - row.nextAt) / row.every) + 1) * row.every;
  }
  async function confirm(row) {
    return approve(
      'Run this task without you?',
      [
        row.prompt.slice(0, 500),
        '',
        'Folder: ' + row.cwd,
        'Schedule: ' + Object.keys(EVERY).find((name) => EVERY[name] === row.every),
        'First run: ' + new Date(row.nextAt).toLocaleString(),
        row.allowEdits ? 'It can change files in this folder.' : 'It cannot change files.',
        '',
        'Each run uses your model accounts and counts towards their limits. It runs only while ATLAS is open, stops after 30 minutes, and missed runs are not caught up.',
      ].join('\n'),
    );
  }
  async function save(item = {}) {
    const prompt = String(item.prompt || '').trim(),
      nextAt = Number(item.firstAt);
    if (!prompt || prompt.length > 20000) throw Error('Enter a task under 20,000 characters.');
    if (!Object.hasOwn(EVERY, item.schedule)) throw Error('Choose how often it runs.');
    if (!Number.isFinite(nextAt) || nextAt <= now()) throw Error('Choose a future time.');
    if (rows.length >= LIMIT) throw Error('Delete a scheduled task first. The limit is ' + LIMIT + '.');
    let cwd;
    try {
      cwd = fs.realpathSync(String(item.cwd || ''));
      if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw Error();
    } catch {
      throw Error('Choose an existing working folder.');
    }
    const row = {
      id: randomUUID(),
      conversationId: randomUUID(),
      title: prompt.replace(/\s+/g, ' ').slice(0, 72),
      prompt,
      cwd,
      every: EVERY[item.schedule],
      nextAt,
      allowEdits: item.allowEdits === true,
      enabled: true,
      failures: 0,
      lastStatus: '',
      lastError: '',
      lastRunAt: 0,
    };
    if (!(await confirm(row))) return { cancelled: true };
    rows.push(row);
    await persist();
    return list();
  }
  async function setEnabled(id, enabled) {
    const row = rows.find((item) => item.id === id);
    if (!row) throw Error('Scheduled task not found.');
    if (enabled) {
      if (row.nextAt <= now()) {
        if (!row.every) throw Error('This one-time task has passed. Create a new one.');
        advance(row);
      }
      if (!(await confirm(row))) return { cancelled: true };
      row.failures = 0;
    }
    row.enabled = enabled === true;
    await persist();
    return list();
  }
  async function remove(id) {
    rows = rows.filter((row) => row.id !== id);
    await persist();
    return list();
  }
  async function tick() {
    let changed = false;
    for (const row of rows)
      if (row.enabled && now() - row.nextAt > LATE) {
        row.lastStatus = 'missed';
        advance(row);
        changed = true;
      }
    if (changed) await persist();
    const row = rows.filter((item) => item.enabled && item.nextAt <= now()).sort((a, b) => a.nextAt - b.nextAt)[0];
    if (!row || running || busy()) return false;
    const reason = await blocked();
    if (reason) {
      row.lastStatus = 'skipped';
      row.lastError = reason;
      advance(row);
      await persist();
      return false;
    }
    running = true;
    // Moved on before starting, so a crash during the run cannot start it again.
    advance(row);
    row.lastStatus = 'running';
    row.lastError = '';
    row.lastRunAt = now();
    await persist();
    try {
      await start(row);
      row.lastStatus = 'completed';
      row.failures = 0;
    } catch (error) {
      row.lastStatus = 'failed';
      row.lastError = String(error.message || error);
      if (++row.failures >= MAX_FAILURES) {
        row.enabled = false;
        row.lastError += ' Turned off after ' + MAX_FAILURES + ' failures in a row.';
      }
    } finally {
      running = false;
    }
    await persist();
    return true;
  }
  return { list, save, setEnabled, remove, tick, flush: store.flush };
}
module.exports = { createScheduledTasks };
