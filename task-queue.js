const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
function createTaskQueue({directory,run,canRun=()=>true,notify=()=>{}}){
  const store=require('./atomic-store').createAtomicStore(path.join(directory,'task-queue.json'));let state={items:[],paused:true,pauseBetween:true},loaded,busy=false,lock=Promise.resolve();
  const ready=()=>loaded ||= fs.readFile(path.join(directory,'task-queue.json'),'utf8').then(text=>{state=JSON.parse(text);state.paused=true;for(const row of state.items)if(row.status==='running'){row.status='interrupted';row.error='ATLAS closed during this task. Review its changes before retrying.';}}).catch(error=>{if(error.code!=='ENOENT')throw error;});
  const snapshot=()=>structuredClone(state),save=async()=>{await store.save(state);await store.flush();notify(snapshot());};
  async function tick(){await ready();if(busy||state.paused||!canRun())return;const row=state.items.find(r=>r.status==='queued');if(!row)return;busy=true;row.status='running';row.startedAt=Date.now();await save();try{row.result=await run(structuredClone(row));row.status=row.result?.checksFailed?'needs-review':'completed';if(row.result?.checksFailed){state.paused=true;row.error='Completion checks failed. Review the task before continuing.';}}catch(error){row.status='failed';row.error=error.message;state.paused=true;}finally{row.endedAt=Date.now();if(state.pauseBetween)state.paused=true;busy=false;await save();}}
  async function action(request={}){const work=lock.then(async()=>{await ready();const row=state.items.find(r=>r.id===request.id);
    if(request.action==='add'){
      const p=request.task||{};if(typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>20000||typeof p.cwd!=='string'||!path.isAbsolute(p.cwd))throw Error('Enter a task and select its project folder.');
      const cwd=await fs.realpath(p.cwd);if(!(await fs.stat(cwd)).isDirectory())throw Error('Select a project folder.');if(state.items.length>=100)throw Error('Remove completed tasks before adding more (100 maximum).');
      state.items.push({id:randomUUID(),prompt:p.prompt.trim(),cwd,profileId:String(p.profileId||'').slice(0,100),provider:p.provider==='colab'?'colab':'assistant',roles:['codex-builds','claude-builds','proposals'].includes(p.roles)?p.roles:'codex-builds',status:'queued',createdAt:Date.now()});
    }else if(request.action==='start'){state.paused=false;state.pauseBetween=request.pauseBetween!==false;}
    else if(request.action==='pause')state.paused=true;
    else if(request.action==='move'){if(!row||row.status!=='queued')throw Error('Only waiting tasks can be reordered.');const index=state.items.indexOf(row),next=index+(request.direction==='up'?-1:1);if(next>=0&&next<state.items.length&&state.items[next].status==='queued')[state.items[index],state.items[next]]=[state.items[next],row];}
    else if(request.action==='remove'){if(row?.status==='running')throw Error('Stop the running task in Tasks first.');state.items=state.items.filter(r=>r.id!==request.id);}
    else if(request.action==='retry'){if(!row||!['failed','interrupted'].includes(row.status))throw Error('Only failed or interrupted tasks can be retried.');row.status='queued';delete row.error;}
    await save();return snapshot();});lock=work.catch(()=>{});const result=await work;void tick().catch(()=>{});return result;}
  const timer=setInterval(()=>void tick().catch(()=>{}),1500);timer.unref();
  return {action,tick,close:async()=>{clearInterval(timer);await ready();state.paused=true;await save();}};
}
module.exports={createTaskQueue};
