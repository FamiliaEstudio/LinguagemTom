'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const {build,app}=require('./build');
const finish=p=>new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',(status,signal)=>resolve({status,signal}));});
// Windows can briefly retain a freshly linked executable while scanning it.
async function launch(file,args,options){
 for(let attempt=0;;attempt++){
  try{const child=spawn(file,args,options);await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});return child;}
  catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=19)throw error;await new Promise(resolve=>setTimeout(resolve,200));}
 }
}
async function main(){
 const production=process.argv.includes('--package'),windows=process.platform==='win32',optimize=process.argv.includes('--O0')?'-O0':'-O2';
 const out=path.join(app,'build',windows?'windows':'linux',(production?'package':'desktop')+(optimize==='-O0'?'-O0':''));fs.mkdirSync(out,{recursive:true});
 fs.rmSync(path.join(out,'verification.json'),{force:true});
 const binary=build({optimize,testUI:!production,leaks:!production,output:out}),trace=path.join(out,'desktop.trace'),data=path.join(out,'data');
 if(!production)fs.rmSync(data,{recursive:true,force:true});
 const env={...process.env,SDL_RENDER_DRIVER:'software'};
 for(const k of ['TOM_UI_EVENTS','TOM_UI_TRACE','TOM_UI_SNAPSHOT','TOM_DATA_DIRECTORY','SDL_VIDEODRIVER','SDL_AUDIODRIVER','LD_LIBRARY_PATH'])delete env[k];
 if(process.env.TOM_VERIFY_AUDIO_DRIVER)env.SDL_AUDIODRIVER=process.env.TOM_VERIFY_AUDIO_DRIVER;
 if(!production){env.TOM_UI_TRACE=trace;env.TOM_DATA_DIRECTORY=data;env.TOM_UI_TRACE_INPUT='1';}
 if(windows){env.SDL_WINDOW_ACTIVATE_WHEN_SHOWN='0';env.SDL_MOUSE_AUTO_CAPTURE='0';env.PATH=`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`;}
 else{env.SDL_VIDEO_X11_XINPUT2='0';env.PATH='/usr/bin:/bin';}
 const child=await launch(binary,[],{env,stdio:['ignore','pipe','pipe']}),ended=finish(child);let stdout='',stderr='',driver;
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const timeout=setTimeout(()=>{child.kill();driver?.kill();},60000);
 try{
  const scripts=path.resolve(app,'../../scripts');
  driver=spawn(windows?'powershell.exe':'python3',windows?['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(scripts,'desktop-windows.ps1'),'-ProcessId',String(child.pid),'-StateDemo','musical','-Trace',trace,...(production?['-Production']:[])]:[path.join(scripts,'desktop-linux.py'),String(child.pid),'--state','musical','--trace',trace,...(production?['--production']:[])],{stdio:'inherit'});
  assert.equal((await finish(driver)).status,0,'Desktop driver');const r=await ended;assert.equal(r.signal,null,stderr);assert.equal(r.status,0,stdout+stderr);
  if(!production){
   const content=fs.readFileSync(trace,'utf8');assert.ok(content.includes('APRENDER'),content.slice(-3000));assert.ok(content.includes('Ajuda: esta nota'),content.slice(-3000));assert.ok(content.includes('PAUSADO'),content.slice(-3000));assert.ok(!content.includes('Rodada interrompida'),content.slice(-3000));
   const profile=JSON.parse(fs.readFileSync(path.join(data,'perfil.json'),'utf8'));assert.equal(profile.teclas[0],122);assert.equal(profile.config.entradaNs,'5000000');
  }
  const receipt={platform:process.platform,version:'0.1.0',optimize,production,binary,sha256:createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),status:'passed',audio:env.SDL_AUDIODRIVER||'system device',time:new Date().toISOString()};fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(receipt);
 }finally{clearTimeout(timeout);if(child.exitCode===null)child.kill();if(driver&&driver.exitCode===null)driver.kill();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
