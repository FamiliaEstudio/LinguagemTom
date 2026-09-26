'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('../scripts/build');
const {Session}=require('../../../tom-lang/companion/session');
const root=path.resolve(__dirname,'../../..');
function until(emitter,event,predicate,timeout=20000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{emitter.off(event,handler);reject(Error('Timeout: '+event));},timeout);const handler=value=>{if(predicate(value)){clearTimeout(timer);emitter.off(event,handler);resolve(value);}};emitter.on(event,handler);});}
for(const optimize of ['-O0','-O2'])test(`native companion and host: unsaved code, verification, hints, progress and cleanup ${optimize}`,{timeout:60000},async()=>{
  const executable=build({optimize,testUI:true,bundle:false,isolation:String(process.pid)});
  const dir=path.join(root,'aplicativos/tom-companion/build/integration',process.platform,String(process.pid),optimize.slice(1));fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'calculadora.tom');fs.writeFileSync(file,'');
  const events=path.join(dir,'events.txt');fs.writeFileSync(events,('wait 50\n').repeat(160)+'quit\nwait 50\n');
  const failures=[],sent=[],copied=[];
  const session=new Session({root,executable,file,onCopy:async text=>copied.push(text),env:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_UI_EVENTS:events,TOM_UI_TRACE:path.join(dir,'trace.txt'),TOM_UI_SNAPSHOT:path.join(dir,'snapshot.bmp')}});
  session.on('received',p=>fs.appendFileSync(path.join(dir,'protocol.log'),JSON.stringify(p)+'\n'));session.on('failure',e=>failures.push(e.message));session.on('sent',p=>sent.push(p));
  const source=fs.readFileSync(path.join(__dirname,'../courses/calculadora/steps/00.tom'),'utf8');session.update(source,source.split('\n').findIndex(line=>line.startsWith('Somar'))+1);
  const analysis=until(session,'sent',p=>p.kind==='analysis'&&p.instruction?.kind==='math');const exit=until(session,'exit',()=>true,30000);exit.catch(()=>{});
  try{
    await session.start();await analysis;
    const revealed=until(session,'received',p=>p.kind==='save'&&p.progress.hints[0]===3);
    const clipboard=until(session,'sent',p=>p.kind==='status'&&p.message.includes('copiado'));session.command(29);await clipboard;await revealed;
    assert.deepEqual(copied,[session.course.steps[0].solution]);
    const checked=until(session,'sent',p=>p.kind==='verification');session.command(1);
    const result=await checked;assert.equal(result.passed,true,JSON.stringify(result));
    const advanced=until(session,'received',p=>p.kind==='save'&&p.progress.step===1);session.command(2);await advanced;
    const hint=until(session,'received',p=>p.kind==='save'&&p.progress.hints[1]===1);session.command(4);await hint;
    const adjusted=until(session,'received',p=>p.kind==='save'&&p.progress.font===1);session.command(11);await adjusted;
    const ended=await exit;assert.equal(ended.code,0,JSON.stringify(failures));assert.deepEqual(failures,[]);
    assert.equal(fs.readFileSync(file,'utf8'),'');
    const progress=JSON.parse(fs.readFileSync(path.join(dir,'.tom-companion/progresso.json'),'utf8'));
    assert.equal(progress.step,1);assert.equal(progress.hints[1],1);assert.equal(progress.font,1);assert.match(progress.verified[0],/^[a-f0-9]{64}$/);
    assert.ok(fs.statSync(path.join(dir,'snapshot.bmp')).size>1000);
  }finally{session.dispose();}
});
for(const mode of ['resume','invalid'])test(`native companion restores history without approval and recovers persistence: ${mode}`,{timeout:45000},async()=>{
  const {defaults,atomicProgress}=require('../../../tom-lang/companion/session');
  const executable=build({optimize:'-O2',testUI:true,bundle:false,isolation:String(process.pid)});
  const dir=path.join(root,'aplicativos/tom-companion/build/recovery',process.platform,String(process.pid),mode);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(path.join(dir,'.tom-companion'),{recursive:true});
  const file=path.join(dir,'calculadora.tom'),progressFile=path.join(dir,'.tom-companion/progresso.json');fs.writeFileSync(file,'');
  const course=require('../courses/calculadora/roteiro.json'),progress=defaults(course);progress.step=3;progress.hints[3]=2;progress.verified[3]='a'.repeat(64);
  const original=mode==='invalid'?'{"version":999}':JSON.stringify(progress);fs.writeFileSync(progressFile,original);
  const events=path.join(dir,'events.txt');fs.writeFileSync(events,'wait 25\n'.repeat(200)+'quit\n');
  let failOnce=mode==='resume';const failures=[];
  const session=new Session({root,file,executable,persist:async(...args)=>{if(failOnce){failOnce=false;throw Error('Disco indisponível no teste');}return atomicProgress(...args);},env:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_UI_EVENTS:events,TOM_UI_TRACE:path.join(dir,'trace.txt')}});
  session.on('failure',e=>failures.push(e.message));
  const initialized=until(session,'sent',p=>p.kind==='init'),analyzed=until(session,'sent',p=>p.kind==='analysis'&&p.instruction);const exited=until(session,'exit',()=>true);exited.catch(()=>{});
  session.update('DefVarInSd32xAy1',1);
  try{
    await session.start();const init=await initialized;await analyzed;
    if(mode==='invalid')assert.match(init.notice,/restaurar/);else assert.equal(init.progress.step,3);
    const saved=until(session,'sent',p=>p.kind==='saved');session.command(2);session.command(10);
    const reply=await saved;
    if(mode==='resume'){assert.equal(reply.success,false);const retried=until(session,'sent',p=>p.kind==='saved'&&p.success);session.command(10);await retried;}else assert.equal(reply.success,true);
    const end=await exited;assert.equal(end.code,0,JSON.stringify(failures));assert.deepEqual(failures,[]);
    const current=JSON.parse(fs.readFileSync(progressFile));assert.equal(current.step,mode==='resume'?3:0);
    if(mode==='resume'){assert.equal(current.verified[3],'a'.repeat(64));assert.equal(current.hints[3],2);assert.match(fs.readFileSync(path.join(dir,'trace.txt'),'utf8'),/progresso continua na memória/);}
    else{const backup=fs.readdirSync(path.dirname(progressFile)).find(n=>n.includes('.invalid-'));assert.ok(backup);assert.equal(fs.readFileSync(path.join(path.dirname(progressFile),backup),'utf8'),original);}
    assert.equal(fs.readFileSync(file,'utf8'),'');
  }finally{session.dispose();}
});
