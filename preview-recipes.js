const fs = require('node:fs/promises'),
  path = require('node:path');
async function previewRecipe(cwd, request = {}, env = process.env) {
  const recipe = request.recipe || 'vite',
    port = Number(request.port || (recipe === 'next' ? 3000 : recipe === 'flask' ? 5000 : 5173));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Choose a port from 1024 to 65535.');
  if (!['vite', 'next', 'flask'].includes(recipe)) throw Error('Choose Vite, Next.js or Flask.');
  let executable, args;
  if (recipe === 'flask') {
    const module = request.module || 'app';
    if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?::[A-Za-z_]\w*)?$/.test(module))
      throw Error('Use a Python module such as app or app:app.');
    executable = await fs
      .realpath(path.join(cwd, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'))
      .catch(() => null);
    // Unix virtual environments normally symlink their interpreter outside the project.
    if (!executable) throw Error('Create a .venv with Flask installed before starting this recipe.');
    args = [
      '-m',
      'flask',
      '--app',
      module,
      'run',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--no-debugger',
      '--no-reload',
    ];
  } else {
    const cli = await fs
      .realpath(path.join(cwd, recipe === 'next' ? 'node_modules/next/dist/bin/next' : 'node_modules/vite/bin/vite.js'))
      .catch(() => null);
    if (!cli || !require('./project-files').within(cwd, cli))
      throw Error('Install ' + recipe + ' in this project before starting its preview.');
    for (const folder of (env.PATH || '').split(path.delimiter)) {
      if (!path.isAbsolute(folder)) continue;
      const candidate = path.join(folder, process.platform === 'win32' ? 'node.exe' : 'node');
      if (
        await fs.stat(candidate).then(
          (s) => s.isFile(),
          () => false,
        )
      ) {
        executable = candidate;
        break;
      }
    }
    if (!executable) throw Error('Install Node.js and add it to PATH before starting a preview.');
    args =
      recipe === 'next'
        ? [cli, 'dev', '--hostname', '127.0.0.1', '--port', String(port)]
        : [cli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  }
  return { executable, args, recipe, port, url: 'http://127.0.0.1:' + port + '/' };
}
module.exports = { previewRecipe };
