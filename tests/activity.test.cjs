const test=require('node:test');
const assert=require('node:assert/strict');
const {createDecoder}=require('../assistant-core');
const {CodexConnection}=require('../codex-connection');
test('Claude activity includes commands and completion, excluding private thinking and tool output',()=>{
  const text=[],activity=[];
  const decoder=createDecoder('claude',part=>text.push(part),event=>activity.push(event));
  const rows=[{type:'assistant',message:{id:'a',content:[{type:'thinking',thinking:'private reasoning sentinel'},{type:'tool_use',id:'tool1',name:'Bash',input:{command:'npm test'}}]}},
    {type:'user',message:{content:[{type:'tool_result',tool_use_id:'tool1',is_error:true,content:'private tool output sentinel'}]}},
    {type:'assistant',message:{id:'b',content:[{type:'text',text:'Tests reported a failure.'}]}}];
  const data=rows.map(row=>JSON.stringify(row)).join('\n');decoder.push(data.slice(0,80));decoder.push(data.slice(80));decoder.finish();
  assert.equal(activity[0].kind,'command');assert.equal(activity[0].text,'npm test');assert.equal(activity[0].status,'running');
  assert.equal(activity[1].status,'failed');assert.equal(activity[0].id,activity[1].id);
  assert.deepEqual(text,['Tests reported a failure.']);assert.ok(!JSON.stringify(activity).includes('sentinel'));
});
test('Codex activity tracks command exits, file changes, public progress, and plans',()=>{
  const connection=new CodexConnection('unused'),events=[];
  connection.turns.set('thread',{turnId:'turn',commentary:new Set(),activity:event=>events.push(event)});
  const send=(method,item)=>connection.receive({method,params:{threadId:'thread',turnId:'turn',item}});
  send('item/started',{id:'cmd',type:'commandExecution',command:'npm test'});
  send('item/completed',{id:'cmd',type:'commandExecution',command:'npm test',status:'completed',exitCode:1});
  send('item/completed',{id:'file',type:'fileChange',status:'completed',changes:[{path:'app.js',kind:{type:'update'}}]});
  send('item/completed',{id:'note',type:'agentMessage',phase:'commentary',text:'Checking the test failure.'});
  send('item/started',{id:'reason',type:'reasoning',text:'private sentinel'});
  connection.receive({method:'turn/plan/updated',params:{threadId:'thread',turnId:'turn',plan:[{step:'Run tests',status:'completed'}]}});
  assert.equal(events[0].text,'npm test');assert.equal(events[1].status,'failed');assert.equal(events[1].exitCode,1);
  assert.equal(events[0].id,events[1].id);assert.match(events[2].text,/update: app.js/);assert.equal(events[3].kind,'progress');
  assert.match(events[4].text,/Done: Run tests/);assert.ok(!JSON.stringify(events).includes('private sentinel'));
});
