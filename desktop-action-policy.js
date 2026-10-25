const fs=require('node:fs/promises'),path=require('node:path');
const {screenAction}=require('./desktop-permissions');
const key=value=>process.platform==='win32'?value.toLowerCase():value;
const inside=(root,file)=>{const rel=path.relative(key(root),key(file));return !rel||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
// Resolve the nearest existing parent too, so new files through junctions use
// the same protection as existing files. Keep lexical paths for denial history.
async function canonical(file){let current=path.resolve(file),tail=[];for(;;){try{return path.join(await fs.realpath(current),...tail.reverse());}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;const parent=path.dirname(current);if(parent===current)throw error;tail.push(path.basename(current));current=parent;}}}
async function resolveExecutable(name,cwd,env){
 if(path.isAbsolute(name)||/[\\/]/.test(name))return canonical(path.resolve(cwd,name));
 const dirs=[path.join(cwd,'.venv','Scripts')];
 if(/^pythonw?(?:3(?:\.\d+)?)?$/i.test(name)&&env.LOCALAPPDATA){const python=path.join(env.LOCALAPPDATA,'Programs','Python');for(const item of await fs.readdir(python).catch(()=>[]))dirs.push(path.join(python,item));}
 dirs.push(...(env.PATH||env.Path||'').split(path.delimiter).filter(Boolean));
 const extensions=path.extname(name)?['']:process.platform==='win32'?['.exe','.com']:[''];
 for(const dir of dirs)for(const ext of extensions){const candidate=path.join(dir,name+ext);try{if((await fs.stat(candidate)).isFile())return fs.realpath(candidate);}catch{}}
 throw Error('Executable not found: '+name);
}
async function assessDesktopAction(tool,args={},cwd,{denied=[],env=process.env}={}){
 const paths=[],normalized={...args};let reason='',write=false;
 const add=async value=>{if(typeof value!=='string'||!value||value.includes('\0'))throw Error('A concrete file path is required.');const lexical=path.resolve(cwd||process.cwd(),value),actual=await canonical(lexical);paths.push(lexical,actual);return actual;};
 try{
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid tool arguments.');
  if(screenAction(tool,args))return {auto:true,arguments:args,paths};
  if(tool==='PowerShell')return require('./powershell-policy').assessPowerShell(args,cwd,{denied,env,assessFile:request=>assessDesktopAction('FileSystem',request,cwd,{denied,env})});
  if(tool==='FileSystem'){
   if(!['read','write','copy','move','delete','list','search','info'].includes(args.mode))throw Error('Unknown file operation.');
   normalized.path=await add(args.path);write=['write','copy','move','delete'].includes(args.mode);
   if(['copy','move'].includes(args.mode))normalized.destination=await add(args.destination);
   if(write){const info=await fs.stat(normalized.path).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(info?.isDirectory()&&['copy','move','delete'].includes(args.mode))reason='Bulk directory changes require approval so nested links and denied files can be reviewed.';if(info?.nlink>1&&args.mode==='write')reason='Editing a file with multiple hard links requires approval.';}
   if(write&&['delete','move'].includes(args.mode)&&await require('./project-root').createProjectRootGuard().isProtected(normalized.path))reason='This operation affects a whole user or system folder.';
  }else if(tool==='App'&&args.mode==='launch_executable'){
   if(!cwd)throw Error('Select a working folder before automatic app launches.');
   if(typeof args.executable!=='string'||!args.executable||args.args!==undefined&&!Array.isArray(args.args))throw Error('Use an executable and a structured argument list.');
   normalized.executable=await resolveExecutable(args.executable,cwd,env);await add(normalized.executable);
   const name=path.basename(normalized.executable).toLowerCase();
   if(/^(?:cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|reg|regedit|diskpart|format|bcdedit|schtasks|sc|msiexec|winget|choco|npx|npm|bash|wsl)(?:\.exe|\.com)?$/.test(name))reason='Command interpreters and system utilities need separate approval.';
   normalized.args=[];
   for(const arg of args.args||[]){if(typeof arg!=='string')throw Error('Invalid executable argument.');if(/^(?:-|\/)(?:c|command|encodedcommand|enc|m|e|eval|install|uninstall|remove|delete|format|executionpolicy)(?:[:=]|$)/i.test(arg))reason='This launch contains a command, installer or destructive option.';normalized.args.push(path.isAbsolute(arg)?await add(arg):arg);}
   normalized.cwd=await canonical(args.cwd?path.resolve(cwd,args.cwd):cwd);
   if(denied.some(file=>inside(file,normalized.cwd)))reason='This launch uses a previously denied folder.';
   for(const arg of normalized.args){if(!arg.startsWith('-')&&!path.isAbsolute(arg)&&!/^\w+:\/\//.test(arg))await add(path.resolve(normalized.cwd,arg));else if(arg.startsWith('-')&&arg.includes('='))reason='This option has an implicit target that needs separate approval.';}
   // Interpreter scripts and relative file arguments are also checked against
   // denial history. Runtime flags with hidden code remain manual approvals.
   if(/^(?:pythonw?(?:\d+(?:\.\d+)?)?|node|ruby|perl)(?:\.exe)?$/.test(name)){
    const first=normalized.args[0];if(!first||first.startsWith('-'))reason='Interpreter commands need separate approval.';
    else normalized.args[0]=await add(path.resolve(normalized.cwd,first));
   }
  }else if(tool==='App'&&(args.mode||'launch')==='launch'){
   if(typeof args.name!=='string'||!args.name.trim()||/[\\/:]/.test(args.name)||/\b(?:powershell|terminal|cmd|regedit|diskpart|installer)\b/i.test(args.name))reason='This app launch needs separate approval.';
  }else if(tool==='Clipboard'&&['read','write'].includes(args.mode)){
   // Clipboard access is already included in full desktop interaction.
  }else reason='This tool has opaque targets or system effects; inspect it before approval.';
  const blocked=denied.some(file=>paths.some(target=>inside(file,target)||inside(target,file)));
  if(blocked)reason='This action accesses a previously denied file or folder.';
  if(write||tool==='App'&&args.mode==='launch_executable'){
   const targets=tool==='App'?paths.slice(2):paths;
   const protectedRoots=[env.SystemRoot||env.WINDIR,env.ProgramFiles,env['ProgramFiles(x86)'],env.ProgramData].filter(Boolean);
   for(const root of protectedRoots){const actual=await canonical(root);if(targets.some(file=>inside(root,file)||inside(actual,file)))reason='This action changes or opens a protected system or application file.';}
   if(targets.some(file=>/[/\\](?:NTUSER\.DAT|UsrClass\.dat|bootmgr|pagefile\.sys|hiberfil\.sys)$/i.test(file)))reason='This action changes a protected system file.';
  }
  return {auto:!reason,arguments:normalized,paths:[...new Set(paths)],denialPaths:[...new Set(tool==='App'&&paths.length>2?paths.slice(2):paths)],reason};
 }catch(error){return {auto:false,arguments:args,paths:[...new Set(paths)],reason:error.message};}
}
module.exports={assessDesktopAction,canonical,inside,resolveExecutable};
