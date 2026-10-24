const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createTaskNotifications}=require('../task-notifications');
function harness({focused=false,supported=true}={}){
  const notices=[],calls=[];
  class Notification extends EventEmitter{static isSupported(){return supported;}constructor(options){super();this.options=options;notices.push(this);}show(){calls.push('notice');}}
  const win={isDestroyed:()=>false,isFocused:()=>focused,isMinimized:()=>true,restore:()=>calls.push('restore'),show:()=>calls.push('show'),focus:()=>calls.push('focus'),setProgressBar:value=>calls.push(['progress',value]),flashFrame:value=>calls.push(['flash',value]),webContents:{send:(channel,data)=>calls.push([channel,data])}};
  return{service:createTaskNotifications({Notification,getWindow:()=>win}),win,notices,calls};
}
test('completion alerts once, keeps other tasks running and opens the correct chat',()=>{
  const h=harness();const a={id:'a',status:'running',collaboration:true,colabChatId:'chat',prompt:'private prompt'},b={id:'b',status:'running'};
  h.service.started(a);h.service.started(b);a.status='completed';h.service.finished(a);h.service.finished(a);
  assert.equal(h.notices.length,1);assert(!JSON.stringify(h.notices[0].options).includes('private prompt'));
  assert.deepEqual(h.calls.filter(x=>Array.isArray(x)&&x[0]==='progress').at(-1),['progress',2]);
  assert(h.calls.some(x=>Array.isArray(x)&&x[0]==='flash'&&x[1]===true));
  h.notices[0].emit('click');assert(h.calls.includes('restore'));assert(h.calls.includes('focus'));
  const opened=h.calls.find(x=>Array.isArray(x)&&x[0]==='atlas:task-open');assert.equal(opened[1].colabChatId,'chat');assert.equal(opened[1].id,'a');
  b.status='completed';h.service.finished(b);assert.deepEqual(h.calls.filter(x=>Array.isArray(x)&&x[0]==='progress').at(-1),['progress',-1]);
});
test('paused, cancelled, historical and shutdown tasks do not send completion alerts',()=>{
  const h=harness();h.service.finished({id:'historical',status:'completed'});
  for(const status of ['paused','cancelled']){const job={id:status,status};h.service.started(job);h.service.finished(job);}
  const job={id:'shutdown',status:'completed'};h.service.started(job);h.service.finished(job,{silent:true});assert.equal(h.notices.length,0);
});
test('focused app does not flash; unsupported notifications preserve taskbar alerts',()=>{
  const foreground=harness({focused:true}),job={id:'done',status:'completed'};foreground.service.started(job);foreground.service.finished(job);
  assert.equal(foreground.notices.length,1);assert(!foreground.calls.some(x=>Array.isArray(x)&&x[0]==='flash'));
  const h=harness({supported:false});h.service.started(job);h.service.finished(job);assert.equal(h.notices.length,0);assert(h.calls.some(x=>Array.isArray(x)&&x[0]==='flash'&&x[1]));
});
test('notification failures cannot fail a completed task',()=>{
 const h=harness();h.win.setProgressBar=()=>{throw Error('Unavailable');};h.win.flashFrame=()=>{throw Error('Unavailable');};
 const job={id:'done',status:'completed'};assert.doesNotThrow(()=>{h.service.started(job);h.service.finished(job);});
});

test('stalled Colab runs and pass limits notify as attention, never as task complete',()=>{
 const h=harness();for(const status of ['needs_attention','limit_reached']){const job={id:status,status,collaboration:true};h.service.started(job);h.service.finished(job);}assert.equal(h.notices.length,2);assert(h.notices.every(notice=>notice.options.title==='ATLAS task needs attention'));
});
