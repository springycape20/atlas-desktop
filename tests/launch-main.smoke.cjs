// Run with Electron, passing the actual main.js to verify a copied checkout.
// Uses fresh app data and never submits a provider task.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const main=path.resolve(process.argv[2]||path.join(__dirname,'..','main.js'));
const data=process.env.ATLAS_LAUNCH_TEST_DATA;if(!data)throw Error('Set ATLAS_LAUNCH_TEST_DATA to a temporary folder.');
fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({voiceEngine:'windows',speakResponses:false,wakeWordEnabled:false}));
app.setPath('userData',data);app.disableHardwareAcceleration();
let done=false,checking=false;
const fail=error=>{console.error('FAIL: '+error.message);app.exit(1);};
process.on('unhandledRejection',fail);process.on('uncaughtException',fail);
const timeout=setTimeout(()=>fail(Error('The actual app did not finish startup and expose its Tools menu.')),30000);
const timer=setInterval(async()=>{
 if(done||checking)return;const win=BrowserWindow.getAllWindows().find(win=>!win.isDestroyed());if(!win||win.webContents.isLoadingMainFrame())return;checking=true;
 try{
  const result=await win.webContents.executeJavaScript(`(async()=>{if(!document.querySelector('#colabTools')||!window.atlas?.integrations)return null;const tools=await atlas.integrations();return {ready:Array.isArray(tools.integrations),title:document.title};})()`);
  if(!result)return;if(!result.ready)throw Error('The integration IPC did not return its configuration.');
  done=true;clearTimeout(timeout);clearInterval(timer);console.log('PASS: Actual main.js boots, creates the window, shows Colab Tools and serves integration IPC: '+main);app.quit();
 }catch(error){fail(error);}finally{checking=false;}
},100);
require(main);
