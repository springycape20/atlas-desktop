const {command}=require('./workspace-service');
function pluginRows(provider,data){const rows=Array.isArray(data)?data:data.installed||data.plugins||data.data||[];return rows.filter(row=>row.installed!==false).slice(0,250).map(row=>({provider,id:String(row.id||row.pluginId||row.name||''),name:String(row.name||row.id||row.pluginId||'Plugin'),version:String(row.version||row.localVersion||''),enabled:row.enabled!==false,scope:String(row.scope||row.source?.source||'provider'),status:row.enabled===false?'Disabled in provider':'Installed · provider managed'}));}
function createPluginDiscovery({findCodex,findClaude,codex,execute=command}){
  const run=(provider,exe,args,cwd)=>{const spec=provider==='claude'?require('./claude-runtime').launch(exe,args):{executable:exe,args};return execute(spec.executable,spec.args,cwd,{timeout:15000,...(spec.env?{env:spec.env}:{})});};
  async function list(cwd){const plugins=[],errors=[];
    await Promise.all([['codex',findCodex()],['claude',findClaude()]].map(async([provider,exe])=>{if(!exe){errors.push(provider+': CLI is not installed.');return;}try{plugins.push(...pluginRows(provider,JSON.parse(await run(provider,exe,['plugin','list','--json'],cwd))));}catch{errors.push(provider+': This CLI could not list plugins. Update it or manage plugins in its own app.');}}));
    const apps=[],servers=[],skills=[];
    try{const result=await codex('app/installed',{forceRefresh:true});for(const app of result.apps||[])apps.push({id:app.id,name:app.runtimeName||app.id,enabled:app.enabled===true,callable:app.callable===true});}catch{errors.push('Codex connector availability could not be verified. Desktop-only integrations may require the provider app.');}
    try{const result=await codex('skills/list',{cwds:cwd?[cwd]:[],forceReload:true});for(const group of result.data||[])for(const skill of group.skills||[])skills.push({name:skill.name,description:skill.description,enabled:skill.enabled!==false});}catch{}
    try{let cursor;do{const result=await codex('mcpServerStatus/list',{limit:100,...(cursor?{cursor}:{})});for(const row of result.data||[])servers.push({name:row.name,authStatus:row.authStatus,tools:Object.keys(row.tools||{}).length});cursor=result.nextCursor;}while(cursor&&servers.length<300);}catch{}
    return {plugins,apps,servers,skills:skills.slice(0,250),errors,checkedAt:Date.now()};
  }
  async function toggle(request){if(request.provider!=='claude'||!/^[a-zA-Z0-9@._-]{1,200}$/.test(request.id||''))throw Error('Manage this plugin in its provider app.');const exe=findClaude();if(!exe)throw Error('Claude Code is not installed.');await run('claude',exe,['plugin',request.enabled?'enable':'disable',request.id],request.cwd);return list(request.cwd);}
  return {list,toggle};
}
module.exports={createPluginDiscovery,pluginRows};
