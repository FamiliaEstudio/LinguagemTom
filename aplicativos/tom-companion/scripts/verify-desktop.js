'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {build}=require('./build'),{Session}=require('../../../tom-lang/companion/session');
const root=path.resolve(__dirname,'../../..');
async function main(){
  const supplied=process.argv.indexOf('--executable');
  const production=process.argv.includes('--package')||supplied>=0,executable=supplied>=0?path.resolve(process.argv[supplied+1]):build({testUI:!production,optimize:'-O2'});
  const dir=path.join(__dirname,'../build/desktop',process.platform,production?'production':'instrumented');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'calculadora.tom');fs.writeFileSync(file,'');fs.rmSync(path.join(dir,'.tom-companion'),{recursive:true,force:true});
  const env={...process.env,SDL_RENDER_DRIVER:'software',TOM_UI_TRACE:path.join(dir,'trace.txt'),TOM_UI_SNAPSHOT:path.join(dir,'snapshot.bmp')};delete env.SDL_VIDEODRIVER;delete env.TOM_UI_EVENTS;
  if(process.platform==='win32'){env.SDL_WINDOW_ACTIVATE_WHEN_SHOWN='0';env.SDL_MOUSE_AUTO_CAPTURE='0';}
  else env.SDL_VIDEO_X11_XINPUT2='0'; // Directed XSendEvent uses core X11 events.
  const nativeEnv={...env,PATH:process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin'};delete nativeEnv.LD_LIBRARY_PATH;
  const session=new Session({root,executable,file,env,nativeEnv}),failures=[],navigation=[];
  session.onNavigate=target=>navigation.push(target);session.on('failure',e=>failures.push(e.message));
  session.update(fs.readFileSync(path.join(__dirname,'../courses/calculadora/steps/00.tom'),'utf8'),6);
  const exited=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{session.dispose();reject(Error('Desktop companion timeout'));},45000);session.once('exit',r=>{clearTimeout(timer);resolve(r);});});exited.catch(()=>{});
  try{
    await session.start();
    const windows=process.platform==='win32';
    const driver=spawn(windows?'powershell.exe':'python3',windows?['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/desktop-windows.ps1'),'-ProcessId',String(session.child.pid),'-StateDemo','companion']: [path.join(root,'scripts/desktop-linux.py'),String(session.child.pid),'--state','companion'],{stdio:'inherit'});
    assert.equal(await new Promise((resolve,reject)=>{driver.on('error',reject);driver.on('exit',resolve);}),0);
    const end=await exited;assert.equal(end.code,0,JSON.stringify(failures));assert.deepEqual(failures,[]);
    const progress=JSON.parse(fs.readFileSync(path.join(dir,'.tom-companion/progresso.json')));assert.equal(progress.hints[0],1);assert.equal(progress.font,1);assert.ok(navigation.length);
    assert.equal(fs.readFileSync(file,'utf8'),'');
    if(!production)assert.ok(fs.statSync(path.join(dir,'snapshot.bmp')).size>100000);
    console.log(`Companion ${process.platform}: desktop real, teclado, mouse, redimensionamento, salvamento e encerramento (${production?'pacote':'recursos verificados'}).`);
  }finally{session.dispose();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
