const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fingerprint(cwd,{maxFiles=5000,maxBytes=32000000,cache=null,strict=true,metrics=null}={}){
  const root=await fs.realpath(cwd),rows=[],visited=new Set(),seen=new Set();let files=0,bytes=0,complete=true;
  const statKey=stat=>[stat.size,stat.mtimeNs,stat.ctimeNs,stat.ino,stat.mode].map(String).join(':');
  async function walk(folder,gitMetadata=false){
    const canonical=await fs.realpath(folder);if(visited.has(canonical))return;visited.add(canonical);
    for(const item of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(++files>maxFiles||bytes>maxBytes){complete=false;return;}
      const file=path.join(folder,item.name);if(item.isSymbolicLink()){complete=false;continue;}
      if(item.isDirectory()){await walk(file,gitMetadata||item.name==='.git');if(files>maxFiles||bytes>maxBytes)return;}
      else if(item.isFile()){
        const stat=await fs.stat(file,{bigint:true});bytes+=Number(stat.size);if(bytes>maxBytes){complete=false;return;}
        seen.add(file);const key=statKey(stat),old=cache?.get(file);let entry;
        if(!strict&&old?.key===key){entry=old;if(metrics)metrics.cacheHits=(metrics.cacheHits||0)+1;}
        else{const data=await fs.readFile(file);if(metrics)metrics.bytesRead=(metrics.bytesRead||0)+data.length;const after=await fs.stat(file,{bigint:true});if(statKey(after)!==key){complete=false;cache?.delete(file);continue;}entry={key,hash:hash(data),text:item.name==='.git'||item.name==='commondir'?data.toString('utf8'):null};cache?.set(file,entry);}
        rows.push([path.relative(root,file),entry.hash,Number(stat.mode)&511]);
        // Worktree Git directories live outside the checkout. Include both their
        // per-worktree index/HEAD and shared objects/config/refs within the same caps.
        if(item.name==='.git'&&path.dirname(file)===root){const match=entry.text.trim().match(/^gitdir: (.+)$/);if(!match){complete=false;continue;}await walk(path.resolve(folder,match[1]),true);}
        else if(gitMetadata&&item.name==='commondir'){const target=entry.text.trim();if(!target||target.includes('\0'))complete=false;else await walk(path.resolve(folder,target),true);}
      }else complete=false;
    }
  }
  try{await walk(root);}catch{complete=false;}
  if(cache){if(complete){for(const key of cache.keys())if(!seen.has(key))cache.delete(key);}if(cache.size>maxFiles)cache.clear();}
  return {complete,value:complete?hash(JSON.stringify(rows)):null};
}
function createVerificationRunner({project,cwd,run,readFingerprint,previous=null,reuse=false,environment=process.env}){
  const cache=new Map();readFingerprint ||= options=>fingerprint(cwd,{cache,...options});
  let saved=previous;
  const config=hash(JSON.stringify({cwd,commands:project?.checkCommands||'',autoCheck:project?.autoCheck,platform:process.platform,runtime:process.version,environment}));
  return async()=>{
    if(!reuse||!project?.autoCheck)return run();
    let before;
    if(saved?.config===config&&saved.result?.status==='passed'){
      const candidate=await readFingerprint({strict:false});
      if(candidate.complete&&candidate.value&&saved.fingerprint===candidate.value){
        before=await readFingerprint({strict:true});if(before.complete&&before.value===candidate.value)return {...structuredClone(saved.result),reused:true,reason:'Reused passed ATLAS checks after strict content verification of the complete snapshot, commands and environment.'};
      }
    }
    before ||= await readFingerprint({strict:true});
    const result=await run(),after=await readFingerprint({strict:true});
    if(result.status==='passed'&&before.complete&&after.complete&&before.value===after.value)saved={config,fingerprint:after.value,result:structuredClone(result)};else saved=null;
    return {...result,reused:false};
  };
}
module.exports={fingerprint,createVerificationRunner};
