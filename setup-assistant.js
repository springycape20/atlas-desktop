const path = require('node:path');
const { createProjectRootGuard } = require('./project-root');
function createSetupAssistant({ files, probe = require('./project-workbench').findTool } = {}) {
  const guard = createProjectRootGuard();
  async function detect(folder) {
    const cwd = await guard.assertProject(folder),
      listing = await files.list(cwd, '.'),
      names = new Set(listing.entries.filter((e) => !e.directory).map((e) => e.path)),
      types = [],
      checks = [],
      runs = [],
      installs = [],
      tools = new Set(['git']);
    const read = async (name) => {
      const value = await files.read(cwd, name);
      if (typeof value.text !== 'string') throw Error('Manifest is not readable text: ' + name);
      return value.text;
    };
    if (names.has('package.json')) {
      const pkg = JSON.parse(await read('package.json')),
        pm = names.has('pnpm-lock.yaml') ? 'pnpm' : names.has('yarn.lock') ? 'yarn' : 'npm';
      types.push('Node.js');
      tools.add('node');
      tools.add(pm);
      for (const name of ['test', 'lint', 'typecheck', 'check', 'build'])
        if (typeof pkg.scripts?.[name] === 'string' && !/no test specified/.test(pkg.scripts[name]))
          checks.push(pm + ' run ' + name);
      for (const name of ['dev', 'start']) if (typeof pkg.scripts?.[name] === 'string') runs.push(pm + ' run ' + name);
      installs.push(pm === 'npm' && names.has('package-lock.json') ? 'npm ci' : pm + ' install');
    }
    if (names.has('pyproject.toml') || names.has('requirements.txt')) {
      types.push('Python');
      tools.add('python');
      checks.push('python -m pytest');
      if (names.has('requirements.txt')) {
        await read('requirements.txt');
        installs.push('python -m pip install -r requirements.txt');
      }
    }
    if (names.has('Cargo.toml')) {
      await read('Cargo.toml');
      types.push('Rust');
      tools.add('cargo');
      checks.push('cargo test', 'cargo check');
      installs.push('cargo fetch');
    }
    if (names.has('go.mod')) {
      await read('go.mod');
      types.push('Go');
      tools.add('go');
      checks.push('go test ./...');
      installs.push('go mod download');
    }
    const prerequisites = [];
    for (const name of tools) {
      try {
        await probe(name);
        prerequisites.push({ name, available: true });
      } catch {
        prerequisites.push({ name, available: false });
      }
    }
    return {
      cwd,
      name: path.basename(cwd),
      types,
      checks,
      runs,
      installs,
      prerequisites,
      limited: listing.limited === true,
      note: 'Manifest names suggest commands; they have not been executed or verified. Installs can run project code and use the network. Saving does not run anything.',
    };
  }
  return { detect };
}
module.exports = { createSetupAssistant };
