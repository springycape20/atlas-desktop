const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createSetupAssistant } = require('../setup-assistant');
test('setup detects supported commands without executing project scripts, and reports missing prerequisites', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-setup-guide-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: { test: 'echo test', dev: 'malicious code not executed', typecheck: 'tsc', other: 'ignored' },
    }),
  );
  await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
  const service = createSetupAssistant({
    files: require('../project-files').createProjectFiles(),
    probe: async (name) => {
      if (name === 'pnpm') throw Error('missing');
      return name;
    },
  });
  const result = await service.detect(root);
  assert.deepEqual(result.checks, ['pnpm run test', 'pnpm run typecheck']);
  assert.deepEqual(result.runs, ['pnpm run dev']);
  assert.deepEqual(result.installs, ['pnpm install']);
  assert.equal(result.prerequisites.find((t) => t.name === 'pnpm').available, false);
});
test('setup respects integration-denied manifests', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-setup-denied-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  const service = createSetupAssistant({
    files: require('../project-files').createProjectFiles({ denied: async () => [path.join(root, 'package.json')] }),
    probe: async () => '',
  });
  const result = await service.detect(root);
  assert.deepEqual(result.types, []);
});
