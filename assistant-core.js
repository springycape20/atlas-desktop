// Decode provider events without exposing tool output or reasoning to speech.
function createDecoder(provider, onText, onActivity = () => {}) {
  let buffer = '', hasPartial = false;
  const seen = new Set();
  function line(value) {
    let event; try { event = JSON.parse(value); } catch { return; }
    if(provider==='codex'&&['item.started','item.completed','item.updated'].includes(event.type)&&event.item){const item=event.item;if(item.type==='todo_list')onActivity({kind:'plan',text:(item.items||[]).map(x=>(x.completed?'Done: ':'Next: ')+x.text).join('\n')});else if(item.type==='file_change')onActivity({kind:'files',text:(item.changes||[]).map(x=>x.kind+': '+x.path).join('\n')});else if(['command_execution','mcp_tool_call','web_search'].includes(item.type))onActivity({kind:'activity',text:item.type+' · '+(item.status||event.type)+(Number.isInteger(item.exit_code)?' · exit '+item.exit_code:'')});}
    if(provider==='claude'&&event.type==='assistant')for(const part of event.message?.content||[])if(part.type==='tool_use'){const key='tool:'+part.id;if(!seen.has(key)){seen.add(key);onActivity({kind:part.name==='TodoWrite'?'plan':'activity',text:part.name==='TodoWrite'?JSON.stringify(part.input?.todos||[]):'Tool requested: '+part.name});}}
    if (provider === 'codex' && event.type === 'item.completed' && event.item?.type === 'agent_message') {
      const key = event.item.id || event.item.text;
      if (!seen.has(key)) { seen.add(key); onText((event.item.text || '') + '\n'); }
    }
    if (provider === 'claude') {
      if (event.type === 'stream_event' && event.event?.type === 'message_start') hasPartial = false;
      if (event.type === 'stream_event' && event.event?.delta?.type === 'text_delta') {
        hasPartial = true; onText(event.event.delta.text || '');
      }
      if (event.type === 'assistant' && !hasPartial) {
        const key = event.message?.id;
        if (!seen.has(key)) { seen.add(key); for (const part of event.message?.content || []) if (part.type === 'text') onText(part.text || ''); }
      }
    }
  }
  return { push(part) { buffer += part; const lines = buffer.split(/\r?\n/); buffer = lines.pop(); lines.forEach(line); }, finish() { if (buffer.trim()) line(buffer); buffer = ''; } };
}
module.exports = { createDecoder };
