const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const USAGE_URLS={codex:'https://chatgpt.com/codex/cloud/settings/analytics#usage',claude:'https://claude.ai/settings/usage'};
const percent=value=>typeof value==='number'&&Number.isFinite(value)?Math.min(100,Math.max(0,value)):null;
const reset=value=>{const ms=typeof value==='number'?value*1000:typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(ms)&&ms>0?ms:null;};
function windowRow(id,label,used,resetsAt,main=true){const usedPercent=percent(used);return {id,label,usedPercent,remainingPercent:usedPercent===null?null:100-usedPercent,resetsAt:reset(resetsAt),main};}
function summary(provider,windows,plan=null){const main=windows.filter(row=>row.main&&row.remainingPercent!==null);return {provider,plan:typeof plan==='string'?plan.slice(0,60):null,windows,remainingPercent:main.length?Math.min(...main.map(row=>row.remainingPercent)):null,usageUrl:USAGE_URLS[provider]};}
function normalizeCodex(data){
  const byId=data?.rateLimitsByLimitId,entries=byId&&typeof byId==='object'?Object.entries(byId).filter(([,row])=>row&&typeof row==='object'):[];
  if(!entries.length&&data?.rateLimits)entries.push([data.rateLimits.limitId||'codex',data.rateLimits]);
  const preferred=entries.find(([id])=>id==='codex')||entries[0],rows=[];
  for(const [id,bucket]of entries.slice(0,20))for(const kind of ['primary','secondary']){
    const item=bucket[kind];if(!item)continue;const minutes=item.windowDurationMins;
    const label=minutes===10080?'Weekly · all models':minutes===300?'Session limit':Number.isFinite(minutes)?(minutes>=1440?Math.round(minutes/1440)+'-day limit':minutes>=60?Math.round(minutes/60)+'-hour limit':minutes+'-minute limit'):kind==='primary'?'Session limit':'Weekly limit';
    rows.push(windowRow(id+':'+kind,(id===preferred?.[0]?'':String(bucket.limitName||id).slice(0,80)+' · ')+label,item.usedPercent,item.resetsAt,id===preferred?.[0]));
  }
  return summary('codex',rows,preferred?.[1].planType);
}
function normalizeClaude(data,plan){
  const labels={five_hour:'Session limit',seven_day:'Weekly · all models',seven_day_opus:'Weekly · Opus',seven_day_sonnet:'Weekly · Sonnet',seven_day_oauth_apps:'Weekly · OAuth apps'};
  const rows=[];for(const [key,label]of Object.entries(labels))if(data?.[key])rows.push(windowRow(key,label,data[key].utilization,data[key].resets_at,key==='five_hour'||key==='seven_day'));
  return summary('claude',rows,plan);
}
async function readClaudeUsage({readFile=fs.readFile,fetchImpl=fetch,env=process.env,home=os.homedir()}={}){
  if(!env.CLAUDE_CODE_OAUTH_TOKEN&&(env.ANTHROPIC_API_KEY||env.CLAUDE_CODE_USE_BEDROCK||env.CLAUDE_CODE_USE_VERTEX))throw Error('Subscription limits are unavailable for this Claude API account.');
  let credentials={};try{credentials=JSON.parse(await readFile(path.join(env.CLAUDE_CONFIG_DIR||path.join(home,'.claude'),'.credentials.json'),'utf8'));}catch{}
  const oauth=credentials.claudeAiOauth,token=env.CLAUDE_CODE_OAUTH_TOKEN||oauth?.accessToken;
  if(typeof token!=='string'||!token)throw Error('Sign in to Claude Code to read plan usage.');
  let response;try{response=await fetchImpl('https://api.anthropic.com/api/oauth/usage',{headers:{Authorization:'Bearer '+token,'anthropic-beta':'oauth-2025-04-20'},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw Error('Claude usage could not be refreshed.');}
  if(!response.ok)throw Error([401,403].includes(response.status)?'Sign in to Claude Code again to refresh plan usage.':response.status===429?'Claude usage refresh is temporarily rate limited.':'Claude usage is temporarily unavailable.');
  let data;try{data=await response.json();}catch{throw Error('Claude returned an unreadable usage response.');}
  return normalizeClaude(data,oauth?.subscriptionType);
}
function createProviderUsage({codex,claude=readClaudeUsage,now=Date.now,notify=()=>{}}){
  const cache=new Map(),pending=new Map();
  function update(provider,result){const value={...result,updatedAt:now(),checkedAt:now(),stale:false,error:null};cache.set(provider,value);notify(value);return value;}
  async function get(provider,refresh){
    const old=cache.get(provider);if(old&&now()-old.checkedAt<(refresh?15000:60000))return old;
    if(pending.has(provider))return pending.get(provider);
    const promise=Promise.resolve().then(async()=>{try{return update(provider,provider==='codex'?normalizeCodex(await codex()):await claude());}
      catch(error){const value={...(old||summary(provider,[])),checkedAt:now(),updatedAt:old?.updatedAt||null,stale:true,error:provider==='claude'&&/^Sign in|^Subscription limits|^Claude (usage|returned)/.test(error.message)?error.message:'Codex usage is unavailable. Check that Codex is installed and signed in.'};cache.set(provider,value);notify(value);return value;}
      finally{pending.delete(provider);}});pending.set(provider,promise);return promise;
  }
  return {read:async({refresh=false}={})=>Object.fromEntries(await Promise.all(['claude','codex'].map(async provider=>[provider,await get(provider,refresh)]))),updateCodex:data=>update('codex',normalizeCodex(data))};
}
module.exports={USAGE_URLS,normalizeCodex,normalizeClaude,readClaudeUsage,createProviderUsage};
