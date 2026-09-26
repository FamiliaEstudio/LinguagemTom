'use strict';
// Uses an already installed Code executable; no editor download or global settings.
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
async function main(){
  const code=option('--code');if(!code)throw Error('Informe --code CAMINHO_DO_EXECUTAVEL_CODE. WSL: acrescente --wsl Ubuntu --wsl-extension CAMINHO_REMOTE_WSL.');
  const wsl=option('--wsl'),platform=wsl?'linux':process.platform;
  const install=path.join(root,'aplicativos/tom-companion/build',platform,'O2/companion');assert.ok(fs.existsSync(path.join(install,'companion-install.json')),'Build the companion before testing the editor.');
  const dir=path.join(root,'aplicativos/tom-companion/build/vscode',platform),result=path.join(dir,'result.json');fs.mkdirSync(dir,{recursive:true});fs.rmSync(result,{force:true});
  const toWindows=value=>{if(process.platform==='win32')return value;const r=spawnSync('wslpath',['-w',value],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
  const profile=path.join(root,'.tools','companion-editor-'+platform),extensions=profile+'-extensions';fs.mkdirSync(extensions,{recursive:true});
  if(wsl){const remote=option('--wsl-extension');if(!remote)throw Error('Informe a pasta da extensão Remote WSL instalada usando --wsl-extension.');fs.cpSync(remote,path.join(extensions,path.basename(remote)),{recursive:true});}
  const remotePath=process.platform==='win32'?'/mnt/'+root[0].toLowerCase()+root.slice(2).replace(/\\/g,'/'):root;
  const remoteRoot=wsl?'vscode-remote://wsl+'+wsl+remotePath:null;
  const windowsLauncher=process.platform==='win32'||!!wsl;
  const args=[
    '--extensionDevelopmentPath='+(wsl?remoteRoot+'/tom-lang':path.join(root,'tom-lang')),
    '--extensionTestsPath='+(wsl?remoteRoot+'/aplicativos/tom-companion/tests/vscode-host.js':path.join(__dirname,'../tests/vscode-host.js')),
    '--user-data-dir='+(windowsLauncher?toWindows(profile):profile),
    '--extensions-dir='+(windowsLauncher?toWindows(extensions):extensions),
    '--disable-workspace-trust','--skip-welcome','--skip-release-notes','--disable-updates',
    ...(wsl?['--folder-uri='+remoteRoot+'/aplicativos/tom-companion/build/vscode/linux']:[dir]),
  ];
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  if(windowsLauncher)env.PATHEXT='.COM;.EXE;.BAT;.CMD';
  let launcher=code,launchArgs=args;
  const stdout=path.join(dir,'editor.stdout'),stderr=path.join(dir,'editor.stderr');
  if(wsl&&process.platform!=='win32'){
    const request=path.join(dir,'launch.json');fs.writeFileSync(request,JSON.stringify({code:toWindows(code),arguments:args,stdout:toWindows(stdout),stderr:toWindows(stderr)}));
    launcher='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';launchArgs=['-NoProfile','-ExecutionPolicy','Bypass','-File',toWindows(path.join(__dirname,'editor-windows.ps1')),'-Request',toWindows(request)];
  }
  const child=spawn(launcher,launchArgs,{env,stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',s=>{if(output.length<262144)output+=s;});
  const status=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('VS Code test exceeded 120 seconds.'));},120000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',n=>{clearTimeout(timer);resolve(n);});});
  if(wsl&&process.platform!=='win32')for(const file of [stdout,stderr])if(fs.existsSync(file))output+=fs.readFileSync(file,'utf8');
  fs.writeFileSync(path.join(dir,'editor.log'),output);assert.equal(status,0,output.slice(-3000));assert.ok(fs.existsSync(result),'The editor did not produce its test result; inspect '+path.join(dir,'editor.log'));
  console.log(fs.readFileSync(result,'utf8'));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
