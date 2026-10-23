const fs = require('node:fs/promises');
const path = require('node:path');
const { command } = require('./workspace-service');
function registerWorkspaceIpc({ipcMain,app,dialog,clipboard,window,trusted,service,jobs,findCodex,findClaude}) {
  const handle=(name,fn)=>ipcMain.handle('atlas:'+name,async(event,request)=>{if(!trusted(event))throw Error('Untrusted app window.');return fn(request||{});});
  handle('projects',request=>service().profiles(request));
  handle('chat-metadata',request=>service().chatMeta(request));
  handle('attachment-preview',request=>service().preview(request.id));
  handle('attachments',async request=>{
    if(request.action==='clipboard') {const image=clipboard.readImage();if(image.isEmpty())throw Error('Copy a screenshot or image to the clipboard first.');return service().importBuffers([{name:'Screenshot.png',bytes:image.toPNG()}]);}
    let paths=request.paths;
    if(!paths){const result=await dialog.showOpenDialog(window(),{title:'Choose files to share with your providers',properties:['openFile','multiSelections']});if(result.canceled)return[];paths=result.filePaths;}
    return service().importPaths(paths);
  });
  handle('export-chat',async request=>{
    if(typeof request.markdown!=='string'||request.markdown.length>2000000)throw Error('Chat export is empty or too large.');
    const title=String(request.title||'ATLAS conversation').replace(/[<>:"/\\|?*\x00-\x1f]/g,'').slice(0,100)||'Conversation';
    const result=await dialog.showSaveDialog(window(),{title:'Export conversation as Markdown',defaultPath:path.join(app.getPath('documents'),title+'.md'),filters:[{name:'Markdown',extensions:['md']}]});
    if(result.canceled||!result.filePath)return{saved:false};await fs.writeFile(result.filePath,request.markdown,'utf8');return{saved:true,path:result.filePath};
  });
  handle('review-changes',async request=>{
    if(jobs().some(job=>job.workspaceId===request.id&&job.status==='running'))throw Error('Stop or finish the task before reviewing and applying its changes.');
    return !request.action||request.action==='review'?service().review(request.id):service().reviewAction(request);
  });
  handle('diagnostics',async()=>{
    const results=[];
    for(const [provider,executable,args] of [['Codex',findCodex(),['login','status']],['Claude Code',findClaude(),['auth','status']]]){
      if(!executable){results.push({name:provider,installed:false,ok:false,detail:provider==='Claude Code'?'Missing CLI. Use Install and sign in in Settings.':'Missing CLI. Install the Codex desktop app or set CODEX_EXECUTABLE.'});continue;}
      try{const version=await command(executable,['--version'],undefined,{timeout:15000});let loggedIn=false,detail='';try{const auth=await command(executable,args,undefined,{timeout:15000,includeStderr:true});loggedIn=provider==='Codex'?/logged in/i.test(auth)&&!/not logged in/i.test(auth):JSON.parse(auth).loggedIn===true;}catch{detail='Not signed in, or account status could not be checked. Use Sign in in Settings.';}results.push({name:provider,installed:true,ok:loggedIn,version,path:executable,detail:loggedIn?'CLI is responding and signed in.':detail||'Not signed in. Use Sign in in Settings.'});}catch(error){results.push({name:provider,installed:true,ok:false,path:executable,detail:error.message});}
    }
    for(const [name,executable,args] of [['Git','git',['--version']],['GitHub CLI','gh',['--version']]])try{results.push({name,ok:true,installed:true,version:(await command(executable,args,undefined,{timeout:10000})).split('\n')[0],detail:name==='GitHub CLI'?'Available for draft PR creation.':'Available for isolated worktrees and change review.'});}catch{results.push({name,ok:false,installed:false,detail:name==='Git'?'Install Git for Windows to use isolated worktrees.':'Optional. Without GitHub CLI, draft PR creation opens a browser comparison page after pushing.'});}
    return{checkedAt:Date.now(),results};
  });
}
module.exports={registerWorkspaceIpc};
