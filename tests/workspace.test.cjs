const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createWorkspaceService, command } = require('../workspace-service');
const { createCollaboration } = require('../collaboration');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-workspace-test-'));
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  });
  const repo = path.join(root, 'repo'); await fs.mkdir(repo);
  const git = args => command('git', ['-C', repo, ...args]);
  await git(['init']); await git(['config','core.autocrlf','false']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.com']);
  await fs.writeFile(path.join(repo, 'example.txt'), 'original\n');
  await git(['add', '.']); await git(['commit', '-m', 'Initial']);
  return { root, repo, git, service: createWorkspaceService(path.join(root, 'data')) };
}
test('project profiles persist and attachment snapshots detect tampering', async t => {
  const { root, repo, service } = await fixture(t);
  const [profile] = await Promise.all([service.profiles({action:'save',profile:{name:'Demo',cwd:repo,instructions:'Run tests',effort:'high'}}), service.profile('missing')]);
  const source = path.join(repo, 'example.txt');
  const [attachment] = await service.importPaths([source]);
  await fs.writeFile(source, 'changed original');
  assert.equal((await service.preview(attachment.id)).preview, 'original\n');
  const restored = createWorkspaceService(path.join(root, 'data'));
  assert.equal((await restored.profile(profile.id)).instructions, 'Run tests');
  const [snapshot] = await restored.attachments([attachment.id]);
  await fs.writeFile(snapshot.file, 'tampered');
  await assert.rejects(restored.preview(attachment.id), /changed after import/);
  await assert.rejects(service.importBuffers([{name:'bad.png',bytes:Buffer.from('not an image')}]), /image format/);
});
test('isolated review rejects stale diffs and accepts only reviewed changes', async t => {
  const { repo, service } = await fixture(t), tree = await service.createWorktree(repo);
  await fs.writeFile(path.join(tree.path, 'example.txt'), 'first edit\n');
  const old = await service.review(tree.id);
  await fs.writeFile(path.join(tree.path, 'example.txt'), 'final edit\n');
  await assert.rejects(service.reviewAction({id:tree.id,action:'accept',token:old.token}), /Files changed/);
  assert.equal(await fs.readFile(path.join(repo, 'example.txt'), 'utf8'), 'original\n');
  const latest = await service.review(tree.id);
  await service.reviewAction({id:tree.id,action:'accept',token:latest.token});
  assert.equal(await fs.readFile(path.join(repo, 'example.txt'), 'utf8'), 'final edit\n');
  assert.equal((await service.review(tree.id)).state, 'accepted');
});
test('original changes block acceptance and discard preserves a recovery snapshot', async t => {
  const { repo, git, service } = await fixture(t), tree = await service.createWorktree(repo);
  await fs.writeFile(path.join(tree.path, 'new.txt'), 'isolated');
  await fs.writeFile(path.join(repo, 'example.txt'), 'user edits');
  const review = await service.review(tree.id);
  await assert.rejects(service.reviewAction({id:tree.id,action:'accept',token:review.token}), /original checkout changed/);
  await service.reviewAction({id:tree.id,action:'discard',token:review.token});
  assert.equal(await fs.readFile(path.join(repo, 'example.txt'), 'utf8'), 'user edits');
  assert.ok(await git(['rev-parse', 'refs/atlas/snapshots/'+tree.id]));
  await assert.rejects(service.createWorktree(repo), /clean Git checkout/);
});
test('Colab resumes completed stages and aggregates only reported usage', async () => {
  let saved, calls = [];
  const initial = createCollaboration({progress(){},checkpoint:async rows=>{saved=structuredClone(rows);},runProvider:async provider=>{
    calls.push(provider); if(provider==='claude')throw Error('Interrupted');
    return {output:'Completed implementation\nATLAS_COLAB_READY',usage:{inputTokens:10,outputTokens:5}};
  }});
  await assert.rejects(initial({task:'Build',settings:{}}), /Interrupted/);
  assert.equal(saved.length, 1);
  calls=[];
  const resumed=createCollaboration({progress(){},runProvider:async(provider,prompt)=>{calls.push(provider);assert.match(prompt,/Completed implementation/);assert.match(prompt,/partial changes/);return {output:'Verified\nATLAS_COLAB_READY'};}});
  const result=await resumed({task:'Build',settings:{},checkpoints:saved,maxRounds:3});
  assert.deepEqual(calls,['claude']);assert.equal(result.usage.inputTokens,10);assert.equal(result.usage.costReported,false);
});
test('comparison is read-only and its second perspective is independent', async () => {
  const calls=[];
  const run=createCollaboration({progress(){},runProvider:async(provider,prompt,cwd,settings)=>{calls.push({prompt,settings});return {output:'Unique perspective '+calls.length+'\nATLAS_COLAB_READY'};}});
  await run({task:'Compare',mode:'compare',maxRounds:3,settings:{permissionBypass:true}});
  assert.ok(calls.every(call=>call.settings.readOnly&&call.settings.codexSandbox==='read-only'&&!call.settings.permissionBypass));
  assert.ok(!calls[1].prompt.includes('Unique perspective 1'));
  assert.ok(calls[2].prompt.includes('Unique perspective 1'));
  const controller=new AbortController();controller.abort();
  await assert.rejects(run({task:'Stop',settings:{},signal:controller.signal}),/stopped/);
});
test('all renderer scripts parse, including the HTML inline scripts', async () => {
  for(const file of ['assistant-chat.js','colab-history.js','colab-workspace.js','workspace-extras.js','provider-usage-ui.js','code-syntax.js','syntax-worker.js','syntax-highlight.js','change-editor.js','productivity-ui.js','settings-discovery.js'])new vm.Script(await fs.readFile(path.join(__dirname,'..',file),'utf8'));
  const html=await fs.readFile(path.join(__dirname,'..','index.html'),'utf8');
  for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
