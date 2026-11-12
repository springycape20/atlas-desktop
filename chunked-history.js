const fs = require('node:fs/promises'),
  path = require('node:path'),
  { createHash, randomUUID } = require('node:crypto');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function createChunkedHistory(directory, { legacy = async () => [] } = {}) {
  const folder = path.join(directory, 'chat-chunks'),
    manifest = path.join(directory, 'chat-index.json'),
    store = require('./atomic-store').createAtomicStore(manifest);
  let index,
    serial = Promise.resolve();
  async function load() {
    if (index) return;
    try {
      const value = JSON.parse(await fs.readFile(manifest, 'utf8'));
      if (
        value.version !== 1 ||
        !Array.isArray(value.chats) ||
        value.chats.some(
          (row) =>
            !row ||
            typeof row.id !== 'string' ||
            !Number.isSafeInteger(row.turnCount) ||
            row.turnCount < 0 ||
            !Array.isArray(row.chunks) ||
            row.chunks.some(
              (chunk) =>
                !/^[a-f0-9]{64}$/.test(chunk.hash) ||
                !Number.isInteger(chunk.count) ||
                chunk.count < 1 ||
                chunk.count > 150,
            ) ||
            row.chunks.reduce((sum, chunk) => sum + chunk.count, 0) !== row.turnCount,
        )
      )
        throw Error('Invalid chat history index. The original data has been retained.');
      index = value.chats;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const rows = await legacy();
      index = [];
      try {
        await write(rows, true);
      } catch (error) {
        index = undefined;
        throw error;
      }
    }
  }
  async function chunkRead(chunk) {
    const file = path.join(folder, chunk.hash + '.json');
    if ((await fs.stat(file)).size > 18 * 1048576) throw Error('Chat chunk exceeds its storage limit.');
    const bytes = await fs.readFile(file);
    if (hash(bytes) !== chunk.hash) throw Error('Chat chunk failed its integrity check. Existing data was retained.');
    const rows = JSON.parse(bytes);
    if (!Array.isArray(rows) || rows.length !== chunk.count) throw Error('Invalid chat chunk.');
    return rows;
  }
  async function write(chats, replace = false) {
    await fs.mkdir(folder, { recursive: true });
    const next = new Map((replace ? [] : index).map((row) => [row.id, row]));
    for (const chat of chats) {
      const { turns, historyPage, ...metadata } = chat;
      if (!Array.isArray(turns)) throw Error('Chat messages are required when saving.');
      const chunks = [];
      let pending = [],
        size = 0;
      const flush = async () => {
        if (!pending.length) return;
        const text = JSON.stringify(pending),
          key = hash(text),
          target = path.join(folder, key + '.json');
        try {
          if (hash(await fs.readFile(target)) !== key) throw Error('Existing chat chunk failed its integrity check.');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          const temp = target + '.' + randomUUID() + '.tmp';
          try {
            await fs.writeFile(temp, text, { flag: 'wx' });
            await fs.rename(temp, target);
          } finally {
            await fs.unlink(temp).catch(() => {});
          }
        }
        chunks.push({ hash: key, count: pending.length });
        pending = [];
        size = 0;
      };
      for (const turn of turns) {
        const length = Buffer.byteLength(JSON.stringify(turn));
        if (length > 16 * 1048576)
          throw Error('One message exceeds the history storage limit of 16 MiB. Export it before closing.');
        if (pending.length >= 150 || size + length > 1048576) await flush();
        pending.push(turn);
        size += length;
      }
      await flush();
      next.set(chat.id, {
        ...metadata,
        chunks,
        turnCount: turns.length,
        searchText: turns
          .slice(-12)
          .map((row) => row.content)
          .join(' ')
          .slice(-2500),
      });
    }
    const rows = [...next.values()];
    await store.save({ version: 1, chats: rows });
    await store.flush();
    index = rows;
    // Immutable chunks are retained if unreferenced, so interrupted migrations never destroy source data.
  }
  async function read(id, { page, size = 150, query = '' } = {}) {
    const row = index.find((row) => row.id === id);
    if (!row) return null;
    const { chunks, searchText, turnCount, ...metadata } = row;
    size = Math.max(1, Math.min(150, Math.floor(Number(size) || 150)));
    const needle = String(query).toLowerCase().slice(0, 200),
      matches = [];
    let offset = 0;
    if (needle)
      for (const chunk of chunks) {
        for (const [index, turn] of (await chunkRead(chunk)).entries())
          if (
            String(turn.content || '')
              .toLowerCase()
              .includes(needle)
          )
            matches.push(offset + index);
        offset += chunk.count;
      }
    const total = needle ? matches.length : turnCount,
      pages = Math.max(1, Math.ceil(total / size)),
      actualPage = Math.min(pages - 1, Math.max(0, Math.floor(Number(page) || 0)));
    const end = Math.max(0, total - actualPage * size),
      start = Math.max(0, end - size),
      wanted = needle ? new Set(page === undefined ? matches : matches.slice(start, end)) : null,
      selected = [];
    offset = 0;
    for (const chunk of chunks) {
      const relevant = wanted
        ? [...wanted].some((index) => index >= offset && index < offset + chunk.count)
        : page === undefined || (offset < end && offset + chunk.count > start);
      if (relevant)
        for (const [index, turn] of (await chunkRead(chunk)).entries()) {
          const absolute = offset + index;
          if (wanted ? wanted.has(absolute) : page === undefined || (absolute >= start && absolute < end))
            selected.push({ turn, index: absolute });
        }
      offset += chunk.count;
    }
    if (page === undefined) return { ...metadata, turns: selected.map((row) => row.turn) };
    return {
      ...metadata,
      turns: selected.map((row) => row.turn),
      historyPage: { page: actualPage, pages, total, indices: selected.map((row) => row.index) },
    };
  }
  async function list(query = '') {
    const result = [],
      needle = String(query).toLowerCase().slice(0, 200);
    for (const row of index) {
      let hit = !needle || (row.title + ' ' + row.searchText).toLowerCase().includes(needle);
      if (!hit)
        for (const chunk of row.chunks)
          if (
            (await chunkRead(chunk)).some((turn) =>
              String(turn.content || '')
                .toLowerCase()
                .includes(needle),
            )
          ) {
            hit = true;
            break;
          }
      if (hit) {
        const { chunks, ...metadata } = row;
        result.push(metadata);
      }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  function queued(operation) {
    const next = serial.then(async () => {
      await load();
      return operation();
    });
    serial = next.catch(() => {});
    return next;
  }
  return {
    read: (id, options) => queued(() => read(id, options)),
    list: (query) => queued(() => list(query)),
    all: () =>
      queued(async () => {
        const rows = [];
        for (const row of index) rows.push(await read(row.id));
        return rows;
      }),
    upsert: (rows) => queued(() => write(rows)),
    replace: (rows) => queued(() => write(rows, true)),
  };
}
module.exports = { createChunkedHistory };
