const test=require('node:test'),assert=require('node:assert/strict');
const {createCollaboration,normalizePassLimit,parseVerdict}=require('../collaboration');
const issue=id=>({id,criterion:'TASK',summary:'Required fix '+id,evidence:'app.js:10 reproduces '+id});
const status=(decision='ready',blockingIssues=[],text='Verified result')=>text+'\nATLAS_COLAB_STATUS '+JSON.stringify({decision,blockingIssues});

test('an approving final reviewer ends the task after two passes without another build',async()=>{
  const calls=[],run=createCollaboration({progress(){},runProvider:async(provider,prompt,cwd,settings)=>{calls.push({provider,prompt,settings});return {output:status('ready',[],provider==='codex'?'Implemented task':'Accepted required work; optional polish can wait')};}});
  const result=await run({task:'Build',settings:{}});assert.equal(result.outcome,'completed');assert.equal(calls.length,2);assert.equal(calls[1].settings.readOnly,true);assert.match(calls[1].prompt,/final reviewer/);assert(result.output.includes('Implemented task'));assert(!result.output.includes('Accepted required work'));assert(!result.output.includes('Review / current status'));
});

test('unlimited passes permit long tasks that keep resolving actual blockers',async()=>{
  let calls=0,reviews=0;const statuses=[],run=createCollaboration({progress:text=>statuses.push(text),runProvider:async()=>{calls++;const remaining=calls%2===0?Math.max(0,4-reviews++):0;return {output:status(remaining?'changes_requested':'ready',Array.from({length:remaining},(_,i)=>issue('F'+i)))};}});
  const result=await run({task:'Build',settings:{}});assert.equal(result.outcome,'completed');assert.equal(result.passes,10);assert.equal(result.limitation,undefined);assert(statuses.some(text=>text.includes('unlimited passes')));
});

test('explicit pass caps remain optional and never label unreviewed final edits complete',async()=>{
  let calls=0,reviews=0;const run=createCollaboration({progress(){},runProvider:async()=>{calls++;const remaining=calls%2===0?12-reviews++:0;return {output:status(remaining?'changes_requested':'ready',Array.from({length:remaining},(_,i)=>issue('F'+i)))};}});
  const result=await run({task:'Build',settings:{},maxRounds:9});assert.equal(calls,9);assert.equal(result.outcome,'limit_reached');assert.match(result.limitation,/selected pass limit/);
  calls=0;reviews=0;const short=await run({task:'Build',settings:{},maxRounds:1});assert.equal(short.passes,1);assert.equal(short.outcome,'limit_reached');assert.match(short.limitation,/below the full 2-pass/);
});

test('saved completed runs do not replay and scope or role changes cannot reuse their verdicts',async()=>{
  let saved,calls=0;const run=createCollaboration({progress(){},checkpoint:async rows=>saved=rows,runProvider:async()=>{calls++;return {output:status()};}});
  await run({task:'Build',settings:{}});const complete=structuredClone(saved);await run({task:'Build',settings:{},checkpoints:complete});assert.equal(calls,2);
  await assert.rejects(run({task:'Different task',settings:{},checkpoints:complete}),/saved task/);await assert.rejects(run({task:'Build',roles:'claude-builds',settings:{},checkpoints:complete}),/saved task/);
  await assert.rejects(run({task:'Build',settings:{},checkpoints:complete,maxRounds:1}),/below the number/);
});

test('a missing verdict gets one read-only clarification and then needs attention',async()=>{
  const calls=[],run=createCollaboration({progress(){},runProvider:async(provider,prompt,cwd,settings)=>{calls.push({provider,prompt,settings});return {output:'I have some suggestions.'};}});
  const result=await run({task:'Build',settings:{}});assert.equal(result.passes,2);assert.equal(result.outcome,'needs_attention');assert.deepEqual(calls.map(row=>row.provider),['codex','codex']);assert.equal(calls[1].settings.readOnly,true);assert.match(result.limitation,/after one clarification/);
});

test('clarification recovers the existing result without rerunning the implementation',async()=>{
  let calls=0;const providers=[],run=createCollaboration({progress(){},runProvider:async provider=>{providers.push(provider);return {output:++calls===1?'Implemented the requested change.':calls===2?'ATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}':status()};}});
  const result=await run({task:'Build',settings:{}});assert.equal(result.outcome,'completed');assert.deepEqual(providers,['codex','codex','claude']);assert(result.output.includes('Implemented the requested change.'));
});

