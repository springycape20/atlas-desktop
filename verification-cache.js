const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fingerprint(cwd,{maxFiles=5000,maxBytes=32000000}={}){
  const root=await fs.realpath(cwd),rows=[],visited=new Set();let files=0,bytes=0,complete=true;
  async function walk(folder,gitMetadata=false){
    const canonical=await fs.realpath(folder);if(visited.has(canonical))return;visited.add(canonical);
    for(const item of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(++files>maxFiles||bytes>maxBytes){complete=false;return;}
      const file=path.join(folder,item.name);if(item.isSymbolicLink()){complete=false;continue;}
      if(item.isDirectory()){await walk(file,gitMetadata||item.name==='.git');if(files>maxFiles||bytes>maxBytes)return;}
      else if(item.isFile()){
        const stat=await fs.stat(file);bytes+=stat.size;if(bytes>maxBytes){complete=false;return;}
        const data=await fs.readFile(file);rows.push([path.relative(root,file),hash(data),stat.mode&511]);
        // Worktree Git directories live outside the checkout. Include both their
        // per-worktree index/HEAD and shared objects/config/refs within the same caps.
        if(item.name==='.git'&&path.dirname(file)===root){const match=data.toString('utf8').trim().match(/^gitdir: (.+)$/);if(!match){complete=false;continue;}await walk(path.resolve(folder,match[1]),true);}
        else if(gitMetadata&&item.name==='commondir'){const target=data.toString('utf8').trim();if(!target||target.includes('\0'))complete=false;else await walk(path.resolve(folder,target),true);}
      }else complete=false;
    }
  }
  try{await walk(root);}catch{complete=false;}
  return {complete,value:complete?hash(JSON.stringify(rows)):null};
}
function createVerificationRunner({project,cwd,run,readFingerprint=()=>fingerprint(cwd),previous=null,reuse=false,environment=process.env}){
  let saved=previous;
  const config=hash(JSON.stringify({cwd,commands:project?.checkCommands||'',autoCheck:project?.autoCheck,platform:process.platform,runtime:process.version,environment}));
  return async()=>{
    if(!reuse||!project?.autoCheck)return run();
    const before=await readFingerprint();
    if(before.complete&&before.value&&saved?.config===config&&saved.fingerprint===before.value&&saved.result?.status==='passed'){
      const confirm=await readFingerprint();if(confirm.complete&&confirm.value===before.value)return {...structuredClone(saved.result),reused:true,reason:'Reused passed ATLAS checks for an identical complete local snapshot, commands and environment.'};
    }
    const result=await run(),after=await readFingerprint();
    if(result.status==='passed'&&before.complete&&after.complete&&before.value===after.value)saved={config,fingerprint:after.value,result:structuredClone(result)};else saved=null;
    return {...result,reused:false};
  };
}
module.exports={fingerprint,createVerificationRunner};
