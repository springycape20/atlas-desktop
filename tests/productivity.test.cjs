const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createTaskQueue}=require('../task-queue'),{createApprovalManager,codexApproval}=require('../approval-manager'),{createClaudeControl}=require('../claude-control'),{createChangeTracker}=require('../change-tracker'),{detectProject,completionChecks,runCheck}=require('../project-tools'),{createCollaboration}=require('../collaboration'),{createPluginDiscovery,pluginRows}=require('../plugin-discovery'),{registerProductivityIpc}=require('../productivity-ipc');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Condition did not become true.');}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-productivity-')),cwd=path.join(root,'project');await fs.mkdir(cwd);t.after(()=>fs.rm(root,{force:true,recursive:true}));return {root,cwd};}
test('queue persists ordering, pauses between tasks and never auto-resumes after restart',async t=>{
  const {root,cwd}=await fixture(t);let allow=false;const runs=[],queue=createTaskQueue({directory:root,canRun:()=>allow,run:async row=>{runs.push(row.prompt);return {jobId:'job'};}});
  const add=prompt=>queue.action({action:'add',task:{cwd,prompt}});await add('first');const second=(await add('second')).items[1];await queue.action({action:'move',id:second.id,direction:'up'});await queue.action({action:'start',pauseBetween:true});assert.equal(runs.length,0);allow=true;await queue.tick();assert.deepEqual(runs,['second']);assert.equal((await queue.action()).paused,true);await queue.close();
  const restored=createTaskQueue({directory:root,run:async()=>assert.fail('Restart must stay paused')});assert.equal((await restored.action()).paused,true);assert.equal((await restored.action()).items[1].prompt,'first');await restored.close();
});
test('failed queue tasks pause and retry requires an explicit action',async t=>{
  const {root,cwd}=await fixture(t);let enabled=false;const queue=createTaskQueue({directory:root,canRun:()=>enabled,run:async()=>{throw Error('provider unavailable');}});await queue.action({action:'add',task:{cwd,prompt:'task'}});await queue.action({action:'start',pauseBetween:false});enabled=true;await queue.tick();const state=await queue.action();assert.equal(state.paused,true);assert.equal(state.items[0].status,'failed');await queue.action({action:'retry',id:state.items[0].id});assert.equal((await queue.action()).items[0].status,'queued');await queue.close();
});