test('formatted legacy READY markers are accepted while ambiguous CONTINUE is not',()=>{
  for(const output of ['Finished\n**ATLAS_COLAB_READY**','Finished\n\x60\x60\x60\nATLAS_COLAB_READY\n\x60\x60\x60','Finished\nATLAS_COLAB_READY.'])assert.equal(parseVerdict(output).decision,'ready');
  assert.equal(parseVerdict('Could improve things\nATLAS_COLAB_CONTINUE').valid,false);assert.equal(parseVerdict('ATLAS_COLAB_STATUS {"decision":"changes_requested","blockingIssues":[]}').valid,false);
});

test('repeated evidenced blockers stop after two unsuccessful fix/review cycles',async()=>{
  let calls=0;const run=createCollaboration({progress(){},runProvider:async()=>({output:++calls%2?status():status('changes_requested',[issue('F1')])})});
  const result=await run({task:'Build',settings:{}});assert.equal(result.passes,6);assert.equal(result.outcome,'needs_attention');assert.match(result.limitation,/two fix.review cycles/);assert.equal(result.openIssues[0].id,'F1');
});

test('a fix with no workspace change pauses if review still confirms blockers',async()=>{
  let calls=0;const run=createCollaboration({progress(){},fingerprint:async()=>({complete:true,value:'same'}),runProvider:async()=>({output:++calls%2?status():status('changes_requested',[issue('F1')])})});
  const result=await run({task:'Build',settings:{}});assert.equal(result.passes,4);assert.equal(result.outcome,'needs_attention');assert.match(result.limitation,/no workspace progress/);
});

test('analysis-only tasks use content progress rather than unchanged files to judge revisions',async()=>{
  let calls=0;const run=createCollaboration({progress(){},fingerprint:async()=>({complete:true,value:'same'}),runProvider:async()=>({output:++calls===2?status('changes_requested',[issue('F1')]):status()})});
  const result=await run({task:'Plan',mode:'plan',settings:{}});assert.equal(result.outcome,'completed');assert.equal(result.passes,4);
});

test('a read-only review cannot approve a workspace that changed during that review',async()=>{
  let version=0,calls=0;const run=createCollaboration({progress(){},fingerprint:async()=>({complete:true,value:String(version)}),runProvider:async()=>{calls++;version++;return {output:status()};}});
  const result=await run({task:'Build',settings:{}});assert.equal(result.passes,2);assert.equal(result.outcome,'needs_attention');assert.match(result.limitation,/changed during a read-only review/);
});

test('new non-regression issues cannot expand the already agreed fix list',async()=>{
  let calls=0;const run=createCollaboration({progress(){},runProvider:async()=>({output:++calls===2?status('changes_requested',[issue('F1')]):calls===4?status('changes_requested',[issue('F2')]):status()})});
  const result=await run({task:'Build',settings:{}});assert.equal(result.outcome,'needs_attention');assert.equal(result.passes,4);assert.match(result.limitation,/new issue outside/);
});

test('external changes after a checkpoint force review of current work before acceptance',async()=>{
  let version='a',saved,calls=0;const run=createCollaboration({progress(){},fingerprint:async()=>({complete:true,value:version}),checkpoint:async rows=>saved=rows,runProvider:async()=>{calls++;return {output:status()};}});
  await run({task:'Build',settings:{}});const complete=structuredClone(saved);version='external edit';const result=await run({task:'Build',settings:{},checkpoints:complete});assert.equal(calls,3);assert.equal(result.providers.at(-1),'claude');assert.equal(result.outcome,'completed');
});

test('provider errors stop rather than silently retrying work and Stop still interrupts',async()=>{
  let calls=0;const broken=createCollaboration({progress(){},runProvider:async()=>{calls++;throw Error('usage limit');}});await assert.rejects(broken({task:'Build',settings:{}}),/usage limit/);assert.equal(calls,1);
  const controller=new AbortController();calls=0;const run=createCollaboration({progress(){},runProvider:async()=>{if(++calls===2)controller.abort();return {output:status()};}});await assert.rejects(run({task:'Build',settings:{},signal:controller.signal}),/stopped/);assert.equal(calls,2);
  for(const value of [undefined,null,'',' ',0,'0'])assert.equal(normalizePassLimit(value),null);for(const value of [-1,1.5,Infinity,NaN,true,'bad'])assert.throws(()=>normalizePassLimit(value),/positive whole-number/);
});

