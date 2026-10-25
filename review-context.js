const {createHash}=require('node:crypto');
function createReviewContext(){
  let previous=null,pending=null;
  function format(report,limit,{phase='review',full=false,continued=false}={}){
    const current=new Map(report.files.map(row=>[row.path,createHash('sha256').update(JSON.stringify([row.status,row.patch])).digest('hex')]));
    const delta=phase==='review'&&continued&&!full&&previous&&!report.limited;
    let rows=delta?report.files.filter(row=>!row.patch||previous.get(row.path)!==current.get(row.path)):report.files;
    if(delta)for(const name of previous.keys())if(!current.has(name))rows=[...rows,{path:name,status:'reverted to task-start content; inspect the current file',patch:null}];
    let text=(report.limited?'PARTIAL file scan. Inspect omitted files directly.\n':'')+(delta?'Files changed since the preceding review; hunks below are their full task-start diffs. Other earlier changes still belong to the task.\n':'Full task-start change context.\n');
    text+=report.files.length+' files currently differ from task start. '+rows.length+' changed/reverted files in this view.\n';
    text+='All currently changed paths:\n'+report.files.slice(0,60).map(row=>JSON.stringify(row.path)).join('\n')+'\n';
    for(const row of rows.slice(0,60)){text+='\n'+JSON.stringify(row.path)+' ('+row.status+')\n';for(const hunk of row.patch?.hunks||[])text+=hunk.lines.join('\n')+'\n';if(!row.patch)text+='Read the file directly; no inline text diff is available.\n';if(text.length>limit)break;}
    if(phase==='review')pending=report.limited?null:current;
    return text.slice(0,limit)+(text.length>limit||rows.length>60?'\nPARTIAL diff; inspect omitted content in files.':'');
  }
  format.commit=()=>{if(pending)previous=pending;pending=null;};return format;
}
module.exports={createReviewContext};
