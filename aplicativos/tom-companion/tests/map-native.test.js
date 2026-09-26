'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildMap}=require('../scripts/build-map');
const {GraphSession}=require('../../../tom-lang/companion/graph-session');
const root=path.resolve(__dirname,'../../..');
const until=(emitter,event,predicate=()=>true,timeout=20000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{emitter.off(event,handler);reject(Error('Timeout '+event));},timeout);const handler=value=>{if(predicate(value)){clearTimeout(timer);emitter.off(event,handler);resolve(value);}};emitter.on(event,handler);});
for(const optimize of ['-O0','-O2'])test('mapa nativo: revisões não salvas, expansão, navegação e limpeza '+optimize,{timeout:90000},async()=>{
 const executable=buildMap({optimize,testUI:true});
 const dir=path.join(root,'aplicativos/tom-companion/build/map-tests',process.platform,optimize.slice(1));fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'main.tom'),module=path.join(dir,'funcao.tom');fs.writeFileSync(file,"Importar[l'./funcao.tom']\nChamarxF[]");fs.writeFileSync(module,'DefFuncaoxF[]yVazio\nFimFuncao');
 let source='DefFuncaoxF[]yVazio\nDefVarInSd32xAy1\nFimFuncao',revision=1;
 const events=path.join(dir,'events.txt');fs.writeFileSync(events,'wait 40\n'.repeat(90)+'quit\n');
 const failures=[],packets=[],navigations=[],publications=[];
 const s=new GraphSession({root,executable,documents:()=>[{file:module,source,revision}],onNavigate:n=>navigations.push(n),env:{SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software',TOM_UI_EVENTS:events,TOM_UI_TRACE:path.join(dir,'trace.txt')}});
 s.on('failure',e=>failures.push(e.message));s.on('received',p=>packets.push(p));s.on('log',l=>fs.appendFileSync(path.join(dir,'native.log'),l));
 s.on('published',v=>publications.push({revision:v.revision,labels:v.nodes.map(n=>n.label)}));
 const first=until(s,'published'),exit=until(s,'exit',()=>true,20000);exit.catch(()=>{});
 try{
   s.start(file);const view=await first;assert.equal(view.success,true,JSON.stringify(failures));
   const fn=view.nodes.find(n=>n.label==='F');assert.ok(fn);const expanded=until(s,'published',v=>v.nodes.some(n=>n.label==='A'));s.receive({v:1,session:s.session,revision:s.revision,kind:'expand',node:fn.id});const withVariable=await expanded;
   const variable=withVariable.nodes.find(n=>n.label==='A');s.receive({v:1,session:s.session,revision:s.revision,kind:'navigate',node:variable.id});assert.equal(navigations[0].line,2);
   const changed=until(s,'published',v=>v.nodes.some(n=>n.label==='B'));source='// não salvo 🐈\nDefFuncaoxF[]yVazio\nDefVarInSd32xBy1\nFimFuncao';revision++;s.update(0);const renamed=await changed;
   assert.equal(renamed.nodes.find(n=>n.label==='B').id,variable.id);assert.equal(fs.readFileSync(module,'utf8'),'DefFuncaoxF[]yVazio\nFimFuncao');
   const code=await exit;assert.equal(code,0,JSON.stringify({failures,packets}));assert.deepEqual(failures,[]);assert.match(fs.readFileSync(path.join(dir,'trace.txt'),'utf8'),/VISUAL B/);
 }finally{s.dispose();fs.writeFileSync(path.join(dir,'protocol.json'),JSON.stringify({failures,packets,publications},null,2));}
});
