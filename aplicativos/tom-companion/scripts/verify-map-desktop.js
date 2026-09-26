'use strict';
// Real, targeted desktop events. The tested executable has no Node/LLVM in PATH.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {buildMap}=require('./build-map'),{GraphSession}=require('../../../tom-lang/companion/graph-session');
const root=path.resolve(__dirname,'../../..');
async function main(){
  const production=process.argv.includes('--package');
  const executable=production?path.join(root,'aplicativos/tom-companion/build',process.platform,'O2/companion/mapa/mapa'+(process.platform==='win32'?'.exe':'')):buildMap({testUI:true});
  const dir=path.join(__dirname,'../build/map-desktop',process.platform,production?'production':'instrumented');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'main.tom');fs.writeFileSync(file,'DefFuncaoxF[]yVazio\nDefVarInSd32xAy1\nFimFuncao\nChamarxF[]');
  const env={...process.env,SDL_RENDER_DRIVER:'software',TOM_UI_TRACE:path.join(dir,'trace.txt'),TOM_UI_SNAPSHOT:path.join(dir,'snapshot.bmp')};delete env.SDL_VIDEODRIVER;delete env.TOM_UI_EVENTS;
  if(process.platform==='win32'){env.SDL_WINDOW_ACTIVATE_WHEN_SHOWN='0';env.SDL_MOUSE_AUTO_CAPTURE='0';}else env.SDL_VIDEO_X11_XINPUT2='0';
  const nativeEnv={...env,PATH:process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin'};delete nativeEnv.LD_LIBRARY_PATH;
  const failures=[],navigation=[],publications=[],packets=[];
  const session=new GraphSession({root,executable,env,nativeEnv,onNavigate:n=>navigation.push(n)});
  session.on('failure',e=>failures.push(e.message));session.on('published',v=>publications.push(v.nodes.map(n=>n.label)));session.on('received',p=>packets.push(p));session.on('log',l=>fs.appendFileSync(path.join(dir,'native.log'),l));
  let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{session.dispose();reject(Error('Mapa desktop excedeu 45 segundos.'));},45000);});
  try{
    const first=new Promise(resolve=>session.once('published',resolve));const exit=new Promise(resolve=>session.once('exit',resolve));session.start(file);await Promise.race([first,deadline]);
    const windows=process.platform==='win32';
    const driver=spawn(windows?'powershell.exe':'python3',windows?['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/desktop-windows.ps1'),'-ProcessId',String(session.child.pid),'-StateDemo','mapa']:[path.join(root,'scripts/desktop-linux.py'),String(session.child.pid),'--state','mapa'],{stdio:'inherit'});
    assert.equal(await Promise.race([new Promise((resolve,reject)=>{driver.on('error',reject);driver.on('exit',resolve);}),deadline]),0);
    assert.equal(await Promise.race([exit,deadline]),0);assert.deepEqual(failures,[]);assert.ok(navigation.length,'Enter deve navegar até o código');assert.ok(publications.some(labels=>labels.includes('A')),'Espaço deve expandir a função');
    if(!production)assert.ok(fs.statSync(path.join(dir,'snapshot.bmp')).size>100000);
    assert.equal(packets.filter(p=>p.kind==='filter').length,2,'Os filtros devem chegar ao analisador');
    console.log(`Mapa ${process.platform}: janela real, expansão, navegação, arraste, rolagem, foco, redimensionamento e encerramento (${production?'pacote independente':'objetos verificados'}).`);
  }finally{clearTimeout(timer);session.dispose();fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({failures,navigation,publications,packets},null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
