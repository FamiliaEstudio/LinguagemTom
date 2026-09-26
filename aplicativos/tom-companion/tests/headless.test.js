'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildHeadless}=require('../scripts/build-headless');
const {Session,atomicProgress}=require('../../../tom-lang/companion/session');
const {GraphSession}=require('../../../tom-lang/companion/graph-session');
const root=path.resolve(__dirname,'../../..');
const env={DISPLAY:'',WAYLAND_DISPLAY:'',SDL_VIDEODRIVER:'invalid'};
function until(emitter,event,predicate=()=>true,timeout=20000){return new Promise((resolve,reject)=>{
 const clean=()=>{clearTimeout(timer);emitter.off(event,handler);emitter.off('failure',failed);};
 const failed=error=>{clean();reject(error);};
 const handler=value=>{if(predicate(value)){clean();resolve(value);}};
 const timer=setTimeout(()=>failed(Error('Timeout: '+event)),timeout);
 emitter.on(event,handler);emitter.on('failure',failed);
});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const optimize of ['-O0','-O2'])test('headless course: controls, verification, hidden state, save barrier and recovery '+optimize,{timeout:90000},async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tom-headless-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const executable=buildHeadless({optimize}),file=path.join(directory,'calculadora.tom');fs.writeFileSync(file,'');
 const copied=[],failures=[];let failSave=false;
 const s=new Session({root,file,executable,headless:true,env,onCopy:text=>copied.push(text),persist:(...args)=>{if(failSave)throw Error('Disco indisponível');return atomicProgress(...args);}});t.after(()=>s.dispose());s.on('failure',e=>failures.push(e.message));
 s.presentation.visible=true;s.update(fs.readFileSync(path.join(root,'aplicativos/tom-companion/courses/calculadora/steps/00.tom'),'utf8'),6);
 const view=until(s,'view',p=>p.explanation.includes('CÓDIGO:'));await s.start();await view;
 assert.equal(s.presentation.state.approved,false);
 const original=s.presentation.state.objective;
 const hinted=until(s,'view',p=>p.objective!==original);s.presentation.input({action:4});await hinted;await s.save();
 assert.equal(JSON.parse(fs.readFileSync(s.progressFile)).hints[0],1);
 const clipboard=until(s,'sent',p=>p.kind==='status'&&p.message.includes('copiado'));s.command(29);await clipboard;assert.deepEqual(copied,[s.course.steps[0].solution]);
 const checked=until(s,'view',p=>p.approved);s.command(1);await checked;
 const advanced=until(s,'view',p=>p.step===1);s.command(2);await advanced;
 s.presentation.setVisible(false);await pause(80);const sequence=s.presentation.sequence;
 s.command(4);await s.save();await pause(80);assert.equal(s.presentation.sequence,sequence);
 const restored=until(s,'view',p=>p.step===1&&p.sequence>sequence);s.presentation.setVisible(true);await restored;
 failSave=true;await assert.rejects(s.save(),/Disco indisponível/);assert.equal(s.disposed,false);failSave=false;await s.save();
 const before=s.revision;s.update('// edição não salva\n'+s.source,1);assert.ok(s.revision>before);
 const invalid=until(s,'view',p=>p.revision===s.revision&&!p.approved);await invalid;
 assert.equal(fs.readFileSync(file,'utf8'),'');assert.deepEqual(failures,[]);
});
for(const optimize of ['-O0','-O2'])test('headless map: atomic graph, Tom geometry, unsaved modules and visibility '+optimize,{timeout:90000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-map-headless-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'main.tom'),moduleFile=path.join(dir,'f.tom');fs.writeFileSync(file,"Importar[l'./f.tom']\nChamarxF[]");fs.writeFileSync(moduleFile,'DefFuncaoxF[]yVazio\nFimFuncao');
 const documents=[],navigation=[],failures=[];const g=new GraphSession({root,mapExecutable:buildHeadless({kind:'mapa',optimize}),headless:true,env,documents:()=>documents,onNavigate:p=>navigation.push(p)});t.after(()=>g.dispose());g.on('failure',e=>failures.push(e.message));g.presentation.visible=true;
 const initial=until(g,'view',p=>!p.stale&&Object.values(p.nodes).some(n=>n.label==='F'));g.start(file);const first=await initial;
 const fn=Object.values(first.nodes).find(n=>n.label==='F');const selected=until(g,'view',p=>p.selected===fn.id);g.send({kind:'select',node:fn.id});await selected;
 const expanded=until(g,'published');g.presentation.input({type:3,key:32,x:0,y:0,dx:0,dy:0,width:800,height:400});await expanded;
 documents.push({file:moduleFile,source:'DefFuncaoxF[]yVazio\nDefVarInSd32xAy1\nFimFuncao',revision:2});
 const updated=until(g,'view',p=>!p.stale&&Object.values(p.nodes).some(n=>n.label==='A'));g.update(0);const state=await updated;
 const a=Object.values(state.nodes).find(n=>n.label==='A'),oldX=a.x,oldY=a.y;
 const inp=extra=>g.presentation.input({type:3,key:0,x:0,y:0,dx:0,dy:0,width:800,height:400,...extra});
 const moved=until(g,'view',p=>Object.values(p.nodes).some(n=>n.id===a.id&&n.pinned));
 inp({type:4,x:oldX+10,y:oldY+10});inp({type:10,x:oldX+80,y:oldY+50});inp({type:11});const after=await moved;
 assert.ok(Math.abs(Object.values(after.nodes).find(n=>n.id===a.id).x-(oldX+70))<.001);
 const nav=until(g,'received',p=>p.kind==='navigate');inp({key:13});await nav;await pause(20);assert.equal(path.resolve(navigation.at(-1).file),path.resolve(moduleFile));
 const oldZoom=g.presentation.state.zoom,zoomed=until(g,'view',p=>p.zoom>oldZoom);inp({type:12,x:50,y:50,dy:1});await zoomed;
 const filtered=until(g,'view',p=>p.filter===4&&!p.stale&&Object.values(p.nodes).every(n=>[1,2,4].includes(n.category)));inp({key:52});await filtered;
 const reduced=until(g,'view',p=>p.reduced);inp({key:109});await reduced;
 g.presentation.setVisible(false);await pause(80);const seq=g.presentation.sequence;g.select(moduleFile,2);await pause(80);assert.equal(g.presentation.sequence,seq);
 const resumed=until(g,'view',p=>p.sequence>seq);g.presentation.setVisible(true);await resumed;
 assert.equal(fs.readFileSync(moduleFile,'utf8'),'DefFuncaoxF[]yVazio\nFimFuncao');assert.deepEqual(failures,[]);
});