test('replacing one regression with another cannot masquerade as progress forever',async()=>{
 let calls=0,reviews=0;const run=createCollaboration({progress(){},runProvider:async()=>{calls++;return {output:calls%2?status():status('changes_requested',[issue('F1'),{...issue('R'+reviews++),regression:true}])};}});const result=await run({task:'Build'});assert.equal(result.outcome,'needs_attention');assert.equal(result.passes,6);
});

test('inline-code and bold structured verdicts parse without clarification',()=>{
 for(const wrap of [value=>'`'+value+'`',value=>'**'+value+'**'])assert.equal(parseVerdict('Built\n'+wrap('ATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}')).decision,'ready');
 const verdict=parseVerdict('Fixed the parser.\nATLAS_COLAB_STATUS '+JSON.stringify({decision:'ready',criteria:['Handle ATLAS_COLAB_STATUS in text.'],blockingIssues:[]}));assert.equal(verdict.decision,'ready');assert.equal(verdict.output,'Fixed the parser.');
});

test('workspace changes while proposals are paused cannot skip synthesis or implementation',async()=>{
 let version='before',saved,calls=[];const run=createCollaboration({progress(){},fingerprint:async()=>({value:version,complete:true}),checkpoint:async rows=>saved=rows,runProvider:async(provider,prompt)=>{calls.push({provider,prompt});return {output:status()};}});
 await run({task:'Compare',mode:'compare',maxRounds:1});const checkpoint=structuredClone(saved);version='external';calls=[];const result=await run({task:'Compare',mode:'compare',checkpoints:checkpoint});assert.equal(result.outcome,'completed');assert.equal(calls.length,3);assert.match(calls[0].prompt,/independent proposal/);assert.match(calls[1].prompt,/Synthesize/);
});

test('attention before an artifact exists resumes the failed stage rather than accepting an empty artifact',async()=>{
 let saved,calls=0;const run=createCollaboration({progress(){},checkpoint:async rows=>saved=rows,runProvider:async()=>({output:++calls===1?status('blocked',[],'Need a decision.'):status()})});const first=await run({task:'Build',roles:'proposals'});assert.equal(first.outcome,'needs_attention');const checkpoint=structuredClone(saved),second=await run({task:'Build',roles:'proposals',checkpoints:checkpoint});assert.equal(second.outcome,'completed');assert.equal(calls,5);
});

test('a repaired fix verdict keeps the original fix fingerprints for progress checks',async()=>{
 let calls=0,version='initial';const run=createCollaboration({progress(){},fingerprint:async()=>({complete:true,value:version}),runProvider:async()=>{calls++;if(calls===1)version='build';if(calls===3){version='fix';return {output:'Fixed F1.'};}return {output:calls===2||calls===5?status('changes_requested',[issue('F1')]):status()};}});const result=await run({task:'Build',maxRounds:5});assert.equal(result.outcome,'limit_reached');assert(!result.limitation.includes('no workspace progress'));
});

test('legacy proposal checkpoints cannot be accepted as an implemented task',async()=>{
 const calls=[],run=createCollaboration({progress(){},runProvider:async(provider,prompt)=>{calls.push({provider,prompt});return {output:status()};}}),checkpoints=[{provider:'codex',output:'Proposal A',ready:true},{provider:'claude',output:'Proposal B',ready:true}];
 const result=await run({task:'Build',roles:'proposals',checkpoints});assert.equal(result.outcome,'completed');assert.equal(calls.length,2);assert.match(calls[0].prompt,/Choose or combine the two proposals/);assert.match(calls[1].prompt,/final reviewer/);
});

test('a clarified reviewer verdict cannot approve changes made after its original review',async()=>{
 let version='build',calls=0;const run=createCollaboration({progress(){},fingerprint:async()=>({value:version,complete:true}),checkpoint:async rows=>{if(rows.length===2)version='external';},runProvider:async()=>({output:++calls===2?'Accepted the work.':status()})});const result=await run({task:'Build'});assert.equal(result.outcome,'needs_attention');assert.equal(result.passes,3);assert.match(result.limitation,/fresh review is required/);
});
