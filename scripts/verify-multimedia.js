'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {compileResolved}=require('../tom-lang/core/module-loader');
const {buildApplication,root,platform}=require('../tom-lang/core/native-build');
const finished=child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(status,signal)=>resolve({status,signal}));});
async function main() {
  const desktop=process.argv.includes('--desktop'),production=process.argv.includes('--package');
  const directory=path.join(platform,'validation-03');fs.mkdirSync(directory,{recursive:true});
  const examples=path.join(root,'tom-lang/exemplos/multimedia');
  const records=[];
  for(const optimize of (desktop||production?['-O2']:['-O0','-O2']))for(const name of ['animacao','teclado','catalogo','audio']) {
    const file=path.join(examples,name+'.tom');
    const result=compileResolved(fs.readFileSync(file,'utf8'),{file});assert.ok(result.success,JSON.stringify(result.diagnostics));
    const binary=buildApplication(result,file,path.join(directory,production?'packages':desktop?'desktop':optimize.slice(1)),{optimize,testUI:!production,assets:path.join(examples,'assets')});
    const trace=path.join(directory,`${name}-${optimize.slice(1)}.trace`),snapshot=path.join(directory,`${name}-${optimize.slice(1)}.bmp`);
    const env={...process.env,SDL_RENDER_DRIVER:'software'};
    delete env.TOM_UI_EVENTS;delete env.SDL_VIDEODRIVER;delete env.SDL_AUDIODRIVER;delete env.LD_LIBRARY_PATH;
    if(!production) {env.TOM_UI_TRACE=trace;env.TOM_UI_SNAPSHOT=snapshot;}
    else {delete env.TOM_UI_TRACE;delete env.TOM_UI_SNAPSHOT;}
    if(!desktop && !production) {
      env.SDL_VIDEODRIVER='dummy';env.SDL_AUDIODRIVER='dummy';
      env.TOM_UI_EVENTS=path.join(directory,`${name}.events`);
      fs.writeFileSync(env.TOM_UI_EVENTS,'wait 40\nresize 1000 600\nkey 99\nkey 32\nkey 32\nwait 40\nquit\n');
    }
    env.PATH=process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
    const app=spawn(binary,[],{env,stdio:'inherit'}),exited=finished(app);
    let driver;const timeout=setTimeout(()=>{app.kill();if(driver)driver.kill();},30000);
    try {
      if(desktop||production) {
        const windows=process.platform==='win32';
        driver=spawn(windows?'powershell.exe':'python3',windows?
          ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'desktop-windows.ps1'),'-ProcessId',String(app.pid),'-Multimedia']:
          [path.join(__dirname,'desktop-linux.py'),String(app.pid),'--multimedia'],{stdio:'inherit'});
        const input=await finished(driver);assert.equal(input.status,0,'Input driver failed');assert.equal(input.signal,null);
      }
      const status=await exited;assert.equal(status.status,0,`${name} failed`);assert.equal(status.signal,null);
      if(!production) {
        const output=fs.readFileSync(trace,'utf8');assert.ok(output.includes('FRAME'));
        assert.ok(!/Falha de recurso|Entrada inválida|Capacidade do buffer/.test(output),output);
        assert.ok(fs.statSync(snapshot).size>100000);
      }
      records.push({name,optimize,binary,desktop:desktop||production,production,status:'passed'});
      console.log(`${name} ${optimize}: ${production?'production package':desktop?'real desktop':'scripted events'} passed`);
    } finally {clearTimeout(timeout);if(app.exitCode===null)app.kill();if(driver && driver.exitCode===null)driver.kill();}
  }
  fs.writeFileSync(path.join(directory,production?'packages.json':desktop?'desktop.json':'verification.json'),JSON.stringify(records,null,2)+'\n');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
