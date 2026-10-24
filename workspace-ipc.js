const fs = require('node:fs/promises');
const path = require('node:path');
const { command } = require('./workspace-service');
function registerWorkspaceIpc({ipcMain,app,dialog,clipboard,window,trusted,service,jobs,findCodex,findClaude}) {
  const handle=(name,fn)=>ipcMain.handle('atlas:'+name,async(event,request)=>{if(!trusted(event))throw Error('Untrusted app window.');return fn(request||{});});
  handle('projects',request=>service().profiles(request));
  async function confirmDirectEditing(request,status){
      const answer=await dialog.showMessageBox(window(),{type:'question',title:'Continue with your current project files?',message:'This project has uncommitted changes, so an isolated checkout cannot include your current work.',detail:'Selected folder: '+request.cwd+'\nRepository: '+status.root+'\n\nEdit the selected folder directly to continue using its current files. Colab will make changes in that folder and track the changes made by this task for review. ATLAS will not automatically commit, stash or discard your existing changes.\n\nTo keep isolated editing, cancel, commit or stash your changes yourself, then retry.',buttons:['Edit selected folder','Cancel'],defaultId:1,cancelId:1,noLink:true});
      return answer.response===0?{ready:true,isolated:false}:{ready:false};
  }
  handle('prepare-project',async request=>{
    if(request.workspaceId&&request.chatId){const tree=await require('./colab-workspace-reuse').reusableWorkspace({id:request.workspaceId,chatId:request.chatId,cwd:request.cwd,jobs:jobs(),service:service()});if(tree)return {ready:true,reuseWorkspace:true};}
    const status=await service().repository(request.cwd);
    if(status.exists&&status.hasCommit){
      if(!status.dirty)return {ready:true};
      return confirmDirectEditing(request,status);
    }
    const answer=await dialog.showMessageBox(window(),{type:'question',title:'Set up this Colab project?',message:status.needsOwnRepository?'The selected folder inherits Git from a broad parent folder.':status.exists?'This Git repository needs its first commit.':'This folder is not a Git project yet.',detail:'Folder: '+status.root+(status.ancestorRoot?'\nParent repository: '+status.ancestorRoot+'\nATLAS will leave the parent repository intact and create a separate repository inside the selected folder.':'')+'\n\nCreate a local Git repository and initial commit so Colab can work in an isolated copy? Existing project files will be included in the first local commit; common dependencies and .env/key files are excluded for a new repository. Review private files before continuing. Nothing is uploaded to GitHub. Existing Git repositories keep their current ignore rules and staged changes.',buttons:['Create initial Git snapshot','Cancel'],defaultId:1,cancelId:1,noLink:true});
    if(answer.response!==0)return {ready:false};const initialized=await service().initializeRepository(request.cwd);return initialized?.dirty?confirmDirectEditing(request,initialized):{ready:true};
  });
  handle('chat-metadata',request=>service().chatMeta(request));
  handle('attachment-preview',request=>service().preview(request.id));
  handle('attachments',async request=>{
    if(request.action==='clipboard') {let bytes;
      if(typeof clipboard.read==='function') {
        for(const item of await clipboard.read())if(item.types.includes('image/png')){const blob=await item.getType('image/png');bytes=Buffer.from(await blob.arrayBuffer());break;}
      } else if(typeof clipboard.readImage==='function') {
        const image=clipboard.readImage();if(!image.isEmpty())bytes=image.toPNG();
      }
      if(!bytes?.length)throw Error('Copy a screenshot or image to the clipboard first.');
      return service().importBuffers([{name:'Screenshot.png',bytes}]);}
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
      if(provider==='Claude Code'){
        try{const runtime=require('./claude-runtime'),version=await runtime.command(executable,['--version'],app.getPath('home'),{timeout:15000}),auth=await runtime.authStatus(executable,(exe,args,cwd)=>runtime.command(exe,args,cwd,{timeout:15000}),app.getPath('home'));results.push({name:provider,installed:true,ok:auth.loggedIn,version,path:executable,detail:auth.loggedIn?'CLI is responding and signed in.':auth.detail});}
        catch(error){results.push({name:provider,installed:true,ok:false,path:executable,detail:require('./claude-runtime').errorDetail(error)});}continue;
      }
      try{const version=await command(executable,['--version'],undefined,{timeout:15000});let loggedIn=false,detail='';try{const auth=await command(executable,args,undefined,{timeout:15000,includeStderr:true});loggedIn=provider==='Codex'?/logged in/i.test(auth)&&!/not logged in/i.test(auth):JSON.parse(auth).loggedIn===true;}catch{detail='Not signed in, or account status could not be checked. Use Sign in in Settings.';}results.push({name:provider,installed:true,ok:loggedIn,version,path:executable,detail:loggedIn?'CLI is responding and signed in.':detail||'Not signed in. Use Sign in in Settings.'});}catch(error){results.push({name:provider,installed:true,ok:false,path:executable,detail:error.message});}
    }
    for(const [name,executable,args] of [['Git','git',['--version']],['GitHub CLI','gh',['--version']]])try{results.push({name,ok:true,installed:true,version:(await command(executable,args,undefined,{timeout:10000})).split('\n')[0],detail:name==='GitHub CLI'?'Available for draft PR creation.':'Available for isolated worktrees and change review.'});}catch{results.push({name,ok:false,installed:false,detail:name==='Git'?'Install Git for Windows to use isolated worktrees.':'Optional. Without GitHub CLI, draft PR creation opens a browser comparison page after pushing.'});}
    const downloads={'Codex':'https://chatgpt.com/codex','Claude Code':'https://code.claude.com/docs/en/setup','Git':'https://git-scm.com/download/win','GitHub CLI':'https://cli.github.com/'};
    return{checkedAt:Date.now(),results:results.map(item=>({...item,downloadUrl:!item.installed?downloads[item.name]:''}))};
  });
}
module.exports={registerWorkspaceIpc};
