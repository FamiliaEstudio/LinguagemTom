'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {compileResolved}=require('../tom-lang/core/module-loader');
const {buildApplication,root,platform}=require('../tom-lang/core/native-build');
const finish=child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(status,signal)=>resolve({status,signal}));});
const click=(x,y)=>`mouse ${x} ${y}\nrelease ${x} ${y}\n`;
const interfaceEvents=click(70,100)+click(250,100)+click(50,160)+'mouse 100 160\nmotion 600 160\nrelease 600 160\nfocuslost\nfocusgain\ndown 9 43 0\nup 9 43\ndown 13 40 0\nup 13 40\nresize 930 600\nquit\n';
const laboratoryEvents=click(260,445)+click(80,445)+'wait 2200\ndown 97 4 0\nup 97 4\ndown 97 4 0\ndown 99 6 0\ndown 97 4 1\nup 97 4\nup 99 6\n'+click(680,498)+'mouse 80 498\nmotion 250 498\nrelease 250 498\n'+click(120,548)+'down 122 29 0\nup 122 29\ndown 122 29 0\nup 122 29\n'+click(460,548)+click(450,445)+click(650,445)+'wait 20\n'.repeat(160)+'resize 1200 900\nquit\n';
function instrument(result) {
  result.artifacts.llvm=result.artifacts.llvm.replace('define i32 @main()', 'define i32 @tom_program_main()')+`
declare i64 @tom_live_objects()
declare i64 @tom_peak_objects()
define i32 @main() {
  %status = call i32 @tom_program_main()
  %live = call i64 @tom_live_objects()
  %peak = call i64 @tom_peak_objects()
  %leaked = icmp ne i64 %live, 0
  %grew = icmp ugt i64 %peak, 256
  %bad = or i1 %leaked, %grew
  %exit = select i1 %bad, i32 91, i32 %status
  ret i32 %exit
}\n`;
}
async function main(){
  const desktop=process.argv.includes('--desktop'),production=process.argv.includes('--package');
  const output=path.join(platform,'validation-04'),records=[];fs.mkdirSync(output,{recursive:true});
  const selection=process.argv.indexOf('--example');
  const names=selection>=0?[process.argv[selection+1]]:desktop||production?['interface','laboratorio']:['estado','entrada-dados','interface','laboratorio'];
  assert.ok(names.every(n=>['estado','entrada-dados','interface','laboratorio'].includes(n)),'Unknown example');
  for(const optimize of desktop||production?['-O2']:['-O0','-O2'])for(const name of names){
    const file=path.join(root,'tom-lang/exemplos/estado',name+'.tom'),result=compileResolved(fs.readFileSync(file,'utf8'),{file});
    assert.ok(result.success,JSON.stringify(result.diagnostics));if(!production)instrument(result);
    const binary=buildApplication(result,file,path.join(output,production?'packages':desktop?'desktop':optimize.slice(1)),{optimize,testUI:!production,assets:name==='laboratorio'?path.join(root,'tom-lang/exemplos/multimedia/assets'):undefined});
    const data=path.join(output,`${name}-${optimize.slice(1)}-data`),trace=path.join(output,`${name}-${optimize.slice(1)}.trace`),snapshot=path.join(output,`${name}-${optimize.slice(1)}.bmp`);
    if(!production)fs.rmSync(data,{recursive:true,force:true});
    const env={...process.env,SDL_RENDER_DRIVER:'software'};
    // XSendEvent targets one window through core X11 events, not the XI2 path.
    if(process.platform!=='win32'&&(desktop||production))env.SDL_VIDEO_X11_XINPUT2='0';
    if(process.platform==='win32'&&(desktop||production)) {
      // Directed messages must not steal the user's keyboard or capture the global mouse.
      env.SDL_WINDOW_ACTIVATE_WHEN_SHOWN='0';env.SDL_MOUSE_AUTO_CAPTURE='0';
    }
    for(const key of ['TOM_UI_EVENTS','SDL_VIDEODRIVER','SDL_AUDIODRIVER','LD_LIBRARY_PATH','TOM_UI_TRACE','TOM_UI_SNAPSHOT','TOM_DATA_DIRECTORY'])delete env[key];
    if(process.env.TOM_VERIFY_AUDIO_DRIVER)env.SDL_AUDIODRIVER=process.env.TOM_VERIFY_AUDIO_DRIVER;
    if(!production){env.TOM_UI_TRACE=trace;env.TOM_UI_SNAPSHOT=snapshot;env.TOM_DATA_DIRECTORY=data;env.TOM_UI_TRACE_INPUT='1';}
    const gui=['interface','laboratorio'].includes(name);
    if(!desktop&&!production){env.SDL_VIDEODRIVER='dummy';env.SDL_AUDIODRIVER='dummy';env.TOM_UI_EVENTS=path.join(output,`${name}.events`);fs.writeFileSync(env.TOM_UI_EVENTS,name==='laboratorio'?laboratoryEvents:name==='interface'?interfaceEvents:'');}
    env.PATH=process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
    const app=spawn(binary,[],{env,stdio:['ignore','pipe','pipe']}),exited=finish(app);let stdout='',stderr='',driver;
    app.stdout.on('data',x=>stdout+=x);app.stderr.on('data',x=>stderr+=x);
    const timeout=setTimeout(()=>{app.kill();if(driver)driver.kill();},60000);
    try{
      if(gui&&(desktop||production)){
        const windows=process.platform==='win32';
        driver=spawn(windows?'powershell.exe':'python3',windows?
          ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'desktop-windows.ps1'),'-ProcessId',String(app.pid),'-StateDemo',name,'-Trace',trace,...(production?['-Production']:[])]:
          [path.join(__dirname,'desktop-linux.py'),String(app.pid),'--state',name,'--trace',trace,...(production?['--production']:[])],{stdio:'inherit'});
        const driven=await finish(driver);assert.equal(driven.status,0,'Desktop input failed');
      }
      const status=await exited;assert.equal(status.signal,null,stderr);assert.equal(status.status,0,stdout+stderr);
      if(gui&&!production){
        const content=fs.readFileSync(trace,'utf8');assert.ok(content.includes('FRAME'));
        assert.ok(!/VISUAL (?:Falha de recurso|Entrada inválida|Capacidade|Índice|A posição de áudio|Overflow|Memória insuficiente)/.test(content),content.slice(-10000));
        assert.ok(fs.statSync(snapshot).size>100000);
        if(name==='interface')assert.ok(content.includes('VISUAL Contador: 1 | volume: 100%'),content.slice(-8000));
        if(name==='laboratorio'){
          assert.ok(content.includes('Reprodução concluída.'),content.slice(-10000));
          const config=JSON.parse(fs.readFileSync(path.join(data,'configuracao.json'),'utf8'));
          const replay=JSON.parse(fs.readFileSync(path.join(data,'sessao.json'),'utf8'));
          assert.equal(config.calibracao.entradaNs,'5000000');assert.ok(config.volume>0.5);
          assert.equal(config.versao,1);assert.equal(config.teclas.length,9);assert.equal(config.teclas[0],122);assert.equal(typeof config.semente,'string');
          assert.equal(replay.formato,'TomReplay');assert.ok(replay.eventos.length>8);assert.equal(typeof replay.origemNs,'string');
          assert.ok(replay.eventos.every(e=>typeof e.tempoNs==='string'&&typeof e.capturadoNs==='string'));
          // A fresh process must restore the configuration saved by the native UI.
          const restored=path.join(output,`${name}-${optimize.slice(1)}-restored.trace`),quit=path.join(output,'restore.events');
          fs.writeFileSync(quit,'quit\n');
          const reopened=spawn(binary,[],{env:{...env,SDL_VIDEODRIVER:'dummy',SDL_AUDIODRIVER:'dummy',TOM_UI_EVENTS:quit,TOM_UI_TRACE:restored},stdio:'ignore'});
          const restoreStatus=await finish(reopened);assert.equal(restoreStatus.status,0);
          assert.ok(fs.readFileSync(restored,'utf8').includes('5/0/0'));
        }
      }
      records.push({name,optimize,binary,desktop:desktop||production,production,status:'passed'});console.log(`${name} ${optimize}: ${production?'production package':desktop?'desktop':'scripted'} passed`);
    }finally{clearTimeout(timeout);if(app.exitCode===null)app.kill();if(driver&&driver.exitCode===null)driver.kill();}
  }
  fs.writeFileSync(path.join(output,production?'packages.json':desktop?'desktop.json':'verification.json'),JSON.stringify(records,null,2)+'\n');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
