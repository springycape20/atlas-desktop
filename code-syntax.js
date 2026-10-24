(() => {
  const extensions={js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'jsx',ts:'typescript',tsx:'tsx',py:'python',pyw:'python',json:'json',jsonc:'javascript',css:'css',html:'markup',htm:'markup',xml:'markup',svg:'markup',vue:'markup',sh:'bash',bash:'bash',zsh:'bash',ps1:'powershell',psm1:'powershell',psd1:'powershell',yaml:'yaml',yml:'yaml',md:'markdown',mdx:'markdown',rs:'rust',go:'go',java:'java',cs:'csharp',c:'c',h:'c',cpp:'cpp',cc:'cpp',cxx:'cpp',hpp:'cpp',sql:'sql',rb:'ruby',rake:'ruby'};
  let worker,id=0;const pending=new Map();
  function language(path){const name=String(path||'').split(/[\\/]/).at(-1).toLowerCase();return extensions[name.split('.').at(-1)]||(['bashrc','zshrc','.bashrc','.zshrc'].includes(name)?'bash':'');}
  function fail(){worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timer);item.resolve({lines:null,reason:'unavailable'});}pending.clear();}
  function highlight(text,path){
    const grammar=language(path);if(!grammar||text.length>120000||text.split('\n').length>4000)return Promise.resolve({lines:null,reason:grammar?'large':'unsupported'});
    return new Promise(resolve=>{
      try{
        if(!worker){worker=new Worker(new URL('syntax-worker.js',document.baseURI));worker.onmessage=event=>{const item=pending.get(event.data.id);if(!item)return;pending.delete(event.data.id);clearTimeout(item.timer);item.resolve(event.data);};worker.onerror=event=>{event.preventDefault();fail();};}
        const request=++id,timer=setTimeout(fail,2000);pending.set(request,{resolve,timer});worker.postMessage({id:request,text,language:grammar});
      }catch{fail();resolve({lines:null,reason:'unavailable'});}
    });
  }
  function append(target,runs){for(const run of runs||[]){if(!run.types.length){target.append(document.createTextNode(run.text));continue;}const token=document.createElement('span');token.className='token '+run.types.join(' ');token.textContent=run.text;target.append(token);}}
  window.atlasSyntax={language,highlight,append};
})();
