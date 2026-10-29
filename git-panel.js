const path = require('node:path');
function createGitPanel({
  command = require('./workspace-service').command,
  guard = require('./project-root').createProjectRootGuard(),
  approve,
  busy = () => false,
} = {}) {
  return {
    async action(request) {
      const cwd = await guard.assertProject(request.cwd),
        run = (args) => command('git', ['-C', cwd, ...args]);
      if (!request.action || request.action === 'status') {
        const status = await run(['status', '--porcelain=v1', '-z']);
        const files = [];
        const parts = status.split('\0');
        for (let n = 0; n < parts.length; n++) {
          const value = parts[n];
          if (!value) continue;
          files.push({ state: value.slice(0, 2), path: value.slice(3) });
          if (/[RC]/.test(value.slice(0, 2))) n++;
        }
        return {
          cwd,
          branch: await run(['branch', '--show-current']),
          files,
          history: await run(['log', '-15', '--format=%h %s']).catch(() => 'No commits available.'),
        };
      }
      if (request.action === 'diff') {
        const name = String(request.path || '');
        if (!require('./project-files').allowed(name)) throw Error('Choose an allowed relative file.');
        return { text: await run(['diff', ...(request.staged ? ['--cached'] : []), '--', name]) };
      }
      if (busy()) throw Error('Finish active tasks before changing Git state.');
      if (request.action === 'stage' || request.action === 'unstage') {
        const name = String(request.path || '');
        if (!require('./project-files').allowed(name) || path.isAbsolute(name)) throw Error('Choose an allowed file.');
        if (!(await approve(request.action === 'stage' ? 'Stage this file?' : 'Unstage this file?', cwd + '\n' + name)))
          return { cancelled: true };
        await run(request.action === 'stage' ? ['add', '--', name] : ['restore', '--staged', '--', name]);
        return this.action({ ...request, action: 'status' });
      }
      if (request.action === 'commit') {
        const message = String(request.message || '').trim();
        if (!message || message.length > 1000) throw Error('Enter a commit message.');
        if (
          !(await approve(
            'Commit the staged changes?',
            cwd + '\n\n' + message + '\n\nOnly staged changes are committed. Nothing is pushed.',
          ))
        )
          return { cancelled: true };
        await run(['commit', '-m', message]);
        return this.action({ ...request, action: 'status' });
      }
      throw Error('Unknown Git panel action.');
    },
  };
}
module.exports = { createGitPanel };
