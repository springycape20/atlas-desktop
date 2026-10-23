const {randomUUID}=require('node:crypto');
function createApprovalManager(notify=()=>{}){
  const pending=new Map();
  const list=()=>[...pending.values()].map(({resolve,cleanup,...row})=>row);
  function ask({jobId,provider,title,details,choices=['Allow once','Deny'],textInput=false,signal}){
    if(signal?.aborted)return Promise.resolve(null);
    return new Promise(resolve=>{
      const id=randomUUID(),abort=()=>answer(id,null);
      pending.set(id,{id,jobId,provider,title:String(title).slice(0,160),details:String(details||'').slice(0,18000),choices:choices.slice(0,12),textInput,createdAt:Date.now(),resolve,cleanup:()=>signal?.removeEventListener('abort',abort)});
      signal?.addEventListener('abort',abort,{once:true});notify(list());
    });
  }
  function answer(id,choice,text=''){const row=pending.get(id);if(!row)throw Error('This approval has expired.');if(choice!==null&&!row.choices.includes(choice))throw Error('Choose one of the offered answers.');if(row.textInput&&['Send answer','Other answer'].includes(choice)&&!(typeof text==='string'&&text.trim()&&text.length<=10000))throw Error('Enter an answer under 10,000 characters.');pending.delete(id);row.cleanup();row.resolve(choice===null?null:row.textInput?{choice,text:typeof text==='string'?text.slice(0,10000):''}:choice);notify(list());return list();}
  function cancelJob(jobId){for(const row of [...pending.values()])if(row.jobId===jobId)answer(row.id,null);}
  return {ask,list,answer,cancelJob};
}
async function codexApproval(manager,job,method,p){
  const ask=(title,details,choices)=>manager.ask({jobId:job.id,provider:'codex',title,details,choices,signal:job.signal});
  if(method==='item/permissions/requestApproval'){
    const choice=await ask('Additional access requested',JSON.stringify({reason:p.reason,cwd:p.cwd,permissions:p.permissions},null,2));
    return {permissions:choice==='Allow once'?p.permissions||{}:{},scope:'turn'};
  }
  if(['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(method)){
    const choice=await ask(method.includes('commandExecution')?'Run this command?':'Allow these file changes?',JSON.stringify({reason:p.reason,command:p.command,cwd:p.cwd,grantRoot:p.grantRoot,changes:p.changes,network:p.networkApprovalContext},null,2));
    return {decision:choice==='Allow once'?'accept':'decline'};
  }
  if(['item/tool/requestUserInput','tool/requestUserInput'].includes(method)){
    const answers={};for(const q of p.questions||[]){const labels=(q.options||[]).map(o=>o.label).slice(0,10),textInput=!labels.length||q.isOther===true;if(textInput)labels.push(labels.length?'Other answer':'Send answer');const result=await manager.ask({jobId:job.id,provider:'codex',title:q.header||'Provider question',details:q.question,choices:labels,textInput,signal:job.signal}),choice=typeof result==='object'?result?.choice:result;answers[q.id]={answers:choice?[['Other answer','Send answer'].includes(choice)?result.text:choice]:[]};}return {answers};
  }
  if(method==='mcpServer/elicitation/request'){
    if(p.mode==='url'){const choice=await ask('Plugin connection',p.message+'\n'+p.url,['Completed in browser','Deny']);return {action:choice==='Completed in browser'?'accept':'decline',content:null};}
    // Structured forms need typed field validation; never claim an empty form was approved.
    return {action:'decline',content:null};
  }
  throw Error('This provider request requires the provider app: '+method);
}
module.exports={createApprovalManager,codexApproval};
