(() => {
  let database, pending, running;
  const versions = new Map(),
    chunkVersions = new Map(),
    counts = new Map();
  const digest = async (value) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
  function open() {
    return (database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('atlas-colab-history', 2);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (event.oldVersion < 1) {
          db.createObjectStore('chats', { keyPath: 'id' });
          db.createObjectStore('meta');
        }
        const chunks = db.createObjectStore('chunks', { keyPath: ['chatId', 'index'] });
        const chats = request.transaction.objectStore('chats'),
          cursor = chats.openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          const { messages = [], ...metadata } = item.value;
          for (let index = 0; index * 150 < messages.length; index++)
            chunks.put({ chatId: item.key, index, messages: messages.slice(index * 150, (index + 1) * 150) });
          item.update({ ...metadata, messageCount: messages.length });
          item.continue();
        };
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Close other ATLAS windows and retry.'));
    }).catch((error) => {
      database = null;
      throw error;
    }));
  }
  function completed(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || Error('History storage failed.'));
      transaction.onabort = () => reject(transaction.error || Error('History storage was interrupted.'));
    });
  }
  async function load(legacy) {
    const db = await open(),
      read = db.transaction(['chats', 'meta', 'chunks'], 'readonly'),
      done = completed(read),
      chats = read.objectStore('chats').getAll(),
      meta = read.objectStore('meta').get('state'),
      chunks = read.objectStore('chunks').openCursor();
    const messages = new Map();
    chunks.onsuccess = () => {
      const item = chunks.result;
      if (!item) return;
      const row = item.value;
      if (!messages.has(row.chatId)) messages.set(row.chatId, []);
      messages.get(row.chatId).push(...row.messages);
      item.continue();
    };
    await done;
    let state = {
      chats: chats.result.map(({ messageCount, ...row }) => ({ ...row, messages: messages.get(row.id) || [] })),
      selected: meta.result?.selected || legacy.selected,
    };
    for (const chat of state.chats) {
      const count = chats.result.find((row) => row.id === chat.id).messageCount || 0;
      if (count !== chat.messages.length)
        throw Error('Saved message chunks are incomplete. Existing data was retained.');
      counts.set(chat.id, Math.ceil(count / 150));
      const { messages, ...metadata } = chat;
      versions.set(chat.id, await digest({ ...metadata, messageCount: count }));
      for (let index = 0; index * 150 < messages.length; index++)
        chunkVersions.set(
          chat.id + ':' + index,
          await digest({ chatId: chat.id, index, messages: messages.slice(index * 150, (index + 1) * 150) }),
        );
    }
    if (!meta.result?.migrated) {
      const merged = new Map(state.chats.map((chat) => [chat.id, chat]));
      for (const chat of legacy.chats) if (!merged.has(chat.id)) merged.set(chat.id, chat);
      state.chats = [...merged.values()];
      await write(state);
    }
    return state;
  }
  async function write(state, insert = false) {
    const db = await open(),
      changes = [];
    for (const chat of state.chats) {
      const { messages, ...metadata } = chat,
        value = { ...metadata, messageCount: messages.length },
        version = await digest(value),
        chunks = [];
      for (let index = 0; index * 150 < messages.length; index++) {
        const row = { chatId: chat.id, index, messages: messages.slice(index * 150, (index + 1) * 150) },
          key = chat.id + ':' + index,
          version = await digest(row);
        if (insert || chunkVersions.get(key) !== version) chunks.push({ row, key, version });
      }
      changes.push({
        value,
        version,
        changed: insert || versions.get(chat.id) !== version,
        chunks,
        count: Math.ceil(messages.length / 150),
      });
    }
    const transaction = db.transaction(['chats', 'meta', 'chunks'], 'readwrite'),
      done = completed(transaction);
    for (const change of changes) {
      if (change.changed) transaction.objectStore('chats')[insert ? 'add' : 'put'](change.value);
      for (const chunk of change.chunks) transaction.objectStore('chunks')[insert ? 'add' : 'put'](chunk.row);
      for (let index = change.count; index < (counts.get(change.value.id) || 0); index++)
        transaction.objectStore('chunks').delete([change.value.id, index]);
    }
    if (!insert) transaction.objectStore('meta').put({ selected: state.selected, migrated: true }, 'state');
    await done;
    for (const change of changes) {
      versions.set(change.value.id, change.version);
      counts.set(change.value.id, change.count);
      for (const chunk of change.chunks) chunkVersions.set(chunk.key, chunk.version);
    }
  }
  function save(state) {
    pending = structuredClone(state);
    if (!running)
      running = (async () => {
        while (pending) {
          const next = pending;
          pending = null;
          await write(next);
        }
      })().finally(() => {
        running = null;
      });
    return running;
  }
  async function insert(chats) {
    if (running) await running;
    if (chats.length) await write({ chats }, true);
  }
  window.atlasColabHistory = { load, save, insert, flush: () => running || Promise.resolve() };
})();
