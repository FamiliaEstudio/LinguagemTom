'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JsonLines,GraphSession}=require('../../../tom-lang/companion/graph-session');
const {analyzeProject}=require('../../../tom-lang/core/project-analysis');
const {projectView,blocks}=require('../../../tom-lang/companion/graph-model');
test('graph transport handles fragmented UTF-8, limits and incomplete disconnect',()=>{
 const values=[],lines=new JsonLines(v=>values.push(v),128),data=Buffer.from(JSON.stringify({text:'á 🐈'})+'\n');for(const byte of data)lines.push(Buffer.from([byte]));lines.end();assert.deepEqual(values,[{text:'á 🐈'}]);
 assert.throws(()=>new JsonLines(()=>{},2).push(Buffer.from('123')),/capacidade/);const partial=new JsonLines(()=>{});partial.push(Buffer.from('{'));assert.throws(()=>partial.end(),/fragmentada/);
});
test('only acknowledged complete revisions become current, old acknowledgements are ignored',()=>{
 const s=new GraphSession({root:'.'});s.ready=true;s.child={stdin:{destroyed:false,writableLength:0,write(){}}};s.revision=2;let sent=[];s.on('sent',p=>sent.push(p));
 const view={nodes:[],edges:[],diagnostics:[],success:true,revision:2};s.publish(view);const transfer=s.pending.transfer;
 s.receive({v:1,session:s.session,revision:1,kind:'ack',transfer,index:-1});assert.equal(s.pending.index,-1);assert.equal(s.model,null);
 for(const index of [-1,0,1])s.receive({v:1,session:s.session,revision:2,kind:'ack',transfer,index});
 assert.equal(s.model,view);assert.equal(s.pending,null);assert.deepEqual(sent.map(p=>p.kind),['begin','block','commit']);clearTimeout(s.ackTimer);
});
test('projection starts at modules/functions, expands safely and chunks stay bounded',()=>{
 const model=analyzeProject({source:'DefFuncaoxF[]yVazio\nDefVarInSd32xAy1\nFimFuncao',file:'a.tom'});
 const collapsed=projectView(model);assert.equal(collapsed.nodes.length,2);
 const expanded=projectView(model,{expanded:[model.instructions[0].id]});assert.ok(expanded.nodes.length>collapsed.nodes.length);assert.ok(expanded.nodes.some(n=>n.label==='A'));
 assert.throws(()=>projectView(model,{expanded:[model.instructions[0].id],nodes:2}),/excede/);
 for(const b of blocks(expanded,1024))assert.ok(Buffer.byteLength(JSON.stringify(b))<=1024);
 const filtered=projectView(model,{expanded:[model.instructions[0].id],filter:4});assert.ok(filtered.nodes.some(n=>n.label==='A'));assert.ok(filtered.nodes.every(n=>[1,2,4].includes(n.category)));
});
test('a filter is a view action and needs no selected node',()=>{
 const s=new GraphSession({root:'.'});s.revision=2;s.model={revision:2,locations:{}};const calls=[];s.request=p=>calls.push(p);
 s.receive({v:1,session:s.session,revision:2,kind:'filter',index:4,node:0});
 s.receive({v:1,session:s.session,revision:1,kind:'filter',index:0,node:0});
 s.model={revision:1,locations:{}};s.receive({v:1,session:s.session,revision:2,kind:'filter',index:0,node:0});
 assert.deepEqual(calls,[{op:'filter',filter:4},{op:'filter',filter:0}]);
});
test('persistent worker command cache preserves source locations and invalidates changed types',()=>{
 const {ProjectAnalyzer}=require('../../../tom-lang/companion/project-worker'),worker=new ProjectAnalyzer();
 const input=source=>({entry:'a.tom',sources:{'a.tom':{source,revision:1}}});
 worker.analyze(input('DefVarInSd32xAy1'));worker.analyze(input('// movido\nDefVarInSd32xAy1'));
 assert.equal(worker.previous.symbols[0].location.line,2);assert.ok(worker.commandCache.size>0);
 worker.analyze(input('DefVarFl64xAy1.0'));assert.equal(worker.previous.symbols[0].type,'Fl64');assert.equal(worker.previous.symbols[0].location.line,1);
 worker.analyze(input('DefFuncaoxF[]yVazio\n'+Array.from({length:300},(_,i)=>`DefVarInSd32xV${i}y1`).join('\n')+'\nFimFuncao'));
 const fn=worker.previous.instructions[0].id;assert.throws(()=>worker.expand(fn),/excede/);assert.deepEqual(worker.expanded,[]);
 worker.filter=4;assert.equal(worker.expand(fn).nodes.filter(n=>n.category===4).length,300);
});
