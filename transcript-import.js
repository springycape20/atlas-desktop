const {createHash}=require('node:crypto');
function text(content){if(typeof content==='string')return content;if(!Array.isArray(content))return '';return content.filter(part=>part&&typeof part.text==='string'&&(!part.type||['text','input_text','output_text'].includes(part.type))).map(part=>part.text).join('\n');}
function conversation({provider,id,sessionId='',title='',cwd='',updatedAt=Date.now(),turns}){
  sessionId=typeof sessionId==='string'?sessionId.slice(0,100):'';
  const visible=turns.filter(turn=>['user','assistant'].includes(turn.role)&&turn.content?.trim()&&!/^(?:<environment_context\b|<system-reminder\b|the following is the codex agent history|\[(?:typing|blank_audio)\])/i.test(turn.content.trim()));
  return {id,provider,sessionId,title:String(title||visible.find(turn=>turn.role==='user')?.content||'Untitled conversation').replace(/\s+/g,' ').slice(0,100),cwd:typeof cwd==='string'?cwd:'',updatedAt,originalTurnCount:visible.length,truncated:visible.length>80||visible.slice(-80).some(turn=>turn.content.length>12000),turns:visible.slice(-80).map(turn=>({...turn,content:turn.content.slice(0,12000)}))};
}
function jsonl(provider,raw,{id,updatedAt}={}){
  const turns=[];let cwd='',sessionId='';const seen=new Map();
  for(const line of raw.replace(/^\uFEFF/,'').split(/\r?\n/)){
    if(!line)continue;let row;try{row=JSON.parse(line);}catch{continue;}if(!row||typeof row!=='object')continue;let role='',content='',messageId='';
    if(provider==='codex'){
      if(row.type==='session_meta'&&(row.payload?.source==='subagent'||row.payload?.source?.subagent))return conversation({provider,id,updatedAt,turns:[]});
      if(row.type==='session_meta'){cwd=row.payload?.cwd||cwd;sessionId=row.payload?.session_id||row.payload?.id||sessionId;}
      if(row.type==='response_item'&&['user','assistant'].includes(row.payload?.role)&&(row.payload.role!=='assistant'||!row.payload.phase||row.payload.phase==='final_answer')){role=row.payload.role;content=text(row.payload.content);messageId=row.payload.id||'';}
    }else{
      if(!cwd&&typeof row.cwd==='string')cwd=row.cwd;if(typeof row.sessionId==='string')sessionId=row.sessionId;
      if(['user','assistant'].includes(row.type)&&!row.isSidechain&&row.message){role=row.type;content=text(row.message.content);messageId=row.uuid||row.message.id||'';}
    }
    if(role&&content.trim()){
      const turn={role,content,at:Date.parse(row.timestamp)||updatedAt};
      const key=messageId?role+':'+messageId:'';if(key&&seen.has(key))turns[seen.get(key)]=turn;else{if(key)seen.set(key,turns.length);turns.push(turn);}
    }
  }
  return conversation({provider,id,sessionId,cwd,updatedAt,turns});
}
function claudeExport(raw){
  let data;try{data=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{throw Error('Choose a Claude conversations.json export, or a Codex / Claude Code .jsonl transcript.');}
  const rows=Array.isArray(data)?data:Array.isArray(data?.conversations)?data.conversations:data?.chat_messages?[data]:null;
  if(!rows||!rows.every(row=>row&&Array.isArray(row.chat_messages)))throw Error('This JSON is not a supported Claude conversations export.');
  if(rows.length>1000)throw Error('This export contains more than 1,000 chats. Import a smaller export.');
  return rows.map(row=>conversation({provider:'claude',id:createHash('sha256').update('claude-export:'+String(row.uuid||JSON.stringify(row))).digest('hex'),sessionId:typeof row.uuid==='string'?row.uuid:'',title:row.name,cwd:'',updatedAt:Date.parse(row.updated_at||row.created_at)||Date.now(),turns:row.chat_messages.filter(message=>message&&typeof message==='object').map(message=>({role:message.sender==='human'?'user':message.sender==='assistant'?'assistant':'other',content:text(message.content)||text(message.text),at:Date.parse(message.created_at)||undefined}))})).filter(chat=>chat.turns.length);
}
module.exports={jsonl,claudeExport};