test('maximum graph scene stays bounded, commits atomically and has no window dependency',{timeout:90000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-scene-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'empty.tom');fs.writeFileSync(file,'');
 const g=new GraphSession({root,mapExecutable:buildHeadless({kind:'mapa'}),headless:true,env});t.after(()=>g.dispose());const failures=[];g.on('failure',e=>failures.push(e.message));g.presentation.visible=true;
 g.on('received',p=>{if(p.kind==='failure')failures.push(JSON.stringify(p));});
 const first=until(g,'published');g.start(file);await first;
 const nodes=Array.from({length:512},(_,i)=>({id:2**51+i,group:i?2**51+i-1:0,category:2,state:0,label:'Elemento '+i,detail:'🐈'.repeat(3000),expanded:false}));
 const edges=Array.from({length:2048},(_,i)=>({id:2**51+i+10000,from:2**51+(i%512),to:2**51+((i+1)%512),category:3,state:0}));
 const scene=until(g,'view',p=>!p.stale&&Object.keys(p.nodes).length===512,15000);
 g.publish({nodes,edges,locations:{},diagnostics:[],success:true,revision:g.revision});let result;try{result=await scene;}catch(e){throw Error(e.message+'; failures='+JSON.stringify(failures)+'; pending='+JSON.stringify(g.pending&&{index:g.pending.index,total:g.pending.blocks.length})+'; nodes='+Object.keys(g.presentation.state?.nodes||{}).length);}
 assert.equal(Object.keys(result.edges).length,2048);assert.ok(Buffer.byteLength(JSON.stringify(result))<1048576);assert.deepEqual(failures,[]);
});
