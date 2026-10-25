const {setTimeout:delay}=require('node:timers/promises');
const sequenceTools=new Set(['Move','Click','Type','Scroll','Shortcut','Wait','WaitFor','Screenshot','Snapshot']);
function validateSequence(steps){
 if(!Array.isArray(steps)||!steps.length||steps.length>8)throw Error('Use one to eight desktop steps.');
 if(JSON.stringify(steps).length>20000)throw Error('Desktop sequence is too large.');
 for(const step of steps){
  if(!step||!sequenceTools.has(step.tool)||!step.arguments||typeof step.arguments!=='object'||Array.isArray(step.arguments))throw Error('Sequences support structured screen, mouse and keyboard actions only.');
  if(step.tool==='Wait'&&(!Number.isInteger(step.arguments.duration)||step.arguments.duration<0||step.arguments.duration>2))throw Error('Sequence waits must be at most two seconds.');
  if(step.tool==='WaitFor'&&(!Number.isFinite(step.arguments.timeout)||step.arguments.timeout<0||step.arguments.timeout>5))throw Error('Sequence condition waits need an explicit timeout of at most five seconds.');
 }
 return steps;
}
const point=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000);
async function glideCursor({tool,args,connection,cursorPosition,signal,duration=180}){
 if(!['Move','Click','Scroll','Type'].includes(tool)||args.drag!==undefined&&args.drag!==false&&args.drag!=='false'||!point(args.loc)||!connection.tools.some(row=>row.name==='Move'))return;
 let start;try{start=await cursorPosition();}catch{return;}
 if(!start||!point([start.x,start.y]))return;
 const [x,y]=args.loc,distance=Math.hypot(x-start.x,y-start.y);if(distance<15)return;
 const steps=Math.min(12,Math.max(3,Math.ceil(distance/60))),started=performance.now();
 for(let i=1;i<=steps;i++){
  signal.throwIfAborted();const t=i/steps,ease=t*t*(3-2*t),loc=[Math.round(start.x+(x-start.x)*ease),Math.round(start.y+(y-start.y)*ease)];
  const result=await connection.call('Move',{loc},signal);if(result?.isError)throw Error('Cursor movement failed. No click or typing was sent. Inspect the current screen before trying again.');
  const remaining=duration*t-(performance.now()-started);if(remaining>0)await delay(remaining,undefined,{signal});
 }
}
module.exports={validateSequence,glideCursor};
