const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{HistoryClient}=require('../history-client');
const {createChatImporter,registerChatImportIpc}=require('../chat-import'),{jsonl,claudeExport}=require('../transcript-import');
async function fixture(t){const home=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-import-'));t.after(()=>fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100}));const client=new HistoryClient({home});t.after(()=>client.close());let state=[],queue=Promise.resolve();const transaction=change=>{const op=queue.then(async()=>{const copy=structuredClone(state),next=await change(copy);state=next;});queue=op.catch(()=>{});return op;};return {home,client,transaction,get state(){return state;},set state(value){state=value;}};}
const id='a'.repeat(64),claudeId='b'.repeat(64);
test('text imports exclude tools, private reasoning and Codex commentary, and report bounds',()=>{
 const rows=[{type:'session_meta',payload:{id:'codex-session',cwd:'C:\\project'}},{type:'response_item',payload:{role:'assistant',phase:'commentary',content:'public progress'}},{type:'response_item',payload:{role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'final answer'},{type:'thinking',text:'private'},{type:'tool_result',text:'tool output'}]}},...Array.from({length:85},(_,i)=>({type:'response_item',payload:{role:'user',content:'message '+i}}))];
 const chat=jsonl('codex',rows.map(row=>JSON.stringify(row)).join('\n'),{id,updatedAt:1});assert.equal(chat.turns.length,80);assert.equal(chat.originalTurnCount,86);assert.equal(chat.truncated,true);assert(!JSON.stringify(chat).includes('private'));assert.equal(chat.sessionId,'codex-session');
 const claude=jsonl('claude',[{type:'assistant',uuid:'same',message:{content:[{type:'text',text:'partial'}]}},{type:'assistant',uuid:'same',message:{content:[{type:'text',text:'complete'},{type:'thinking',thinking:'secret'}]}},{type:'user',isSidechain:true,message:{content:'sidechain'}}].map(row=>JSON.stringify(row)).join('\n'),{id:claudeId});assert.equal(claude.turns.length,1);assert.equal(claude.turns[0].content,'complete');
 const clipped=jsonl('claude',JSON.stringify({type:'user',message:{content:'x'.repeat(13000)}}),{id});assert.equal(clipped.turns[0].content.length,12000);assert.equal(clipped.truncated,true);
 const subagent=jsonl('codex',[{type:'session_meta',payload:{source:{subagent:{parent_thread_id:'parent'}}}},{type:'response_item',payload:{role:'user',content:'subagent work'}}].map(row=>JSON.stringify(row)).join('\n'),{id});assert.equal(subagent.turns.length,0);
});
test('Claude exports support desktop/web text chats without treating tool or thinking blocks as messages',()=>{
 const chats=claudeExport(JSON.stringify([{uuid:'web-chat',name:'My project',chat_messages:[{sender:'human',text:'Continue this project'},{sender:'assistant',content:[{type:'text',text:'Here is the plan'},{type:'thinking',text:'private'}]}]}]));assert.equal(chats.length,1);assert.equal(chats[0].title,'My project');assert.equal(chats[0].turns.length,2);assert(!JSON.stringify(chats).includes('private'));assert.throws(()=>claudeExport('{"secrets":[]}'),/not a supported/);
 assert.throws(()=>claudeExport('null'),/not a supported/);assert.equal(claudeExport('\uFEFF'+JSON.stringify([{uuid:'bom',chat_messages:[null,{sender:'human',text:'Windows export'}]}]))[0].turns[0].content,'Windows export');
});
test('local native histories and archived Codex sessions can be imported and continued as independent copies',async t=>{
 const f=await fixture(t),sessions=path.join(f.home,'.codex','archived_sessions'),projects=path.join(f.home,'.claude','projects','project');await fs.mkdir(sessions,{recursive:true});await fs.mkdir(projects,{recursive:true});
 const codexFile=path.join(sessions,'chat.jsonl'),raw=[{type:'session_meta',payload:{id:'native-codex',cwd:f.home}},{type:'response_item',payload:{role:'user',content:'Build a game'}},{type:'response_item',payload:{role:'assistant',phase:'final_answer',content:'Created the game'}}].map(row=>JSON.stringify(row)).join('\n');await fs.writeFile(codexFile,raw);
 await fs.writeFile(path.join(projects,'chat.jsonl'),JSON.stringify({type:'user',sessionId:'native-claude',cwd:'Z:\\missing-folder',message:{content:'Review my game'}}));
 const importer=createChatImporter({history:f.client,transaction:f.transaction,home:f.home}),scan=await importer.scan();assert.equal(scan.chats.length,2);assert.equal(scan.errors.length,0);
 const request={chats:scan.chats.map(({provider,id})=>({provider,id}))},result=await importer.commit(request);assert.equal(result.imported,2);assert.equal(f.state.length,2);assert(f.state.every(chat=>chat.id!==chat.importSource.sessionId));assert.deepEqual(f.state[0].sessions,{codex:'',claude:''});assert(f.state.every(chat=>chat.cwd===f.home));assert.equal(await fs.readFile(codexFile,'utf8'),raw);
 const second=await importer.commit(request);assert.equal(second.imported,0);assert.equal(second.skipped,2);assert.equal(f.state.length,2);
});
test('file import requires the native picker, previews before writing, and deduplicates concurrent requests',async t=>{
 const f=await fixture(t),file=path.join(f.home,'conversations.json');await fs.writeFile(file,JSON.stringify([{uuid:'export-chat',name:'Existing plan',chat_messages:[{sender:'human',text:'Use this plan'}]}]));
 const importer=createChatImporter({history:f.client,transaction:f.transaction,home:f.home,dialog:{showOpenDialog:async()=>({filePaths:[file]})},window:()=>null});const chosen=await importer.chooseFile();assert.equal(f.state.length,0);assert.equal(chosen.chats[0].fromFile,true);assert.equal((await importer.read(chosen.chats[0])).turns[0].content,'Use this plan');
 const results=await Promise.all([importer.commit({chats:chosen.chats}),importer.commit({chats:chosen.chats})]);assert.equal(results.reduce((n,result)=>n+result.imported,0),1);assert.equal(f.state.length,1);assert.equal((await fs.readFile(file,'utf8')).includes('Use this plan'),true);
 await assert.rejects(importer.read({provider:'claude',id:'../credentials',fromFile:true}),/Choose/);
});
test('import capacity failures preserve existing conversations and cancellations do not write',async t=>{
 const f=await fixture(t);f.state=Array.from({length:100},(_,i)=>({id:String(i),turns:[]}));const importer=createChatImporter({history:{request:async()=>({id,provider:'codex',sessionId:'new',turns:[{role:'user',content:'new'}]})},transaction:f.transaction,home:f.home,dialog:{showOpenDialog:async()=>({canceled:true})},window:()=>null});
 await assert.rejects(importer.commit({chats:[{provider:'codex',id}]}),/room for 0/);assert.equal(f.state.length,100);assert.equal((await importer.chooseFile()).cancelled,true);
 const handlers=new Map();registerChatImportIpc({ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},trusted:()=>false});await assert.rejects(handlers.get('atlas:history-import')({},{action:'import'}),/Untrusted/);
});
test('selected transcript files recognize Codex JSONL and reject malformed or oversized files',async t=>{
 const f=await fixture(t),file=path.join(f.home,'chat.jsonl');await fs.writeFile(file,JSON.stringify({type:'response_item',payload:{role:'user',content:'hello'}}));assert.equal((await f.client.request('import-file',{file}))[0].provider,'codex');await fs.writeFile(file,'not a transcript');await assert.rejects(f.client.request('import-file',{file}),/not a recognized/);await fs.writeFile(file,'');await fs.truncate(file,32000001);await assert.rejects(f.client.request('import-file',{file}),/under 32 MB/);
});
test('full imports preserve long histories for either destination without creating Assistant copies for Colab',async t=>{
 const f=await fixture(t),folder=path.join(f.home,'.codex','sessions');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'long.jsonl'),messages=Array.from({length:122},(_,i)=>({type:'response_item',payload:{role:i%2?'assistant':'user',content:i===0?'x'.repeat(15000):'Message '+i}}));await fs.writeFile(file,[{type:'session_meta',payload:{id:'long-native',cwd:f.home}},...messages].map(row=>JSON.stringify(row)).join('\n'));
 const importer=createChatImporter({history:f.client,transaction:f.transaction,home:f.home}),selected=(await importer.scan()).chats[0];
 assert.equal((await f.client.request('read',{provider:'codex',id:selected.id})).turns.length,80);
 const full=await importer.read(selected);assert.equal(full.turns.length,122);assert.equal(full.turns[0].content.length,15000);assert.equal(full.truncated,false);
 const colab=await importer.commit({destination:'colab',chats:[selected]});assert.equal(colab.chats[0].turns.length,122);assert.equal(f.state.length,0);
 await assert.rejects(importer.commit({destination:'invalid',chats:[selected]}),/Assistant or Colab/);
 const assistant=await importer.commit({destination:'assistant',chats:[selected]});assert.equal(assistant.imported,1);assert.equal(f.state[0].turns.length,122);assert.equal(f.state[0].turns[0].content.length,15000);
});
test('selected Claude exports keep the first message and full long replies',async t=>{
 const f=await fixture(t),file=path.join(f.home,'conversations.json');await fs.writeFile(file,JSON.stringify([{uuid:'long-export',name:'Full export',chat_messages:Array.from({length:124},(_,i)=>({sender:i%2?'assistant':'human',text:i===1?'y'.repeat(14000):'Message '+i}))}]));
 const chats=await f.client.request('import-file',{file});assert.equal(chats[0].turns.length,124);assert.equal(chats[0].turns[0].content,'Message 0');assert.equal(chats[0].turns[1].content.length,14000);
});
