'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Session,Lines,defaults,validateProgress,atomicProgress,selectionContext}=require('../../../tom-lang/companion/session');
const {analyze,compile}=require('../../../tom-lang/core/compiler');
const root=path.resolve(__dirname,'../../..'),course=require('../courses/calculadora/roteiro.json');
test('framing preserves fragmented Unicode and rejects oversized/truncated messages',()=>{
  const received=[],lines=new Lines(m=>received.push(m));const bytes=Buffer.from('{"nome":"á🐈%"}\n{"valor":"9007199254740993"}\n');
  for(const byte of bytes)lines.push(Buffer.from([byte]));lines.end();assert.deepEqual(received,[{nome:'á🐈%'},{valor:'9007199254740993'}]);
  const broken=new Lines(()=>{});broken.push(Buffer.from('{'));assert.throws(()=>broken.end(),/incompleta/);
  assert.throws(()=>new Lines(()=>{}).push(Buffer.alloc(1048577,32)),/1 MiB/);
  assert.throws(()=>new Lines(()=>{}).push(Buffer.from([0xff,10])));
});
test('progress validation preserves current state and requires the matching reference',()=>{
  const p=defaults(course);assert.equal(validateProgress(p,course),p);
  for(const change of [{version:9},{step:-1},{font:3},{hints:[]},{verified:{0:'bad'}},{referenceHash:'other'}])assert.throws(()=>validateProgress({...p,...change},course));
  assert.deepEqual(p,defaults(course));
});
test('atomic progress persistence can reopen; failure never truncates its destination',async()=>{
  const dir=path.join(root,'aplicativos/tom-companion/build/storage-test');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'progress.json'),p=defaults(course);await atomicProgress(file,p);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),p);
  const original=fs.readFileSync(file);assert.throws(()=>JSON.stringify({self:BigInt(1)}));
  await assert.rejects(atomicProgress(file,{self:BigInt(1)}));assert.deepEqual(fs.readFileSync(file),original);
});
test('selection links refer to real producer, declaration and call locations',()=>{
  const source='DefFuncaoxF[InSd32xA]yInSd32\nSomarxyInSd32x@Ay1\nRetornarx@ULTIMO\nFimFuncao\nChamarxF[4]';
  const a=analyze(source,{file:'a.tom'}),s=selectionContext(a,3);
  assert.equal(s.last[0].producerLine,2);assert.ok(s.relations.some(r=>r.line===2));assert.ok(s.relations.some(r=>r.line===5));
});
test('session discards a verification result from an earlier source revision',async()=>{
  const s=new Session({root,file:'/tmp/calculadora.tom',executable:'unused'});s.ready=true;s.child={stdin:{destroyed:false,writableLength:0,write(){}}};
  let resolve;const pending=new Promise(r=>{resolve=r;});s.job=()=>pending;s.cancel=()=>{};
  const sent=[];s.on('sent',p=>sent.push(p));const old=s.revision;
  const work=s.handle({kind:'verify',revision:old,step:0,request:1});s.update('novo');clearTimeout(s.debounce);
  resolve({revision:old,result:{passed:true}});await work;assert.equal(sent.filter(p=>p.kind==='verification').length,0);
  s.child=null;s.disposed=true;
});
test('save failure reports recovery, a retry succeeds, and old statuses cannot overwrite a new revision',async()=>{
  const fs=require('node:fs'),dir=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'companion-save-'));
  let failed=true;const s=new Session({root,file:path.join(dir,'calculadora.tom'),executable:'unused',persist:async(...args)=>{if(failed)throw Error('Disk unavailable');return atomicProgress(...args);}});
  s.ready=true;s.child={stdin:{destroyed:false,writableLength:0,write(){}}};const sent=[];s.on('sent',p=>sent.push(p));
  const progress=defaults(course);progress.step=3;
  await s.handle({kind:'save',request:1,progress});assert.equal(sent.at(-1).success,false);assert.equal(progress.step,3);
  failed=false;await s.handle({kind:'save',request:2,progress});assert.equal(sent.at(-1).success,true);assert.equal(JSON.parse(fs.readFileSync(s.progressFile)).step,3);
  const before=sent.length;s.status({revision:s.revision-1},'stale');assert.equal(sent.length,before);s.child=null;s.disposed=true;fs.rmSync(dir,{recursive:true,force:true});
});
test('worker cancellation terminates the process and resolves without a stale result',async()=>{
  const s=new Session({root,file:path.join(root,'calculadora.tom'),executable:'unused'});
  s.source="DefVarDc34xAy0.1\nSomarxyDc34x@Ay0.2\nDefVarDc34xBy@ULTIMO\nEnquantoxVerdadeiro\nFimEnquanto";
  const job=s.job('verify',{step:0});const child=s.jobs.get('verify').child;s.cancel('verify');assert.equal(await job,null);assert.equal(s.jobs.size,0);
  await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve));s.dispose();
});
test('oversized document invalidates previous approval before refusing to run tools',async()=>{
  const s=new Session({root,file:'/tmp/calculadora.tom',executable:'unused'});s.ready=true;s.child={stdin:{destroyed:false,writableLength:0,write(){}}};
  const packets=[];s.on('sent',p=>packets.push(p));const revision=s.revision;
  assert.throws(()=>s.update('x'.repeat(131073)),/128 KiB/);assert.ok(s.revision>revision);assert.equal(packets.at(-1).compileSuccess,false);assert.equal(packets.at(-1).diagnostic.code,'E_COMPANION_LIMIT');
  await assert.rejects(s.job('verify',{step:0}),/128 KiB/);assert.equal(s.jobs.size,0);s.child=null;s.disposed=true;
});
test('long Unicode instructions are abbreviated only for the native card, preserving analysis and locations',()=>{
  const source="DefStkFB32768CxTextoyl'"+'🐈'.repeat(5000)+"'",a=analyze(source,{file:'grande.tom'}),view=selectionContext(a,1);
  assert.equal(a.success,true);assert.equal(a.instructions[0].text,source);assert.ok(Buffer.byteLength(view.instruction.text)<=8192);assert.match(view.instruction.notice,/abreviada/);
  assert.equal(view.instruction.end.column,source.length+1);assert.equal(view.instruction.text.includes('\ufffd'),false);
});
test('copy sends the original solution with literal characters, rejects stale requests and reports clipboard failure',async()=>{
  const copied=[],packets=[];const s=new Session({root,file:'/tmp/calculadora.tom',executable:'unused',onCopy:async text=>copied.push(text)});
  s.ready=true;s.child={stdin:{destroyed:false,writableLength:0,write(){}}};s.on('sent',p=>packets.push(p));s.analyze=async()=>{};
  try{
    const request={kind:'copyCode',revision:s.revision,step:0,request:1};await s.handle(request);
    assert.deepEqual(copied,[course.steps[0].solution]);assert.match(copied[0],/Saidayl''/);assert.equal(compile(copied[0]).success,true);assert.match(packets.at(-1).message,/copiado/);
    await s.handle({...request,revision:s.revision-1});assert.equal(copied.length,1);
    s.onCopy=async()=>{throw Error('Clipboard unavailable');};const count=packets.length;
    await assert.rejects(s.handle(request),/Clipboard unavailable/);assert.equal(packets.length,count);
  }finally{s.child=null;s.disposed=true;}
});
