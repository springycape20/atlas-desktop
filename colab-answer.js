function isSimpleMessage(task){return /^(?:test|testing|ping|hello|hi|hey|thanks|thank you)[.!?\s]*$/i.test(String(task).trim());}
function stripProtocol(value){
  let text=String(value||''),matches=[...text.matchAll(/^[ \t*_`]*ATLAS_COLAB_(STATUS|READY|CONTINUE)\b/gm)];
  for(const match of matches.reverse()){
    let start=match.index;const prefix=text.slice(0,start),fence=prefix.match(/(?:^|\n)[ \t]*```(?:json|text)?[ \t]*\n[ \t]*$/);if(fence)start-=fence[0].length;let end=text.indexOf('\n',start);if(end<0)end=text.length;
    if(match[1]==='STATUS'){
      const object=text.indexOf('{',start+match[0].length);if(object>=0&&/^[\s:*_`]*$/.test(text.slice(match.index+match[0].length,object))){end=text.length;let depth=0,quoted=false,escape=false;for(let i=object;i<text.length;i++){const char=text[i];if(quoted){if(escape)escape=false;else if(char==='\\')escape=true;else if(char==='"')quoted=false;continue;}if(char==='"')quoted=true;else if(char==='{')depth++;else if(char==='}'&&--depth===0){end=i+1;break;}}}
    }
    if(fence){const closing=text.slice(end).match(/^[ \t]*\r?\n[ \t]*```[ \t]*(?:\r?\n|$)/);if(closing)end+=closing[0].length;}
    text=text.slice(0,start)+text.slice(end);
  }
  return text.replace(/\n\s*`{3}\s*$/,'').replace(/^\s*`{3}(?:json)?\s*\n(?=\s*$)/,'').trim();
}
function finalAnswer({task,mode,outcome,artifact,latest,limitation,openIssues=[]}){
  const explicit=outcome==='completed'?(latest?.userResponse||artifact?.userResponse):latest?.userResponse;
  let output=stripProtocol(explicit||(outcome==='completed'?artifact?.output||latest?.output:latest?.output||artifact?.output)||'');
  if(outcome==='completed'){
    if(mode==='build'&&isSimpleMessage(task))output=/^(?:thanks|thank you)/i.test(task.trim())?"You're welcome.":/^(?:hi|hey|hello)/i.test(task.trim())?'Hello! What would you like to work on?':'Colab is responding and ready.';
    return output||'Done.';
  }
  const issues=openIssues.map(issue=>'- '+issue.summary+(issue.evidence?' ('+issue.evidence+')':'')).join('\n');
  return [output,issues?'Remaining blockers:\n'+issues:'',limitation?'Needs attention: '+limitation:''].filter(Boolean).join('\n\n')||'This task needs attention before it can finish.';
}
module.exports={isSimpleMessage,stripProtocol,finalAnswer};
