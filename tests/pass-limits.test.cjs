const test=require('node:test'),assert=require('node:assert/strict');
const {createCollaboration,normalizePassLimit}=require('../collaboration');
test('unlimited is the default and continues beyond six passes until both providers agree',async()=>{
  let calls=0;const statuses=[];
  const run=createCollaboration({progress:value=>statuses.push(value),runProvider:async()=>({output:'Pass '+(++calls)+'\nATLAS_COLAB_'+(calls>=7?'READY':'CONTINUE')})});
  const result=await run({task:'Build',settings:{}});
  assert.equal(result.passes,8);assert.equal(result.output,'Pass 8');assert.equal(result.limitation,undefined);
  assert.ok(statuses.some(value=>value.includes('unlimited passes')));
});
test('explicit limits remain optional and may exceed six passes',async()=>{
  let calls=0;const run=createCollaboration({progress(){},runProvider:async()=>{calls++;return {output:'More work\nATLAS_COLAB_CONTINUE'};}});
  const result=await run({task:'Build',settings:{},maxRounds:9});assert.equal(calls,9);assert.match(result.limitation,/selected pass limit/i);
  const short=await run({task:'Review',settings:{},maxRounds:1});assert.equal(short.passes,1);assert.match(short.limitation,/below the full three-pass/);
});
test('unlimited completion requires three passes and resumes without replaying finished work',async()=>{
  const saved=[];let calls=0;
  const run=createCollaboration({progress(){},checkpoint:async reports=>{saved.splice(0,saved.length,...structuredClone(reports));},runProvider:async()=>{calls++;return {output:'Verified result\nATLAS_COLAB_READY'};}});
  const first=await run({task:'Build',settings:{}});assert.equal(first.passes,3);
  await run({task:'Build',settings:{},checkpoints:saved});assert.equal(calls,3);
  await assert.rejects(run({task:'Build',settings:{},checkpoints:saved,maxRounds:2}),/below the number of saved passes/);
});
test('stop remains effective without a pass cap and invalid limits are rejected',async()=>{
  const controller=new AbortController();let calls=0;
  const run=createCollaboration({progress(){},runProvider:async()=>{if(++calls===4)controller.abort();return {output:'Working'};}});
  await assert.rejects(run({task:'Build',settings:{},signal:controller.signal}),/stopped/);assert.equal(calls,4);
  for(const value of [undefined,null,'',0])assert.equal(normalizePassLimit(value),null);
  for(const value of [-1,1.5,Infinity,NaN,true,'bad'])assert.throws(()=>normalizePassLimit(value),/positive whole-number/);
});
