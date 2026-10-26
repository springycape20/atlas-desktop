const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { createWorkspaceService } = require('../workspace-service');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-check-offer-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const project = path.join(dir, 'cart');
  await fs.mkdir(project);
  return { project: await fs.realpath(project), service: createWorkspaceService(path.join(dir, 'data')) };
}
const detected = ['npm run test', 'npm run lint'];

test('a folder is offered its detected checks once, whatever the answer', async (t) => {
  const { project, service } = await fixture(t);
  const offer = await service.checkOffer(project, detected);
  assert.deepEqual(offer, { cwd: project, checks: detected, configured: false, profileName: '' });
  assert.equal(await service.checkOffer(project, detected), null, 'an ignored offer is not repeated');
  assert.deepEqual(await service.offeredChecks(project), detected);
  await service.answerCheckOffer({ cwd: project, answer: 'decline' });
  assert.equal(await service.checkOffer(project, detected), null);
  assert.equal((await service.profiles()).length, 0, 'declining creates nothing');
});
test('enabling creates a profile for a folder without one, using only the chosen offered checks', async (t) => {
  const { project, service } = await fixture(t);
  await service.checkOffer(project, detected);
  const { profile } = await service.answerCheckOffer({
    cwd: project,
    answer: 'enable',
    commands: ['npm run lint', 'Remove-Item -Recurse C:\\'],
  });
  assert.equal(profile.name, 'cart');
  assert.equal(profile.checkCommands, 'npm run lint', 'commands that were not offered are ignored');
  assert.equal(profile.autoCheck, true);
  assert.equal((await service.profiles())[0].id, profile.id);
  await assert.rejects(
    service.answerCheckOffer({ cwd: project, answer: 'enable', commands: ['echo pwned'] }),
    /Choose at least one/,
  );
});
test('an existing profile keeps its own commands and only gains automatic checks', async (t) => {
  const { project, service } = await fixture(t);
  const saved = await service.profiles({
    action: 'save',
    profile: { name: 'Cart', cwd: project, checkCommands: 'npm run verify', autoCheck: false },
  });
  const offer = await service.checkOffer(project, detected);
  assert.deepEqual(offer.checks, ['npm run verify'], 'configured commands are offered instead of detected ones');
  assert.equal(offer.configured, true);
  assert.equal(offer.profileName, 'Cart');
  const { profile } = await service.answerCheckOffer({ cwd: project, answer: 'enable', commands: ['npm run verify'] });
  assert.equal(profile.id, saved.id);
  assert.equal(profile.checkCommands, 'npm run verify');
  assert.equal(profile.autoCheck, true);
  assert.equal((await service.profiles()).length, 1);
});
test('folders that already run checks, or have nothing to run, get no offer', async (t) => {
  const { project, service } = await fixture(t);
  await service.profiles({
    action: 'save',
    profile: { name: 'Cart', cwd: project, checkCommands: 'npm test', autoCheck: true },
  });
  assert.equal(await service.checkOffer(project, detected), null);
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-check-offer-empty-'));
  t.after(() => fs.rm(other, { recursive: true, force: true }));
  assert.equal(await service.checkOffer(other, []), null);
  assert.equal(await service.checkOffer(other, ['go test ./...']).then((row) => row.checks[0]), 'go test ./...');
});
test('answers for folders that were never offered are refused', async (t) => {
  const { project, service } = await fixture(t);
  await assert.rejects(
    service.answerCheckOffer({ cwd: project, answer: 'enable', commands: detected }),
    /no longer available/,
  );
  await assert.rejects(service.answerCheckOffer({ cwd: project, answer: 'maybe' }), /Choose whether/);
});
