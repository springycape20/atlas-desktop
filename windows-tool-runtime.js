// PyPI 0.8.8 predates the documented control launch options. Keep the ATLAS
// preset on one immutable upstream build so discovery and actions share schemas.
const REVISION='0db91ff6e64f35707ce4a401aa2ce4476e7ef59d';
const SHA256='91481bf9189a8ceef992db4eaa8f810afb509bade5aa160b44a6eb9c432bfd94';
const SOURCE='https://github.com/CursorTouch/Windows-MCP/archive/'+REVISION+'.zip#sha256='+SHA256;
function isManagedPreset(row){return row.id==='windows'&&row.command==='uvx'&&Array.isArray(row.args)&&row.args.length===4&&row.args[0]==='--python'&&row.args[1]==='3.14'&&row.args[2]==='windows-mcp'&&row.args[3]==='serve';}
function apply(spec){const index=spec.args.indexOf('windows-mcp');if(index<0||spec.args.includes('--from'))throw Error('The ATLAS Windows runtime requires the built-in preset.');spec.args=[...spec.args.slice(0,index),'--from',SOURCE,...spec.args.slice(index)];return {name:'ATLAS managed Windows-MCP',revision:REVISION,source:SOURCE};}
function assertDisabled(result){let status=result?.structuredContent;if(!status)try{status=JSON.parse((result.content||[]).find(row=>row.type==='text')?.text||'null');}catch{}if(result?.isError||status?.enabled!==false||status?.state!=='disabled')throw Error('Windows-MCP did not confirm active-user takeover. No desktop action was submitted. Start / check the ATLAS Windows integration again.');return status;}
module.exports={REVISION,SOURCE,SHA256,isManagedPreset,apply,assertDisabled};
