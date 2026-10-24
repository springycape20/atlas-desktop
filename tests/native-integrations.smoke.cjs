// Explicit native handshake smoke test. No model turn or desktop action is run.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createIntegrationService}=require('../integration-service'),{createApprovalManager}=require('../approval-manager');
const {CodexConnection}=require('../codex-connection'),{ClaudeConnection}=require('../claude-connection');
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-native-tools-')),service=createIntegrationService({directory,approvals:createApprovalManager()});let codex,claude;
 try{
  const root=path.join(os.homedir(),'AppData','Local','OpenAI','Codex','bin'),entries=await fs.readdir(root),candidates=[];
  for(const entry of entries){const exe=path.join(root,entry,'codex.exe');try{candidates.push({exe,at:(await fs.stat(exe)).mtimeMs});}catch{}}
  const cb=await service.bind({provider:'codex',owner:'smoke',job:{id:'native-codex'}});codex=new CodexConnection(candidates.sort((a,b)=>b.at-a.at)[0].exe);await codex.connect();
  const result=await codex.request('thread/start',{cwd:path.resolve(__dirname,'..'),ephemeral:true,sandbox:'read-only',approvalPolicy:'on-request',config:{'mcp_servers.atlas_tools':{url:cb.config.url,http_headers:cb.config.headers,enabled:true,required:true}}},60000);
  assert(result.thread?.id);console.log('Codex: native thread/start accepted the required ATLAS MCP connection.');
  await assert.rejects(codex.request('thread/start',{cwd:path.resolve(__dirname,'..'),ephemeral:true,sandbox:'read-only',approvalPolicy:'on-request',config:{'mcp_servers.atlas_tools':{url:'http://127.0.0.1:1/mcp',enabled:true,required:true,startup_timeout_sec:1}}},15000),/MCP|mcp|server|connect|initializ/i);
  console.log('Codex: unavailable required MCP correctly rejects startup.');
  // Status may be scoped to app configuration; only print the managed entry when present.
  const status=await codex.request('mcpServerStatus/list',{limit:100});const managed=status.data?.find(row=>row.name==='atlas_tools');if(managed)console.log('Codex managed MCP tools:',Object.keys(managed.tools||{}).length);
  const clb=await service.bind({provider:'claude',owner:'smoke',job:{id:'native-claude'}});claude=new ClaudeConnection({executable:require('../claude-runtime').findClaude(),cwd:path.resolve(__dirname,'..'),settings:{atlasMcp:clb.config},handshakeMs:60000});await claude.connect();
  let info;for(let i=0;i<8;i++){info=await claude.request({subtype:'mcp_status'});const row=(info.mcpServers||info.mcp_servers||[]).find(row=>row.name==='atlas_tools');if(row?.status==='connected'){console.log('Claude: native MCP connection ready.');break;}await new Promise(resolve=>setTimeout(resolve,500));}
  const row=(info.mcpServers||info.mcp_servers||[]).find(row=>row.name==='atlas_tools');assert.equal(row?.status,'connected','Claude must report atlas_tools connected');
 }finally{codex?.close();claude?.close();await service.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
