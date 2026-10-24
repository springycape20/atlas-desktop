const {app,BrowserWindow,protocol}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-colab-browser-'));
app.disableHardwareAcceleration();app.setPath('userData',path.join(temp,'data'));
protocol.registerSchemesAsPrivileged([{scheme:'atlas',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const chats=Array.from({length:14},(_,index)=>({id:'chat-'+index,title:'Project discussion '+index,cwd:index%2?'C:/Projects/Website':'C:/Projects/Game',projectName:index%2?'Website':'Game',createdAt:index+1,updatedAt:index+1,draft:'',messages:Array.from({length:72},(_,turn)=>({id:'message-'+index+'-'+turn,role:turn%2?'assistant':'user',content:(turn%2?'Result ':'Question ')+turn+' for project '+index+'\n'+('Earlier project details.\n').repeat(6),at:1700000000000+turn*1000})),busy:false}));
const mock=`if(!localStorage.getItem('colabBrowserSeed')){localStorage.setItem('atlas.colab.chats.v1',JSON.stringify(${JSON.stringify({chats,selected:chats[0].id})}));localStorage.setItem('colabBrowserSeed','1');}
window.atlas=new Proxy({getSettings:async()=>({wakeWordEnabled:false,speakResponses:false,voiceEngine:'windows'}),home:async()=>'C:/Projects',latestConversation:async()=>null,jobs:async()=>[],onJobs:()=>{},onCollaborationStatus:fn=>window.colabStatus=fn,providerAuthStatus:async()=>({codex:{installed:true,loggedIn:true},claude:{installed:true,loggedIn:true}}),discoverModels:async()=>({codex:{models:[]},claude:{models:[]}}),updates:async()=>({status:'source',currentVersion:'test'}),chatMetadata:async()=>({})},{get:(target,key)=>target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>[])});`;
let win;const timeout=setTimeout(()=>{console.error('Colab browser test timed out');app.exit(1);},45000);timeout.unref();
app.whenReady().then(async()=>{try{
 protocol.handle('atlas',request=>{const file=new URL(request.url).pathname.slice(1);if(!file)return new Response(fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head><script>'+mock+'</script>'),{headers:{'Content-Type':'text/html;charset=utf-8'}});return new Response(fs.readFileSync(path.join(root,file)),{headers:{'Content-Type':'application/javascript;charset=utf-8'}});});
 win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{backgroundThrottling:false}});await win.loadURL('atlas://app/');
 await win.webContents.executeJavaScript(`(async()=>{
   await atlasColab.ready;if(atlasColab.history().length!==14)throw Error('Legacy chats were pruned');atlasColab.selectChat('chat-0');if(atlasColab.current().messages.length!==72)throw Error('Legacy messages were pruned');
   const transcript=document.querySelector('#colabTranscript');transcript.scrollTop=190;transcript.dispatchEvent(new Event('scroll'));const top=transcript.scrollTop;
   colabStatus({id:'new-run',chatId:'chat-0',status:'Reviewing'});if(transcript.scrollTop!==top)throw Error('Progress moved reader');
   colabStatus({id:'new-run',chatId:'chat-0',result:'New saved final result'});if(transcript.scrollTop!==top)throw Error('Result moved reader');
   if(document.querySelector('#colabLatest').hidden)throw Error('Latest button missing');
   const find=document.querySelector('#colabFind');find.value='Question 0 for project 0';find.dispatchEvent(new Event('input'));if(document.querySelector('#colabMatches').textContent!=='1 / 1')throw Error('Old message search failed');
   const compares=[...transcript.querySelectorAll('.colab-message-actions button')].filter(button=>button.textContent==='Compare');compares[0].click();[...transcript.querySelectorAll('.colab-message-actions button')].find(button=>button.textContent==='Compare').click();document.querySelector('#colabCompare').click();
   const comparison=document.querySelector('.colab-compare');if(!comparison.open||comparison.querySelectorAll('pre').length!==2||!comparison.textContent.includes('Result 1 for project 0'))throw Error('Comparison failed');comparison.close();
   find.value='';find.dispatchEvent(new Event('input'));transcript.scrollTop=230;transcript.dispatchEvent(new Event('scroll'));atlasColab.selectChat('chat-1');atlasColab.selectChat('chat-0');if(transcript.scrollTop!==230)throw Error('Chat scroll was not restored');
   atlasColab.selectAssistant();atlasColab.refreshMessages();atlasColab.selectChat('chat-0');if(transcript.scrollTop!==230)throw Error('Workspace switching lost reading position');
   const projects=document.querySelector('#colabProjectFilter');projects.value='c:/projects/game';projects.dispatchEvent(new Event('change'));if(document.querySelectorAll('.colab-chat-item').length!==7)throw Error('Project filter failed');
   atlasColab.applyProfile({id:'web-profile',name:'Website',cwd:'C:/Projects/Website',effort:'medium'});if(atlasColab.current().cwd!=='C:/Projects/Website'||atlasColab.history().find(chat=>chat.id==='chat-0').turns.length!==73)throw Error('Switching project rewrote previous conversation');
   atlasColab.selectChat('chat-0');await atlasColabHistory.flush();
 })()`);
 await win.reload();await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 await win.webContents.executeJavaScript(`(async()=>{await atlasColab.ready;atlasColab.selectChat('chat-0');if(atlasColab.history().length!==14||atlasColab.current().messages.length!==73||!atlasColab.current().messages[0].content.startsWith('Question 0')||atlasColab.current().messages.at(-1).content!=='New saved final result')throw Error('IndexedDB reload lost chat history');})()`);
 for(const [width,height]of [[1280,800],[800,600],[640,600]]){
  win.setContentSize(width,height);for(let attempt=0;attempt<40;attempt++){const size=await win.webContents.executeJavaScript('[innerWidth,innerHeight]');if(size[0]===width&&size[1]===height)break;await new Promise(resolve=>setTimeout(resolve,50));}
  const bounds=await win.webContents.executeJavaScript(`(()=>{const transcript=document.querySelector('#colabTranscript'),form=document.querySelector('#colabForm');return {height:transcript.clientHeight,formBottom:form.getBoundingClientRect().bottom,outerHeight:document.documentElement.scrollHeight,outerWidth:document.documentElement.scrollWidth,width:innerWidth,heightLimit:innerHeight};})()`);
  assert(bounds.height>35&&bounds.formBottom<=height+1&&bounds.outerHeight<=height+1&&bounds.outerWidth<=width+1,JSON.stringify(bounds));
 }
 win.setContentSize(1280,800);await new Promise(resolve=>setTimeout(resolve,100));
 fs.writeFileSync(path.join(temp,'colab-history.png'),(await win.webContents.capturePage()).toPNG());
 console.log('PASS: IndexedDB migration/reload, 14 chats and 73 turns, project selection, old-message search, comparison, live-update scroll preservation and three viewport sizes.');console.log('Preview: '+path.join(temp,'colab-history.png'));
 }catch(error){console.error(error);process.exitCode=1;}finally{clearTimeout(timeout);win?.destroy();app.exit(process.exitCode||0);}});
