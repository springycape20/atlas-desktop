(async () => {
  try {
    const value = await window.atlas.rendererRestore();
    for (const key of Object.keys(localStorage)) if (key.startsWith('atlas')) localStorage.removeItem(key);
    for (const [key, text] of Object.entries(value.localStorage || {}))
      if (key.startsWith('atlas') && typeof text === 'string') localStorage.setItem(key, text);
    if (value.colab) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('atlas-colab-history', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(['chats', 'meta'], 'readwrite');
          tx.objectStore('chats').clear();
          for (const row of value.colab.chats || []) tx.objectStore('chats').put(row);
          tx.objectStore('meta').put({ selected: value.colab.selected, migrated: true }, 'state');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }
    await window.atlas.rendererRestore({ action: 'complete' });
    location.replace('atlas://app/');
  } catch (error) {
    document.getElementById('restoreStatus').textContent =
      'Restore stopped: ' + error.message + '. Your recovery copy remains in the local data folder.';
  }
})();
