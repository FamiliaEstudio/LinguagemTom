'use strict';
// Exercise the production C binary on the actual desktop, targeting its PID only.
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {build}=require('./build');
const {root}=require('../../tom-lang/core/native-build');
const finished=child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(status,signal)=>resolve({status,signal}));});
async function main() {
  const binary=build('-O2').desktop;
  const env={...process.env};
  for(const key of ['SDL_VIDEODRIVER','SDL_RENDER_DRIVER','TOM_UI_EVENTS','TOM_UI_TRACE','TOM_UI_SNAPSHOT','LD_LIBRARY_PATH']) delete env[key];
  env.PATH=process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
  const app=spawn(binary,[],{env,stdio:'inherit'}),exited=finished(app);
  let driver;
  const timeout=setTimeout(()=>{app.kill();if(driver)driver.kill();},30000);
  try {
    const windows=process.platform==='win32';
    driver=spawn(windows?'powershell.exe':'python3',windows?
      ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/desktop-windows.ps1'),'-ProcessId',String(app.pid)]:
      [path.join(root,'scripts/desktop-linux.py'),String(app.pid)],{stdio:'inherit'});
    const [input,result]=await Promise.all([finished(driver),exited]);
    assert.equal(input.status,0,'Desktop input driver failed');assert.equal(input.signal,null);
    assert.equal(result.status,0,'Production calculator failed');assert.equal(result.signal,null);
    console.log(`C desktop opened, received targeted input/resize and closed: ${binary}`);
  } finally {
    clearTimeout(timeout);
    if(app.exitCode===null)app.kill();
    if(driver && driver.exitCode===null)driver.kill();
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
