(() => {
  let database, pending, running;
  const versions=new Map();
  function open(){return database||=(new Promise((resolve,reject)=>{
    const request=indexedDB.open('atlas-colab-history',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('chats',{keyPath:'id'});request.result.createObjectStore('meta');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other ATLAS windows and retry.'));
  })).catch(error=>{database=null;throw error;});}
  function completed(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error||Error('History storage failed.'));transaction.onabort=()=>reject(transaction.error||Error('History storage was interrupted.'));});}
  async function load(legacy){
    const db=await open(),read=db.transaction(['chats','meta'],'readonly'),done=completed(read),chats=read.objectStore('chats').getAll(),meta=read.objectStore('meta').get('state');await done;
    let state={chats:chats.result,selected:meta.result?.selected||legacy.selected};
    if(!meta.result?.migrated){
      const merged=new Map(state.chats.map(chat=>[chat.id,chat]));for(const chat of legacy.chats)if(!merged.has(chat.id))merged.set(chat.id,chat);
      state.chats=[...merged.values()];await write(state);
    }
    for(const chat of state.chats)versions.set(chat.id,JSON.stringify(chat));return state;
  }
  async function write(state){
    const db=await open(),changed=state.chats.map(chat=>({chat,text:JSON.stringify(chat)})).filter(item=>versions.get(item.chat.id)!==item.text);
    const transaction=db.transaction(['chats','meta'],'readwrite'),done=completed(transaction);
    for(const {chat}of changed)transaction.objectStore('chats').put(chat);
    transaction.objectStore('meta').put({selected:state.selected,migrated:true},'state');await done;
    for(const {chat,text}of changed)versions.set(chat.id,text);
  }
  function save(state){
    pending=structuredClone(state);
    if(!running)running=(async()=>{while(pending){const next=pending;pending=null;await write(next);}})().finally(()=>{running=null;});
    return running;
  }
  window.atlasColabHistory={load,save,flush:()=>running||Promise.resolve()};
})();
