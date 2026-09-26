'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('../scripts/build'),{Session}=require('../../../tom-lang/companion/session');
const root=path.resolve(__dirname,'../../..');
test('mouse copies before hints and after returning to the step card', {timeout:45000}, async()=>{
  const executable=build({testUI:true,bundle:false,isolation:'copy-button-'+process.pid});
  const dir=path.join(root,'aplicativos/tom-companion/build/copy-button',process.platform,String(process.pid));fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'calculadora.tom'),events=path.join(dir,'events.txt');fs.writeFileSync(file,'');
  const click=(x,y)=>`mouse ${x} ${y}\nrelease ${x} ${y}\n`;
  fs.writeFileSync(events,'wait 50\n'.repeat(20)+click(392,251)+'wait 50\n'.repeat(4)+click(450,640)+'wait 50\n'.repeat(4)+click(392,251)+'wait 50\n'.repeat(10)+'quit\n');
  const copied=[],failures=[],s=new Session({root,file,executable,onCopy:async text=>copied.push(text),env:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_UI_EVENTS:events}});
  s.on('failure',e=>failures.push(e.message));
  const ended=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Companion did not close')),20000);s.once('exit',value=>{clearTimeout(timer);resolve(value);});});
  try{
    await s.start();const result=await ended;assert.equal(result.code,0,JSON.stringify(failures));assert.deepEqual(failures,[]);
    assert.deepEqual(copied,[s.course.steps[0].solution,s.course.steps[0].solution]);
    assert.equal(JSON.parse(fs.readFileSync(s.progressFile,'utf8')).hints[0],3);assert.equal(fs.readFileSync(file,'utf8'),'');
  }finally{s.dispose();}
});
