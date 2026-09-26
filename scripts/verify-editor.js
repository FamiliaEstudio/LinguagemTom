'use strict';
// Reproducible application scenarios; inspection uses Node's SQLite, not Tom's adapter.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {compileResolved}=require('../tom-lang/core/module-loader');
const {buildApplication,root,platform}=require('../tom-lang/core/native-build');
const output=path.join(platform,'validation-editor');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function environment(script) {
 const env={...process.env};for(const key of Object.keys(env))if(/^(TOM_|SDL_|LD_|DYLD_)/.test(key)||['CLANG','LLVM_OPT','NODE_PATH','NODE_OPTIONS'].includes(key))delete env[key];
 env.PATH=process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
 if(script)Object.assign(env,{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_UI_EVENTS:script});
 return env;
}
function inspect(dir) {
 const db=new DatabaseSync(path.join(dir,'editor-demonstracao.sqlite'),{readOnly:true});
 try{return {confirmed:db.prepare('SELECT * FROM tom_editor_documentos WHERE id=1').get(),recovery:db.prepare('SELECT * FROM tom_editor_recuperacoes WHERE id=1').get(),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check};}finally{db.close();}
}
function start(binary,dir,events,extraEnv={}) {
 const script=path.join(dir,`events-${Date.now()}.txt`);fs.writeFileSync(script,events);
 const child=spawn(binary,[],{cwd:dir,env:{...environment(script),...extraEnv},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,stdout,stderr}));});
 return {child,done};
}
async function finish(run) {
 const timer=setTimeout(()=>run.child.kill('SIGKILL'),20000);
 try {const r=await run.done;assert.equal(r.code,0,r.stdout+r.stderr);assert.equal(r.stdout.replaceAll('\r\n','\n'),'Editor encerrado.\n');}finally{clearTimeout(timer);}
}
async function scenarios(binary,optimization) {
 const dir=fs.mkdtempSync(path.join(output,'session-'));
 const manual='A memória do escritor: ação, café e coração.',draft=manual+' Recuperação posterior 👩🏽‍💻.';
 const writer=start(binary,dir,`keydown 97 64\ntext ${manual}\nkeydown 97 64\nmouse 42 92\nrelease 42 92\nkeydown 115 64\nwait 100\nkeydown 1073741901 64\ntext  Recuperação posterior 👩🏽‍💻.\nwait 2200\nwait 150\nwait 10000\n`);
 try {
  let ready=false;for(let i=0;i<300;i++){await delay(30);try{ready=inspect(dir).recovery?.texto===draft;}catch{}if(ready)break;if(writer.child.exitCode!==null)throw Error('Writer exited before recovery: '+JSON.stringify(await writer.done));}
  assert.ok(ready,'Automatic recovery did not commit');writer.child.kill('SIGKILL');await writer.done;
  const interrupted=inspect(dir);assert.equal(interrupted.integrity,'ok');assert.equal(interrupted.confirmed.texto,manual);assert.equal(interrupted.recovery.texto,draft);
  assert.ok(JSON.parse(interrupted.confirmed.documento).estilos.every(run=>run[1]&1),'Bold formatting was not saved');
  await finish(start(binary,dir,'mouse 110 378\nrelease 110 378\nkeydown 115 64\nwait 200\nquit\nwait 100\n'));
  const recovered=inspect(dir);assert.equal(recovered.confirmed.texto,draft);assert.equal(recovered.recovery,undefined);assert.equal(recovered.integrity,'ok');
  // Closing a dirty document, cancelling, then discarding must keep the manual version.
  await finish(start(binary,dir,'keydown 1073741901 64\ntext  DESCARTAR\nquit\nmouse 410 378\nrelease 410 378\nquit\nmouse 260 378\nrelease 260 378\nwait 100\n'));
  assert.equal(inspect(dir).confirmed.texto,draft);assert.equal(inspect(dir).recovery,undefined);
  const failedDir=fs.mkdtempSync(path.join(output,'open-failure-'));fs.mkdirSync(path.join(failedDir,'editor-demonstracao.sqlite'));const trace=path.join(failedDir,'error.trace');
  const failure=start(binary,failedDir,'quit\n',{TOM_UI_TRACE:trace});const timeout=setTimeout(()=>failure.child.kill('SIGKILL'),10000);const failed=await failure.done;clearTimeout(timeout);assert.equal(failed.code,0,failed.stderr);assert.equal(failed.stdout.replaceAll('\r\n','\n'),'Editor não iniciado.\n');assert.ok(fs.readFileSync(trace,'utf8').includes('Não foi possível abrir o editor'));
  return {optimization,directory:dir,startupErrorVisible:true,crashRecovery:true,manualAndRecoverySeparate:true,formatting:true,cancelAndDiscard:true};
 }finally{if(writer.child.exitCode===null&&writer.child.signalCode===null)writer.child.kill('SIGKILL');}
}
async function desktop(binary,optimization) {
 const dir=fs.mkdtempSync(path.join(output,'desktop-'));
 const nativeEnv=environment();nativeEnv.SDL_RENDER_DRIVER='software';if(process.platform!=='win32'){nativeEnv.SDL_VIDEODRIVER='x11';nativeEnv.SDL_VIDEO_X11_XINPUT2='0';}
 const child=spawn(binary,[],{cwd:dir,env:nativeEnv,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 const ready=path.join(dir,'saved.ready');
 const observe=setInterval(()=>{try{if(inspect(dir).confirmed.texto.includes('desktopeditor'))fs.writeFileSync(ready,'saved');}catch{}},100);
 const driver=process.platform==='win32'?['powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/desktop-windows.ps1'),'-ProcessId',String(child.pid),'-StateDemo','editor','-Production','-Ready',ready]]:['python3',[path.join(root,'scripts/desktop-linux.py'),String(child.pid),'--state','editor','--production','--ready',ready]];
 try {
  const result=await new Promise((resolve,reject)=>{const p=spawn(...driver,{env:process.env,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.once('error',reject);p.once('exit',code=>resolve({code,out}));});
  assert.equal(result.code,0,result.out);const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);const code=await done;clearTimeout(timeout);assert.equal(code,0,stderr);
  const state=inspect(dir);assert.ok(state.confirmed.texto.includes('desktopeditor'),'Native text input not saved');assert.equal(state.recovery,undefined);assert.equal(state.integrity,'ok');
  return {optimization,production:true,nativeDesktop:true,cleanEnvironment:true,binary,directory:dir};
 }finally{clearInterval(observe);if(child.exitCode===null)child.kill('SIGKILL');}
}
async function main() {
 fs.mkdirSync(output,{recursive:true});const file=path.join(root,'tom-lang/exemplos/editor/editor.tom');const result=compileResolved(fs.readFileSync(file,'utf8'),{file});assert.ok(result.success,JSON.stringify(result.diagnostics));const results=[];
 for(const optimize of ['-O0','-O2']) {
  const testBinary=buildApplication(result,file,path.join(output,'test',optimize.slice(1)),{testUI:true,optimize});
  results.push(await scenarios(testBinary,optimize));console.log(`Editor ${optimize}: salvar, formatar, interromper, recuperar, cancelar e descartar OK.`);
  const binary=buildApplication(result,file,path.join(output,'packages',optimize.slice(1)),{optimize});
  if(process.argv.includes('--desktop'))results.push(await desktop(binary,optimize));else results.push({optimization:optimize,production:true,binary,nativeDesktop:false});
 }
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({platform:process.platform,arch:process.arch,date:new Date().toISOString(),utf8proc:'2.11.3',unicode:'17.0.0',results},null,2)+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={main};
