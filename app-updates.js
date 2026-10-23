function createAppUpdates({app,updater,notify=()=>{},busy=()=>false,fetchRelease=defaultFetch}) {
  const version=app.getVersion(),source=!app.isPackaged;let state={status:'idle',currentVersion:version,source},pending;
  const set=value=>{state={...state,...value};notify({...state});};
  if(!source){
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
    updater.on('checking-for-update',()=>set({status:'checking',error:''}));
    updater.on('update-available',info=>set({status:'available',version:info.version,percent:0,error:''}));
    updater.on('update-not-available',()=>set({status:'current',error:''}));
    updater.on('download-progress',info=>set({status:'downloading',percent:Math.round(info.percent)}));
    updater.on('update-downloaded',info=>set({status:'downloaded',version:info.version,percent:100,error:''}));
    updater.on('error',error=>set({status:'error',error:readable(error)}));
  }
  async function action(request={}){
    if(!request.action||request.action==='status')return {...state};
    if(pending)return pending;
    if(request.action==='install'){
      if(source||state.status!=='downloaded')throw Error('Download an update before restarting.');
      if(busy())throw Error('Finish or stop running tasks before installing the update.');
      set({status:'installing'});setImmediate(()=>updater.quitAndInstall(false,true));return {...state};
    }
    if(request.action==='download'&&(source||state.status!=='available'))throw Error('Check for an available installed-app update first.');
    if(!['check','download'].includes(request.action))throw Error('Unknown update action.');
    pending=(async()=>{try{
      if(request.action==='download'){set({status:'downloading',percent:0,error:''});await updater.downloadUpdate();}
      else if(source){set({status:'checking',error:''});const release=await fetchRelease();set({status:newer(release.tag_name,version)?'source-available':'source',version:String(release.tag_name||'').replace(/^v/,''),url:'https://github.com/springycape20/atlas-desktop/releases/latest'});}
      else await updater.checkForUpdates();
    }catch(error){set({status:'error',error:readable(error)});}finally{pending=null;}return {...state};})();return pending;
  }
  return {action};
}
function readable(error){return 'Update check/download failed. '+String(error.message||error).slice(0,350)+' Try again, or open GitHub Releases.';}
function newer(tag,current){const parse=v=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(v||'')?.slice(1).map(Number);const a=parse(tag),b=parse(current);if(!a||!b)return false;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
async function defaultFetch(){const response=await fetch('https://api.github.com/repos/springycape20/atlas-desktop/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('GitHub returned '+response.status);return response.json();}
module.exports={createAppUpdates,newer};
