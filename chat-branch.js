// A branch starts with no provider sessions: those would still remember the later messages,
// so the kept messages reach the provider as context instead.
function branchChat(source, count, id, now = Date.now()) {
  if (!Number.isInteger(count) || count < 1 || count > source.turns.length)
    throw Error('That message is not available.');
  return {
    id,
    title: ('Branch: ' + source.title).slice(0, 100),
    provider: 'atlas',
    lastProvider: '',
    sessions: { codex: '', claude: '' },
    cwd: source.cwd,
    updatedAt: now,
    turns: structuredClone(source.turns.slice(0, count)),
  };
}
module.exports = { branchChat };
