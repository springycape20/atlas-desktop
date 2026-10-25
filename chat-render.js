(function(root){
  function memo(cache,key,signature,create){const old=cache.get(key);if(old&&old.signature.length===signature.length&&signature.every((value,i)=>Object.is(value,old.signature[i])))return old.value;const value=create();cache.set(key,{signature,value});return value;}
  function reconcile(parent,nodes){let cursor=parent.firstChild;for(const node of nodes){if(node===cursor)cursor=cursor.nextSibling;else parent.insertBefore(node,cursor);}while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}}
  const api={memo,reconcile};if(typeof module==='object')module.exports=api;else root.atlasChatRender=api;
})(globalThis);
