'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {platform,root}=require('../../../tom-lang/core/native-build');
const {packageApplication}=require('./package');
async function main(){
 const optimize=process.argv.includes('--debug')?'-O0':'-O2',binary=packageApplication({optimize});
 const directory=path.join(platform,'scriptorium/validation');fs.mkdirSync(directory,{recursive:true});const dir=fs.mkdtempSync(path.join(directory,'desktop-'));
 const windows=process.platform==='win32',env={...process.env,TOM_DATA_DIRECTORY:dir,SDL_RENDER_DRIVER:'software'};
 for(const key of ['TOM_UI_EVENTS','TOM_UI_TRACE','CLANG','LLVM_OPT','NODE_OPTIONS','LD_LIBRARY_PATH'])delete env[key];
 env.PATH=windows?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
 if(!windows){env.SDL_VIDEODRIVER='x11';env.SDL_VIDEO_X11_XINPUT2='0';}else delete env.SDL_VIDEODRIVER;
 const child=spawn(binary,[],{cwd:dir,env,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.stdout.resume();
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});const ready=path.join(dir,'saved.ready');
 const observe=setInterval(()=>{let db;try{db=new DatabaseSync(path.join(dir,'acervo/dados.sqlite'),{readOnly:true});if(db.prepare('SELECT conteudo FROM acervo').get()?.conteudo.includes('desktopscriptorium'))fs.writeFileSync(ready,'saved');}catch{}finally{db?.close();}},100);
 const args=windows?['powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/desktop-windows.ps1'),'-ProcessId',String(child.pid),'-StateDemo','scriptorium','-Production','-Ready',ready]]:['python3',[path.join(root,'scripts/desktop-linux.py'),String(child.pid),'--state','scriptorium','--production','--ready',ready]];
 const timeout=setTimeout(()=>child.kill('SIGKILL'),45000);
 try{
  const driver=await new Promise((resolve,reject)=>{const p=spawn(...args,{env:process.env,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.once('error',reject);p.once('exit',code=>resolve({code,out}));});assert.equal(driver.code,0,driver.out);assert.equal(await done,0,errors);
  const db=new DatabaseSync(path.join(dir,'acervo/dados.sqlite'),{readOnly:true});try{assert.match(db.prepare('SELECT conteudo FROM acervo').get().conteudo,/desktopscriptorium/);assert.equal(db.prepare('SELECT count(*) AS n FROM versoes').get().n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM tom_editor_recuperacoes').get().n,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
  const report={platform:process.platform,optimize,date:new Date().toISOString(),binary,dir,nativeDesktop:true,cleanPath:true,physicalABNT2:false};fs.writeFileSync(path.join(directory,`desktop-${optimize.slice(1)}.json`),JSON.stringify(report,null,2)+'\n');console.log('Scriptorium: janela nativa, escrita, salvamento, ficha e redimensionamento OK.');
 }finally{clearInterval(observe);clearTimeout(timeout);if(child.exitCode===null)child.kill('SIGKILL');}
}
module.exports={main};if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
