const fs=require('node:fs');
class ProviderHealth {
  constructor(file,clock=Date.now){this.file=file;this.clock=clock;this.store=require('./atomic-store').createAtomicStore(file);try{this.state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{this.state={};}}
  save(){return this.store.save(this.state);}
  flush(){return this.store.flush();}
  limited(provider,error){const previous=this.state[provider];const attempts=(previous?.attempts||0)+1;const match=String(error?.message||'').match(/retry (?:in|after)\s+(\d+)\s*(seconds?|minutes?|hours?)/i);const delay=match?Number(match[1])*({s:1000,m:60000,h:3600000}[match[2][0].toLowerCase()]):Math.min(3600000,900000*2**(attempts-1));this.state[provider]={attempts,retryAt:this.clock()+Math.max(1000,Math.min(delay,86400000)),estimated:!match};this.save();}
  available(provider){return !(this.state[provider]?.retryAt>this.clock());}
  clear(provider){if(!this.state[provider])return;delete this.state[provider];this.save();}
  snapshot(){return ['codex','claude'].map(provider=>({provider,...this.state[provider],available:this.available(provider)}));}
  choose(preferred){if(this.available(preferred))return preferred;const other=preferred==='codex'?'claude':'codex';return this.available(other)?other:null;}
}
module.exports={ProviderHealth};
