function selection(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  return {
    instructions: input.instructions !== false,
    memories: input.memories !== false,
    history: input.history !== false,
    attachments: input.attachments !== false,
    project: input.project === true,
    ...(input.vault === true ? { vault: true } : {}),
    ...(Array.isArray(input.vaultPaths)
      ? {
          vaultPaths: [
            ...new Set(
              input.vaultPaths.filter(
                (name) =>
                  typeof name === 'string' &&
                  name.length <= 1024 &&
                  /\.md$/i.test(name) &&
                  require('./vault-notes').safeName(name),
              ),
            ),
          ].slice(0, 8),
        }
      : {}),
    ...(typeof input.vaultPreview === 'string' && input.vaultPreview.length <= 80
      ? { vaultPreview: input.vaultPreview }
      : {}),
    ...(Array.isArray(input.vaultFiles)
      ? {
          vaultFiles: [
            ...new Set(input.vaultFiles.filter((name) => typeof name === 'string' && name.length <= 1024)),
          ].slice(0, 200),
        }
      : {}),
    files: [
      ...new Set(
        (Array.isArray(input.files) ? input.files : []).filter(
          (name) => typeof name === 'string' && name.length <= 1024,
        ),
      ),
    ].slice(0, 200),
  };
}
module.exports = { selection };
