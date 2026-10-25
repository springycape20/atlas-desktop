const fs = require('node:fs/promises');
async function reusableWorkspace({ id, chatId, cwd, jobs, service }) {
  if (!id) return null;
  const owner = jobs.find(
    (job) => job.collaboration && job.workspaceId === id && job.colabChatId === chatId && job.status !== 'running',
  );
  if (!owner) return null;
  const [requested, original] = await Promise.all([fs.realpath(cwd), fs.realpath(owner.request?.cwd || owner.cwd)]);
  const key = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
  if (key(requested) !== key(original)) throw Error('Choose a new Colab chat when changing the project folder.');
  const tree = await service.tree(id);
  return tree.state === 'active' ? tree : null;
}
module.exports = { reusableWorkspace };
