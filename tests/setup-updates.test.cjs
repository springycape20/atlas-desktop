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

test('Colab rejects broad folders and initializes only the chosen project under an accidental home repository',async t=>{
 const dir=await temporary(t),home=path.join(dir,'user'),repo=path.join(home,'Documents','Game');await fs.mkdir(repo,{recursive:true});
 await command('git',['-C',home,'init']);await fs.writeFile(path.join(home,'personal.txt'),'Personal file, outside the selected project.');await command('git',['-C',home,'add','--','personal.txt']);
 const parentIndex=await command('git',['-C',home,'ls-files','--stage']),parentHead=await fs.readFile(path.join(home,'.git','HEAD'),'utf8');
 await fs.writeFile(path.join(repo,'game.py'),'print("game")\n');const service=createWorkspaceService(path.join(dir,'data'),{home,env:{}});
 await assert.rejects(service.repository(home),/dedicated project folder/);await assert.rejects(service.initializeRepository(path.join(home,'Documents')),/dedicated project folder/);
 const status=await service.repository(repo);assert.equal(status.exists,false);assert.equal(status.needsOwnRepository,true);assert.equal(status.ancestorRoot,await fs.realpath(home));assert.equal(status.root,await fs.realpath(repo));
 await assert.rejects(service.createWorktree(repo),/inside the selected project/);
 await service.initializeRepository(repo);const local=await service.repository(repo);assert.equal(local.hasCommit,true);assert.equal(local.root,await fs.realpath(repo));
 assert.equal(await command('git',['-C',home,'ls-files','--stage']),parentIndex);assert.equal(await fs.readFile(path.join(home,'.git','HEAD'),'utf8'),parentHead);
 assert.equal(await command('git',['-C',repo,'ls-files','personal.txt']),'');const tree=await service.createWorktree(repo);assert.equal((await fs.readFile(path.join(tree.path,'game.py'),'utf8')).replace(/\r\n/g,'\n'),'print("game")\n');
});

test('safe monorepository subfolders keep using their actual project root',async t=>{
 const dir=await temporary(t),home=path.join(dir,'home'),repo=path.join(home,'Projects','App'),child=path.join(repo,'src');await fs.mkdir(child,{recursive:true});
 await command('git',['-C',repo,'init']);const service=createWorkspaceService(path.join(dir,'data'),{home,env:{}});await service.initializeRepository(repo);assert.equal((await service.repository(child)).root,await fs.realpath(repo));
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

test('inherited broad repositories prompt for a separate repository in the selected folder',async()=>{
 const handlers=new Map();let prompt,initialized;
 registerWorkspaceIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},trusted:()=>true,window:()=>null,service:()=>({repository:async()=>({exists:false,root:'C:\\Users\\Friend\\Documents\\Game',ancestorRoot:'C:\\Users\\Friend',needsOwnRepository:true}),initializeRepository:async folder=>{initialized=folder;}}),dialog:{showMessageBox:async(_window,options)=>{prompt=options;return {response:0};}}});
 const result=await handlers.get('atlas:prepare-project')({},{cwd:'C:\\Users\\Friend\\Documents\\Game'});assert.equal(result.ready,true);assert.equal(initialized,'C:\\Users\\Friend\\Documents\\Game');assert.match(prompt.detail,/leave the parent repository intact/);assert.match(prompt.detail,/Parent repository/);
});

test('screenshot paste reads Electron async PNG clipboard and preserves bytes',async()=>{
  const handlers=new Map(),png=Buffer.from('PNG snapshot');let imported;
  const clipboard={read:async()=>[{types:['text/plain'],getType:async()=>{throw Error('wrong type');}},{types:['image/png'],getType:async type=>{assert.equal(type,'image/png');return new Blob([png],{type});}}]};
  registerWorkspaceIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},trusted:e=>e.trusted,clipboard,service:()=>({importBuffers:async files=>{imported=files;return [{id:'screenshot'}];}})});
  const paste=handlers.get('atlas:attachments');
  assert.deepEqual(await paste({trusted:true},{action:'clipboard'}),[{id:'screenshot'}]);
  assert.equal(imported[0].name,'Screenshot.png');assert.deepEqual(imported[0].bytes,png);
  await assert.rejects(paste({trusted:false},{action:'clipboard'}),/Untrusted/);
  clipboard.read=async()=>[{types:['text/plain']}];
  await assert.rejects(paste({trusted:true},{action:'clipboard'}),/Copy a screenshot/);
  clipboard.read=async()=>{throw Error('Clipboard unavailable');};
  await assert.rejects(paste({trusted:true},{action:'clipboard'}),/Clipboard unavailable/);
});

test('screenshot paste remains compatible with earlier Electron clipboard API',async()=>{
  const handlers=new Map(),png=Buffer.from('legacy PNG');
  registerWorkspaceIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},trusted:()=>true,clipboard:{readImage:()=>({isEmpty:()=>false,toPNG:()=>png})},service:()=>({importBuffers:async files=>files})});
  const result=await handlers.get('atlas:attachments')({}, {action:'clipboard'});
  assert.deepEqual(result[0].bytes,png);
});
test('dirty projects offer direct editing before a task without changing files, commits or staging',async t=>{
 const dir=await temporary(t),repo=path.join(dir,'project');await fs.mkdir(repo);const service=createWorkspaceService(path.join(dir,'data'));await fs.writeFile(path.join(repo,'app.js'),'original');await service.initializeRepository(repo);
 const git=args=>command('git',['-C',repo,...args]);await fs.writeFile(path.join(repo,'app.js'),'staged');await git(['add','--','app.js']);await fs.writeFile(path.join(repo,'app.js'),'working edits');await fs.writeFile(path.join(repo,'notes.txt'),'untracked work');
 const before={head:await git(['rev-parse','HEAD']),index:await git(['write-tree']),status:await git(['status','--porcelain'])};assert.equal((await service.repository(repo)).dirty,true);
 let response=1,prompt;const handlers=new Map();registerWorkspaceIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},trusted:()=>true,window:()=>null,service:()=>service,dialog:{showMessageBox:async(_window,options)=>{prompt=options;return {response};}}});const prepare=handlers.get('atlas:prepare-project');
 assert.equal((await prepare({},{cwd:repo})).ready,false);assert.equal(prompt.defaultId,1);assert.match(prompt.buttons[0],/Edit selected folder/);response=0;assert.deepEqual(await prepare({},{cwd:repo}),{ready:true,isolated:false});
 assert.equal(await git(['rev-parse','HEAD']),before.head);assert.equal(await git(['write-tree']),before.index);assert.equal(await git(['status','--porcelain']),before.status);assert.equal(await fs.readFile(path.join(repo,'app.js'),'utf8'),'working edits');assert.equal(await fs.readFile(path.join(repo,'notes.txt'),'utf8'),'untracked work');await assert.rejects(service.createWorktree(repo),/clean Git checkout/);
});
