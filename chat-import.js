const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path');
const MAX_CHATS=100;
function sourceKey(chat){return chat.provider+':'+(chat.sessionId||chat.id);}
function createChatImporter({history,transaction,dialog,window,home,now=Date.now}){
  let files=new Map();
  async function scan(){
    const results=await Promise.allSettled(['codex','claude'].map(provider=>history.request('catalog',{provider}))),chats=[],errors=[],workspaces=[];
    results.forEach((result,index)=>{if(result.status==='fulfilled'){chats.push(...result.value.chats);workspaces.push(...result.value.workspaces);errors.push(...result.value.warnings);}else errors.push((index?'Claude':'Codex')+': '+result.reason.message);});
    return {chats:chats.sort((a,b)=>b.updatedAt-a.updatedAt),workspaces,errors};
  }
  async function chooseFile(){
    const selected=await dialog.showOpenDialog(window(),{title:'Import a Claude export or Codex / Claude Code transcript',properties:['openFile'],filters:[{name:'Conversations and transcripts',extensions:['json','jsonl','zst']}]});
    if(selected.canceled||!selected.filePaths?.[0])return {cancelled:true,chats:[]};
    const chats=await history.request('import-file',{file:selected.filePaths[0]});files=new Map(chats.map(chat=>[chat.provider+':'+chat.id,chat]));
    return {chats:chats.map(({turns,...chat})=>({...chat,turnCount:turns.length,fromFile:true})),errors:[]};
  }
  async function read(selection){
    if(!['codex','claude'].includes(selection?.provider)||!/^[a-f0-9]{64}$/.test(selection.id||''))throw Error('Choose a Claude or Codex conversation.');
    const chat=selection.fromFile?files.get(selection.provider+':'+selection.id):await history.request('read',{provider:selection.provider,id:selection.id,import:true});
    if(!chat)throw Error('This import preview expired. Choose the export file again.');return chat;
  }
  async function commit(request){
    if(!Array.isArray(request.chats)||!request.chats.length||request.chats.length>MAX_CHATS)throw Error('Select between 1 and 100 conversations.');
    const unique=new Map();for(const selected of request.chats){const chat=await read(selected);if(!chat.turns?.length)throw Error('This conversation has no importable messages.');unique.set(sourceKey(chat),chat);}
    const imported=[];let skipped=0;
    // Imports and normal chat saves share the same transaction queue. Never evict an
    // existing conversation to make room for an import, including concurrent imports.
    await transaction(async current=>{
      const existing=new Map(current.filter(chat=>chat.importSource).map(chat=>[sourceKey(chat.importSource),chat]));
      const newChats=[...unique].filter(([key])=>!existing.has(key));
      if(current.length+newChats.length>MAX_CHATS)throw Error('ATLAS has room for '+Math.max(0,MAX_CHATS-current.length)+' more conversations. Select fewer chats; existing chats were kept.');
      for(const [key,chat]of unique){
        if(existing.has(key)){skipped++;imported.push(existing.get(key));continue;}
        let cwd=home;try{if(path.isAbsolute(chat.cwd)&&(await fs.stat(chat.cwd)).isDirectory())cwd=chat.cwd;}catch{}
        const item={id:randomUUID(),title:chat.title,provider:'atlas',lastProvider:chat.provider,sessions:{codex:'',claude:''},cwd,updatedAt:now(),importSource:{provider:chat.provider,id:chat.id,sessionId:chat.sessionId||'',importedAt:now(),workspaceName:chat.workspaceName||'',workspaceId:chat.workspaceId||chat.cwd||'',truncated:Boolean(chat.truncated),originalTurnCount:chat.originalTurnCount||chat.turns.length},turns:chat.turns.slice(-80).map(turn=>({role:turn.role,content:turn.content,provider:turn.role==='assistant'?chat.provider:'',at:turn.at||chat.updatedAt||now()}))};
        current.push(item);imported.push(item);
      }
      return current;
    });
    return {imported:imported.length-skipped,skipped,chats:imported.map(({turns,...chat})=>({...chat,turnCount:turns.length}))};
  }
  return {scan,chooseFile,read,commit};
}
function registerChatImportIpc({ipcMain,trusted,...options}){
  const importer=createChatImporter(options);
  ipcMain.handle('atlas:history-import',async(event,request={})=>{
    if(!trusted(event))throw Error('Untrusted app window.');
    if(request.action==='scan')return importer.scan();if(request.action==='file')return importer.chooseFile();if(request.action==='preview')return importer.read(request.chat);if(request.action==='import')return importer.commit(request);
    throw Error('Choose an import action.');
  });
  return importer;
}
module.exports={createChatImporter,registerChatImportIpc};
