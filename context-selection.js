function selection(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  return {
    instructions: input.instructions !== false,
    memories: input.memories !== false,
    history: input.history !== false,
    attachments: input.attachments !== false,
    project: input.project === true,
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
