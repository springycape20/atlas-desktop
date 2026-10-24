const test=require('node:test'),assert=require('node:assert/strict'),{finalAnswer,stripProtocol}=require('../colab-answer'),{createCollaboration,parseVerdict}=require('../collaboration');
const ready=(text,userResponse,criteria=[])=>text+'\nATLAS_COLAB_STATUS '+JSON.stringify({decision:'ready',criteria,blockingIssues:[],...(userResponse?{userResponse}:{})});
test('plain test produces a short natural answer even if stage reports contain process chatter',async()=>{
 let calls=0,saved;const run=createCollaboration({progress(){},checkpoint:async reports=>saved=reports,runProvider:async()=>{calls++;return{output:ready('Selected approach: proposal one. Task brief: test. No files changed.','Reviewed TASK; no files changed, no executable tests run.',[{id:'TASK',text:'test'}])};}});const result=await run({task:'test',preset:'thorough'});assert.equal(calls,2);assert.equal(result.output,'Colab is responding and ready.');assert.equal(result.outcome,'completed');assert(saved[0].output.includes('Selected approach'));assert(!result.output.includes('ATLAS_COLAB_STATUS'));
});
test('successful ordinary work shows the final user answer, without concatenating the review log',async()=>{
 let calls=0;const run=createCollaboration({progress(){},runProvider:async()=>({output:++calls===1?ready('Implementation report','Fixed the button.'):ready('Reviewer internal notes: approved.','Fixed the button. The keyboard shortcut also works; the focused checks passed.')})});const result=await run({task:'Fix the Send button'});assert.equal(result.output,'Fixed the button. The keyboard shortcut also works; the focused checks passed.');assert(!result.output.includes('Reviewer internal'));
});
test('detailed requested explanations and code are preserved without artificial shortening',async()=>{
 const detail='Detailed explanation\n'+('Important implementation details and evidence.\n').repeat(200)+'\n```js\nconst result = { correct: true };\n```\nLimitation: offline checks only.';const run=createCollaboration({progress(){},runProvider:async()=>({output:ready('Internal stage summary',detail)})});const result=await run({task:'Explain the architecture in depth with implementation examples and limitations'});assert.equal(result.output,detail);
});
test('legacy stages omit reviewer bookkeeping and strip one-line or multiline status records',()=>{
 const raw='Fixed the issue.\nATLAS_COLAB_STATUS {"decision":"ready","criteria":[{"id":"TASK","text":"Build"}]}';assert.equal(finalAnswer({task:'Fix the issue',mode:'build',outcome:'completed',artifact:{output:raw},latest:{output:'The previous criteria format was invalid; this fixes the status line.'}}),'Fixed the issue.');assert.equal(stripProtocol('Useful answer\nATLAS_COLAB_STATUS {\n"decision": "ready",\n"criteria": []\n}'),'Useful answer');
});
test('object-form criteria normalize safely instead of triggering an unnecessary repair pass',()=>{
 const parsed=parseVerdict(ready('Done','All done.',[{id:'TASK',text:'Build requested feature'}]));assert.equal(parsed.valid,true);assert.deepEqual(parsed.criteria,['Build requested feature']);assert.equal(parsed.userResponse,'All done.');assert.equal(parseVerdict(ready('Done','',[{id:'TASK',text:42}])).valid,false);
});
test('unfinished work keeps blockers and limitations visible, even for a plain test',()=>{
 const output=finalAnswer({task:'test',mode:'build',outcome:'needs_attention',artifact:{output:'Setup started.'},latest:{userResponse:'Claude is not signed in.'},openIssues:[{summary:'Connect Claude',evidence:'Authentication check failed'}],limitation:'Both providers must be available.'});assert(output.includes('Claude is not signed in.'));assert(output.includes('Connect Claude'));assert(output.includes('Both providers'));assert(!output.includes('ready.'));
});
test('fenced and newline-separated internal status JSON leaves no dangling code fences',()=>{
 assert.equal(stripProtocol('Useful answer\n```json\nATLAS_COLAB_STATUS\n{\n"decision":"ready"\n}\n```'),'Useful answer');assert.equal(stripProtocol('Useful answer\nATLAS_COLAB_STATUS {\n"broken":true'),'Useful answer');
});
test('a legacy blocked reviewer still shows the actual missing dependency',()=>{
 const output=finalAnswer({task:'Build',mode:'build',outcome:'needs_attention',artifact:{output:'Implemented main changes.'},latest:{output:'Cannot verify: install the missing Python package first.'},limitation:'A provider reported blocked work.'});assert(output.includes('missing Python package'));
});
