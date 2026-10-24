const fs=require('node:fs/promises');
const path=require('node:path');

// uv's minor-version junction can be broken even when the patch installation
// is complete. Use the real interpreter, leaving shared uv installations alone.
async function findWindowsToolPython(directory){
  const root=path.resolve(directory,'tools','python');let entries;
  try{entries=await fs.readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const architecture=process.arch==='arm64'?'aarch64':'x86_64';
  const pattern=new RegExp('^cpython-3\\.14\\.(\\d+)-windows-'+architecture+'-none$');
  const candidates=entries.filter(entry=>entry.isDirectory()&&pattern.test(entry.name)).sort((a,b)=>Number(b.name.match(pattern)[1])-Number(a.name.match(pattern)[1]));
  const realRoot=await fs.realpath(root);
  for(const candidate of candidates){
    try{const folder=await fs.realpath(path.join(root,candidate.name)),relative=path.relative(realRoot,folder);if(relative.startsWith('..')||path.isAbsolute(relative))continue;const executable=path.join(folder,'python.exe');if((await fs.stat(executable)).isFile())return executable;}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
  }
  return null;
}
function useWindowsToolPython(spec,executable){
  const args=spec.args||[],index=args.indexOf('--python');
  if(!executable||index<0||args[index+1]!=='3.14')return false;
  spec.args=[...args];spec.args[index+1]=executable;return true;
}
module.exports={findWindowsToolPython,useWindowsToolPython};