test('an incomplete Colab result pauses the queue even when completion checks did not fail',async t=>{
 const {root,cwd}=await fixture(t);let enabled=false;const queue=createTaskQueue({directory:root,canRun:()=>enabled,run:async()=>({jobId:'job',needsAttention:true,reason:'Review stalled.'})});await queue.action({action:'add',task:{cwd,prompt:'task'}});await queue.action({action:'start',pauseBetween:false});enabled=true;await queue.tick();const state=await queue.action();assert.equal(state.paused,true);assert.equal(state.items[0].status,'needs-review');assert.equal(state.items[0].error,'Review stalled.');await queue.close();
});
test('approvals require offered choices and cancellation resolves only the matching task',async()=>{
  const manager=createApprovalManager(),controller=new AbortController(),one=manager.ask({jobId:'one',provider:'codex',title:'Command',signal:controller.signal}),two=manager.ask({jobId:'two',provider:'claude',title:'Tool'});
  assert.throws(()=>manager.answer(manager.list()[0].id,'invented'),/offered/);controller.abort();assert.equal(await one,null);assert.equal(manager.list().length,1);manager.answer(manager.list()[0].id,'Allow once');assert.equal(await two,'Allow once');assert.throws(()=>manager.answer('expired','Allow once'),/expired/);
});
test('Codex command and permission approvals grant only the requested action',async()=>{
  const manager=createApprovalManager(),job={id:'task'},command=codexApproval(manager,job,'item/commandExecution/requestApproval',{command:'npm test'});manager.answer(manager.list()[0].id,'Allow once');assert.deepEqual(await command,{decision:'accept'});
  const permissions=codexApproval(manager,job,'item/permissions/requestApproval',{permissions:{network:{enabled:true}}});manager.answer(manager.list()[0].id,'Deny');assert.deepEqual(await permissions,{permissions:{},scope:'turn'});
});
test('Claude stream control waits for approval and preserves the exact input',async()=>{
  const writes=[],manager=createApprovalManager(),control=createClaudeControl({write:text=>writes.push(JSON.parse(text)),manager,job:{id:'task'}}),event=JSON.stringify({type:'control_request',request_id:'req',request:{subtype:'can_use_tool',tool_name:'Bash',input:{command:'npm test'}}})+'\n';
  control.push(event.slice(0,20));control.push(event.slice(20));assert.equal(writes.length,0);manager.answer(manager.list()[0].id,'Allow once');await tick();assert.equal(writes[0].response.request_id,'req');assert.deepEqual(writes[0].response.response,{behavior:'allow',updatedInput:{command:'npm test'}});
});
test('checkpoint undo restores task edits and deletions, preserves unrelated later files and saves recovery',async t=>{
  const {root,cwd}=await fixture(t),tracker=createChangeTracker(path.join(root,'data'));await fs.writeFile(path.join(cwd,'app.js'),'preexisting edits\n');await fs.writeFile(path.join(cwd,'deleted.txt'),'restore me\n');await tracker.capture('task',cwd);await fs.writeFile(path.join(cwd,'app.js'),'agent changes\n');await fs.unlink(path.join(cwd,'deleted.txt'));await fs.writeFile(path.join(cwd,'created.txt'),'agent file\n');await tracker.seal('task');await fs.writeFile(path.join(cwd,'unrelated.txt'),'later user work\n');
  const preview=await tracker.restorePreview('task');assert.equal(preview.files.length,3);const result=await tracker.restore('task',preview.token);assert.equal(await fs.readFile(path.join(cwd,'app.js'),'utf8'),'preexisting edits\n');assert.equal(await fs.readFile(path.join(cwd,'deleted.txt'),'utf8'),'restore me\n');assert.equal(await fs.readFile(path.join(cwd,'unrelated.txt'),'utf8'),'later user work\n');await assert.rejects(fs.stat(path.join(cwd,'created.txt')),/ENOENT/);assert.equal((await tracker.restorePreview(result.backupId)).files.length,3);
});
test('checkpoint undo rejects later edits and binary originals without changing files',async t=>{
  const {root,cwd}=await fixture(t),tracker=createChangeTracker(path.join(root,'data')),file=path.join(cwd,'app.js');await fs.writeFile(file,'before');await tracker.capture('task',cwd);await fs.writeFile(file,'agent');await tracker.seal('task');await fs.writeFile(file,'later user edit');await assert.rejects(tracker.restorePreview('task'),/Later edits/);assert.equal(await fs.readFile(file,'utf8'),'later user edit');
  const binary=path.join(cwd,'photo.bin');await fs.writeFile(binary,Buffer.from([0,1]));await tracker.capture('binary',cwd);await fs.writeFile(binary,Buffer.from([0,2]));await tracker.seal('binary');await assert.rejects(tracker.restorePreview('binary'),/binary or large/);
});
test('project detection suggests actual scripts; completion checks are opt-in and report failures',async t=>{
  const {cwd}=await fixture(t);await fs.writeFile(path.join(cwd,'package.json'),JSON.stringify({scripts:{test:'node test.js',build:'node build.js'}}));await fs.writeFile(path.join(cwd,'package-lock.json'),'{}');const info=await detectProject(cwd);assert.deepEqual(info.checks,['npm run test','npm run build']);assert.deepEqual(info.installs,['npm ci']);let ran=0;
  assert.equal((await completionChecks({checkCommands:'test',autoCheck:false},cwd,{runner:async()=>{ran++;}})).status,'not-checked');assert.equal(ran,0);
  const result=await completionChecks({checkCommands:'one\ntwo',autoCheck:true},cwd,{runner:async command=>({command,status:++ran===1?'passed':'failed',exitCode:ran===1?0:1})});assert.equal(result.status,'failed');assert.equal(result.results.length,2);
});
test('configured command checks execute in the chosen folder and report real exit codes',async t=>{
  const {cwd}=await fixture(t);await fs.writeFile(path.join(cwd,'check-cwd.txt'),'ATLAS_CHECK_CWD_MARKER');const success=await runCheck(process.platform==='win32'?"Get-Content -LiteralPath 'check-cwd.txt'":'cat check-cwd.txt',cwd);assert.equal(success.status,'passed');assert(success.output.includes('ATLAS_CHECK_CWD_MARKER'));const failure=await runCheck('exit 7',cwd);assert.equal(failure.status,'failed');assert.equal(failure.exitCode,7);
});
test('Colab role selection reverses providers and keeps reviewers read-only',async()=>{
  const passes=[],run=createCollaboration({progress:()=>{},runProvider:async(provider,prompt,cwd,settings)=>{passes.push({provider,prompt,settings});return {output:'Complete\nATLAS_COLAB_READY'};}});await run({task:'build',cwd:'.',roles:'claude-builds',settings:{}});assert.deepEqual(passes.map(p=>p.provider),['claude','codex']);assert.equal(passes[1].settings.readOnly,true);assert.match(passes[1].prompt,/You are the final reviewer/);
  passes.length=0;await run({task:'build',cwd:'.',roles:'proposals',settings:{}});assert.equal(passes.length,4);assert.equal(passes[0].settings.readOnly,true);assert.equal(passes[1].settings.readOnly,true);assert(!passes[1].prompt.includes('CODEX REPORT'));assert.equal(passes[2].settings.readOnly,undefined);
});
test('plugin discovery returns metadata without executable paths or credentials',async()=>{
  const service=createPluginDiscovery({findCodex:()=>'/codex',findClaude:()=>'/claude',execute:async()=>JSON.stringify([{id:'example',enabled:true,installPath:'private sentinel',token:'private sentinel'}]),codex:async method=>method==='app/installed'?{apps:[{id:'app',runtimeName:'Example',enabled:true,callable:false,secret:'private sentinel'}]}:method==='skills/list'?{data:[]}:{data:[]}}),result=await service.list();assert.equal(result.plugins.length,2);assert.equal(result.apps[0].callable,false);assert(!JSON.stringify(result).includes('private sentinel'));
});
test('Codex plugin catalog entries are not shown as installed and free-text questions are supported',async()=>{
  assert.equal(pluginRows('codex',{installed:[{pluginId:'local',installed:true}],available:[{pluginId:'remote',installed:false}]}).length,1);
  const manager=createApprovalManager(),question=codexApproval(manager,{id:'task'},'item/tool/requestUserInput',{questions:[{id:'name',header:'Project',question:'Name?'}]});
  assert.throws(()=>manager.answer(manager.list()[0].id,'Send answer',''),/Enter an answer/);manager.answer(manager.list()[0].id,'Send answer','My project');assert.deepEqual(await question,{answers:{name:{answers:['My project']}}});
});
test('productivity endpoints reject untrusted renderers before running commands or editing queue',async t=>{
  const {root}=await fixture(t),handlers=new Map(),service=registerProductivityIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},app:{getPath:()=>root},window:()=>null,trusted:()=>false,workspace:()=>({}),jobs:()=>[],approvals:createApprovalManager(),findCodex:()=>null,findClaude:()=>null,codex:async()=>({}),history:async()=>[],run:async()=>{},canRun:()=>false});
  for(const [name,handler]of handlers)await assert.rejects(handler({},{}),/Untrusted/,name);await service.close();
});
