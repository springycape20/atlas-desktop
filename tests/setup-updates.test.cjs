const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createWorkspaceService,command}=require('../workspace-service');
const {createModelCatalog,claudeModels}=require('../model-catalog');
const {createAppUpdates,newer}=require('../app-updates');
const {registerWorkspaceIpc}=require('../workspace-ipc');
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-setup-test-'));t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});return dir;}
test('new project setup creates a usable worktree and excludes common credentials',async t=>{
  const dir=await temporary(t),repo=path.join(dir,'new');await fs.mkdir(repo);
  await fs.writeFile(path.join(repo,'app.js'),'console.log("hello");');await fs.writeFile(path.join(repo,'.env'),'SECRET=private');
  const service=createWorkspaceService(path.join(dir,'data'));
  assert.equal((await service.repository(repo)).exists,false);
  await service.initializeRepository(repo);
  const tree=await service.createWorktree(repo);
  assert.match(await fs.readFile(path.join(tree.path,'app.js'),'utf8'),/hello/);
  await assert.rejects(fs.stat(path.join(tree.path,'.env')),/ENOENT/);
  assert.equal(await command('git',['-C',repo,'status','--porcelain']),'');
});
test('existing repositories are inspected without replacing ignore rules',async t=>{
  const dir=await temporary(t),service=createWorkspaceService(path.join(dir,'data'));
  await command('git',['init',dir]);await fs.writeFile(path.join(dir,'.gitignore'),'mine/\n');
  await service.initializeRepository(dir);
  assert.equal(await fs.readFile(path.join(dir,'.gitignore'),'utf8'),'mine/\n');
  assert.equal((await service.repository(dir)).hasCommit,true);
});
test('model discovery coalesces requests, persists models and survives offline refresh',async t=>{
  const dir=await temporary(t);let calls=0,offline=false;
  const catalog=createModelCatalog({directory:dir,discover:async()=>{calls++;if(offline)throw Error('Offline');return [{id:'new-model',displayName:'New Model'},{id:'bad model'}];}});
  const results=await Promise.all([catalog.get('codex',true),catalog.get('codex',true)]);
  assert.equal(calls,1);assert.equal(results[0].models[0].name,'New Model');
  offline=true;const cached=await catalog.get('codex',true);assert.equal(cached.stale,true);assert.equal(cached.models[0].id,'new-model');
  const restored=createModelCatalog({directory:dir,discover:async()=>{throw Error('Offline');}});
  assert.equal((await restored.get('codex')).models[0].id,'new-model');
});
test('Claude discovery sends initialization only and handles model responses',async()=>{
  let input='',killed=false;const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{killed=true;};
  child.stdin.on('data',data=>{input+=data;const request=JSON.parse(input);child.stdout.write(JSON.stringify({type:'control_response',response:{request_id:request.request_id,subtype:'success',response:{models:[{value:'fable',displayName:'Fable'}]}}})+'\n');});
  const rows=await claudeModels('claude',()=>child);
  assert.equal(rows[0].id,'fable');assert.equal(JSON.parse(input).request.subtype,'initialize');assert.equal(killed,true);assert.ok(!input.includes('"type":"user"'));
});
test('updates require explicit download and block restart while tasks run',async()=>{
  const updater=new EventEmitter();let downloads=0,installs=0,running=true;
  updater.checkForUpdates=async()=>updater.emit('update-available',{version:'1.1.0'});
  updater.downloadUpdate=async()=>{downloads++;updater.emit('download-progress',{percent:50});updater.emit('update-downloaded',{version:'1.1.0'});};
  updater.quitAndInstall=()=>{installs++;};
  const updates=createAppUpdates({app:{isPackaged:true,getVersion:()=> '1.0.0'},updater,busy:()=>running});
  assert.equal((await updates.action({action:'check'})).status,'available');assert.equal(downloads,0);assert.equal(updater.autoInstallOnAppQuit,false);
  assert.equal((await updates.action({action:'download'})).status,'downloaded');
  await assert.rejects(updates.action({action:'install'}),/running tasks/);running=false;
  await updates.action({action:'install'});await new Promise(r=>setImmediate(r));assert.equal(installs,1);
});
test('source update checks never install and network failures remain recoverable',async()=>{
  assert.equal(newer('v1.10.0','1.9.0'),true);assert.equal(newer('v1.0.0-beta','0.9.0'),false);
  const source=createAppUpdates({app:{isPackaged:false,getVersion:()=> '1.0.0'},fetchRelease:async()=>({tag_name:'v1.1.0'})});
  assert.equal((await source.action({action:'check'})).status,'source-available');await assert.rejects(source.action({action:'download'}),/installed-app/);
  const updater=new EventEmitter();updater.checkForUpdates=async()=>{throw Error('Offline');};
  const updates=createAppUpdates({app:{isPackaged:true,getVersion:()=> '1.0.0'},updater});
  assert.equal((await updates.action({action:'check'})).status,'error');
});
test('Git setup requires confirmation and rejects untrusted windows',async()=>{
  const handlers=new Map();let response=1,initializations=0;
  registerWorkspaceIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},trusted:event=>event.trusted,window:()=>null,
    service:()=>({repository:async()=>({exists:false,root:'/project'}),initializeRepository:async()=>{initializations++;}}),
    dialog:{showMessageBox:async()=>({response})}});
  const prepare=handlers.get('atlas:prepare-project');
  assert.equal((await prepare({trusted:true},{cwd:'/project'})).ready,false);assert.equal(initializations,0);
  response=0;assert.equal((await prepare({trusted:true},{cwd:'/project'})).ready,true);assert.equal(initializations,1);
  await assert.rejects(prepare({trusted:false},{cwd:'/project'}),/Untrusted/);
});
