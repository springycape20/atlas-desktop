const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {createIntegrationService,validateIntegration}=require('../integration-service');
const {createApprovalManager}=require('../approval-manager');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function fixture(t,options={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-tools-')),approvals=createApprovalManager();
 const events=[],service=createIntegrationService({directory,approvals,activity:(job,event)=>events.push({job:job.id,...event}),...options});
 const controller=new AbortController(),job={id:'task-one',signal:controller.signal};
 const binding=await service.bind({provider:'codex',owner:'colab:one',job,signal:controller.signal});
 const client=new Client({name:'test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(binding.config.url),{requestInit:{headers:binding.config.headers}}));
 t.after(async()=>{controller.abort();binding.release();await client.close();await service.close();await fs.rm(directory,{recursive:true,force:true});});
 const call=(name,args)=>client.callTool({name,arguments:args});
 const waitApproval=async()=>{for(let i=0;i<100&&!approvals.list().length;i++)await tick();assert(approvals.list().length,'approval expected');return approvals.list()[0];};
 return {directory,approvals,events,service,controller,job,binding,client,call,waitApproval};
}
const saved={id:'sample',name:'Example tools',command:process.execPath,args:[path.join(__dirname,'fixtures','integration-server.cjs')],enabled:true};
test('real stdio MCP server is discoverable through the HTTP bridge; actions need approval and preserve images',async t=>{
 const f=await fixture(t);await f.service.save(saved);
 assert.deepEqual((await f.client.listTools()).tools.map(tool=>tool.name),['integrations_list','integrations_add','integrations_start','integrations_call','integrations_stop']);
 const started=await f.call('integrations_start',{id:'sample'});assert.equal(JSON.parse(started.content[0].text).tools[0].name,'echo');
 const denied=f.call('integrations_call',{id:'sample',tool:'echo',arguments:{message:'secret'}}),approval=await f.waitApproval();assert.equal(approval.jobId,'task-one');assert.equal(f.events.length,0);f.approvals.answer(approval.id,'Deny');assert.equal((await denied).isError,true);assert.equal(f.events.length,0);
 const allowed=f.call('integrations_call',{id:'sample',tool:'echo',arguments:{message:'approved'}});f.approvals.answer((await f.waitApproval()).id,'Allow once');const result=await allowed;assert.equal(result.content[0].text,'approved');assert.equal(result.content[1].type,'image');assert.deepEqual(f.events.map(row=>row.status),['running','completed']);
});
test('disabled tools and read-only reviewers cannot execute integrations',async t=>{
 let connects=0;const f=await fixture(t,{connect:async()=>{connects++;throw Error('should not connect');}});await f.service.save({...saved,enabled:false});assert.equal((await f.call('integrations_start',{id:'sample'})).isError,true);assert.equal(connects,0);
 f.binding.release();const binding=await f.service.bind({provider:'codex',owner:'colab:one',job:f.job,readOnly:true,signal:f.controller.signal});t.after(()=>binding.release());assert.equal((await f.call('integrations_start',{id:'sample'})).isError,true);assert.equal(connects,0);assert.equal(f.approvals.list().length,0);
});
test('cancelling a task dismisses its pending tool approval and prevents replay',async t=>{
 const f=await fixture(t);await f.service.save(saved);await f.call('integrations_start',{id:'sample'});
 const result=f.call('integrations_call',{id:'sample',tool:'echo',arguments:{message:'must not run'}});await f.waitApproval();f.controller.abort();assert.equal((await result).isError,true);assert.equal(f.approvals.list().length,0);assert.equal(f.events.length,0);
});
test('disabling an integration while approval is pending blocks the already requested action',async t=>{
 const f=await fixture(t);await f.service.save(saved);await f.call('integrations_start',{id:'sample'});
 const result=f.call('integrations_call',{id:'sample',tool:'echo',arguments:{message:'must not run'}}),approval=await f.waitApproval();await f.service.enable('sample',false);f.approvals.answer(approval.id,'Allow once');assert.equal((await result).isError,true);assert.equal(f.events.length,0);
});
test('bridge rejects unauthenticated requests, browser origins and expired tasks',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.binding.config.url,{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(f.binding.config.url,{method:'POST',headers:{...f.binding.config.headers,Origin:'https://example.com'},body:'{}'})).status,403);
 f.binding.release();assert.equal((await f.call('integrations_list',{})).isError,true);
});
test('same provider chat keeps a stable bridge config; concurrent bindings are rejected',async t=>{
 const f=await fixture(t);await assert.rejects(f.service.bind({provider:'codex',owner:'colab:one',job:f.job}),/already working/);f.binding.release();
 const second=await f.service.bind({provider:'codex',owner:'colab:one',job:{id:'next'}}),claude=await f.service.bind({provider:'claude',owner:'colab:one',job:{id:'claude'}});t.after(()=>{second.release();claude.release();});assert.deepEqual(second.config,f.binding.config);assert.notDeepEqual(claude.config.headers,second.config.headers);assert.equal((await f.call('integrations_list',{})).isError,undefined);
});
test('integration config survives restart without starting a process',async t=>{
 const f=await fixture(t);await f.service.save(saved);let connected=false;const other=createIntegrationService({directory:f.directory,approvals:f.approvals,connect:async()=>{connected=true;}});t.after(()=>other.close());const result=await other.list();assert.equal(result.integrations[0].name,'Example tools');assert.equal(result.integrations[0].status,'Stopped');assert.equal(connected,false);
});
test('desktop integration requests require approval before adding or installing anything',async t=>{
 let installed=0;const f=await fixture(t,{platform:'win32',install:async()=>{installed++;}});const added=f.call('integrations_start',{id:'windows'});f.approvals.answer((await f.waitApproval()).id,'Deny');assert.equal((await added).isError,true);assert.equal(installed,0);assert.equal((await f.service.list()).integrations.length,0);
});
test('integration definitions reject invalid commands and unsupported transports',()=>{
 assert.throws(()=>validateIntegration({id:'../bad',command:'x'}),/ID/);assert.throws(()=>validateIntegration({id:'okay',command:'x\ncalc'}),/executable/);assert.throws(()=>validateIntegration({id:'okay',command:'x',args:'--foo'}),/array/);assert.throws(()=>validateIntegration({id:'okay',url:'file:///private'}),/HTTP/);assert.throws(()=>validateIntegration({id:'okay',url:'https://user:pass@example.com/mcp'}),/credentials/);
});
test('two approved providers cannot drive the desktop concurrently',async t=>{
 let finish,called=0;const f=await fixture(t,{connect:async()=>({tools:[{name:'hold',inputSchema:{type:'object'}}],call:async()=>{called++;await new Promise(resolve=>{finish=resolve;});return {content:[{type:'text',text:'done'}]};},close:async()=>{}})});await f.service.save(saved);await f.call('integrations_start',{id:'sample'});
 const first=f.call('integrations_call',{id:'sample',tool:'hold'});f.approvals.answer((await f.waitApproval()).id,'Allow once');while(!finish)await tick();
 const second=f.call('integrations_call',{id:'sample',tool:'hold'});f.approvals.answer((await f.waitApproval()).id,'Allow once');assert.equal((await second).isError,true);assert.equal(called,1);finish();assert.equal((await first).isError,undefined);
});
test('stopped tasks lose access even with provider permission bypass enabled',async t=>{
 const f=await fixture(t);f.job.stopped='cancelled';assert.equal((await f.call('integrations_start',{id:'windows'})).isError,true);assert.equal(f.approvals.list().length,0);
});
test('Colab can add a custom integration only after approval, without running it prematurely',async t=>{
 const f=await fixture(t);const denied=f.call('integrations_add',saved);f.approvals.answer((await f.waitApproval()).id,'Deny');assert.equal((await denied).isError,true);assert.equal((await f.service.list()).integrations.length,0);
 const allowed=f.call('integrations_add',saved);const approval=await f.waitApproval();assert(approval.details.includes(JSON.stringify(saved.command)));f.approvals.answer(approval.id,'Allow once');assert.equal((await allowed).isError,undefined);assert.equal((await f.service.list()).integrations[0].status,'Stopped');assert.equal(f.events.length,0);
});
