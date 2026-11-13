async function captureRendererBackup(contents) {
  // DOMException cannot cross Electron's executeJavaScript boundary reliably.
  // Serialize the backup (already a JSON format) and any failure inside the renderer.
  let encoded;
  try {
    encoded = await contents.executeJavaScript(`(async () => {
      try {
        const history = window.atlasColabHistory;
        if (!history) throw Error('Chat history is not ready. Wait for ATLAS to finish opening and retry.');
        await history.flush();
        const data = {
          localStorage: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('atlas')).map(key => [key, localStorage.getItem(key)])),
          colab: await history.load({chats: [], selected: ''})
        };
        return JSON.stringify({ok: true, data});
      } catch (error) {
        return JSON.stringify({ok: false, error: {
          name: typeof error?.name === 'string' ? error.name : 'Error',
          message: typeof error?.message === 'string' ? error.message.slice(0, 500) : 'Browser records could not be read. Close and reopen ATLAS before retrying.'
        }});
      }
    })()`);
  } catch {
    throw Error('Could not read the ATLAS browser records. Close and reopen ATLAS before retrying the backup.');
  }
  let result;
  try {
    result = JSON.parse(encoded);
  } catch {
    throw Error('ATLAS returned an invalid browser backup. Close and reopen ATLAS before retrying.');
  }
  if (!result.ok) {
    const error = Error('Could not back up browser records: ' + result.error.message);
    error.name = result.error.name;
    throw error;
  }
  return result.data;
}
module.exports = { captureRendererBackup };
