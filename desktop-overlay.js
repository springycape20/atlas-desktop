const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none;user-select:none}
.border{position:fixed;inset:1px;border:3px solid #54c5c0;border-radius:10px;box-sizing:border-box;box-shadow:inset 0 0 12px #54c5c033}
.label{position:fixed;top:3px;left:50%;transform:translateX(-50%);box-sizing:border-box;padding:6px 15px 7px;border-radius:0 0 9px 9px;background:#113a3b;color:#e5fffc;border:1px solid #54c5c0;border-top:0;font:600 12px/16px 'Segoe UI',sans-serif;white-space:nowrap}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#73e0cb;margin-right:7px;vertical-align:1px}
</style></head><body><div class="border"></div><div class="label"><span class="dot"></span>Atlas is controlling this PC</div></body></html>`;
function createDesktopOverlay({BrowserWindow,screen,onError=()=>{}}){
 const jobs=new Map(),windows=new Map();let closed=false;
 const destroy=entry=>{if(!entry.win.isDestroyed())entry.win.destroy();};
 async function reconcile(){
  if(closed)return;
  const displays=screen.getAllDisplays(),ids=new Set(displays.map(display=>display.id));
  for(const [id,entry]of windows)if(!ids.has(id)||entry.win.isDestroyed()){destroy(entry);windows.delete(id);}
  if(!jobs.size){for(const {win}of windows.values())if(!win.isDestroyed())win.hide();return;}
  if(!displays.length)throw Error('No screen is available for the ATLAS control indicator.');
  for(const display of displays){
   let entry=windows.get(display.id);
   if(!entry){
    const win=new BrowserWindow({...display.bounds,show:false,frame:false,transparent:true,backgroundColor:'#00000000',focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,enableLargerThanScreen:true,title:'ATLAS control indicator',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    win.setIgnoreMouseEvents(true);win.setAlwaysOnTop(true,'screen-saver');
    win.webContents.setWindowOpenHandler?.(()=>({action:'deny'}));
    win.webContents.on?.('will-navigate',event=>event.preventDefault());
    entry={win,ready:win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))};windows.set(display.id,entry);
   }
   entry.win.setBounds(display.bounds);await entry.ready;
   if(!closed&&jobs.size&&!entry.win.isDestroyed()&&!entry.win.isVisible())entry.win.showInactive();
  }
 }
 function end(jobId){const job=jobs.get(jobId);if(job){job.cleanup();jobs.delete(jobId);}if(!jobs.size)for(const {win}of windows.values())if(!win.isDestroyed())win.hide();}
 function endOwner(owner){for(const [id,job]of jobs)if(owner===undefined||job.owner===owner)end(id);}
 async function begin({jobId,owner,signal}){
  if(closed)throw Error('ATLAS control indicator is closed.');if(!jobId||signal?.aborted)throw Error('Desktop task is no longer active.');
  if(!jobs.has(jobId)){const abort=()=>end(jobId);jobs.set(jobId,{owner,cleanup:()=>signal?.removeEventListener('abort',abort)});signal?.addEventListener('abort',abort,{once:true});}
  try{await reconcile();if(signal?.aborted||!jobs.has(jobId))throw Error('Desktop task stopped before control began.');}
  catch(error){end(jobId);if(!jobs.size){for(const entry of windows.values())destroy(entry);windows.clear();}throw error;}
 }
 const changed=()=>{if(jobs.size)void reconcile().catch(onError);};
 for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on?.(name,changed);
 function close(){closed=true;endOwner();for(const entry of windows.values())destroy(entry);windows.clear();for(const name of ['display-added','display-removed','display-metrics-changed'])screen.removeListener?.(name,changed);}
 return {begin,end,endOwner,close,windows:()=>[...windows.values()].map(entry=>entry.win)};
}
module.exports={createDesktopOverlay,html};
