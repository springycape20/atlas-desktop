// Explicit opt-in first-install smoke test. Downloads the runtime, lists tools,
// and closes the server. Does not capture the screen or operate any apps.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createIntegrationService,windowsPreset}=require('../integration-service');
(async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-windows-tools-')),service=createIntegrationService({directory,approvals:{ask:async()=>null}});try{
 console.log('Installing isolated Windows tool runtime…');await service.installRuntime();await service.save(windowsPreset);console.log('Starting Windows-MCP and checking published tool schemas…');const result=await service.start('windows');assert(result.tools.length>0);console.log('Windows-MCP ready; tools: '+result.tools.map(tool=>tool.name).join(', '));
}finally{await service.close();await fs.rm(directory,{recursive:true,force:true});}})().catch(error=>{console.error(error.message);process.exitCode=1;});
