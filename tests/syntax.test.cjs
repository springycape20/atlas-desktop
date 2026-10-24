const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {tokenize}=require('../syntax-worker');
const root=path.join(__dirname,'..');
const scope={};scope.window=scope;scope.self=scope;
vm.runInNewContext(fs.readFileSync(path.join(root,'syntax-highlight.js'),'utf8'),scope);
const prism=scope.Prism;
function roundtrip(lines){return lines.map(line=>line.map(run=>run.text).join('')).join('\n');}
test('bundled grammars preserve source text and highlight common project languages',()=>{
 for(const [language,source] of Object.entries({python:'import math\nclass Match:\n    WIDTH = 800 # size\n',javascript:'const greet = (name) => `Hello ${name}`;\n',tsx:'const view = <Panel count={42} />;\n',powershell:'$name = "hello" # comment\n',css:'.app { color: red; }\n',json:'{"ready": true, "count": 42}',rust:'fn main() { let count = 42; }',cpp:'int main() { return 0; }',markdown:'# Title\n**bold**'})){
  const result=tokenize(source,language,prism);assert(result.lines,language);assert.equal(roundtrip(result.lines),source);assert(result.lines.flat().some(run=>run.types.length),language);
 }
 assert.equal(prism.manual,true);assert.equal(prism.disableWorkerMessageHandler,true);
});
test('multiline Python strings retain context on later diff lines',()=>{
 const source='"""Pong\nfor two players\n"""\nimport math\n';
 const {lines}=tokenize(source,'python',prism);assert(lines[1].some(run=>run.types.includes('string')));assert(lines[3].some(run=>run.types.includes('keyword')));assert.equal(roundtrip(lines),source);
});
test('HTML source is returned as text runs and never interpreted as rendered markup',()=>{
 const source='<img src=x onerror="alert(1)">\n<script>alert("text")</script>\n';
 const {lines}=tokenize(source,'markup',prism);assert.equal(roundtrip(lines),source);assert(lines.flat().every(run=>typeof run.text==='string'&&Array.isArray(run.types)));
});
test('unsupported and oversized files use a plain text fallback',()=>{
 assert.equal(tokenize('hello','unknown',prism).reason,'unsupported');
 assert.equal(tokenize('x'.repeat(120001),'python',prism).reason,'large');
 assert.equal(tokenize('\n'.repeat(4000),'python',prism).reason,'large');
 assert.equal(roundtrip(tokenize('\tvalue = 42\r\n\r\n','python',prism).lines),'\tvalue = 42\r\n\r\n');
});
