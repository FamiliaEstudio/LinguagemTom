'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),course=require('../courses/calculadora/roteiro.json');
const {steps,reference}=require('../scripts/course');
const {compile,analyze}=require('../../../tom-lang/core/compiler');
const {verify}=require('../../../tom-lang/companion/verify');
test('course pins the real calculator and explains every instruction, including closers',()=>{
  assert.equal(reference,fs.readFileSync(path.join(root,'tom-lang/exemplos/calculadora.tom'),'utf8'));
  assert.equal(course.reference.sha256,createHash('sha256').update(reference).digest('hex'));
  assert.equal(steps.length,22);
  const a=analyze(reference);assert.equal(a.success,true);
  for(const n of a.instructions)assert.ok(course.explanations.kinds[n.kind],n.kind+': '+n.text);
  for(const n of a.instructions.filter(n=>['builtin','resource'].includes(n.kind)))assert.ok(course.explanations.builtins[n.builtin||n.name],n.text);
  for(const [i,s] of steps.entries()){
    assert.ok(s.checks.length,s.id);assert.equal(s.hints.length,3);
    for(const field of ['goal','why','write','check','next','solution'])assert.ok(s[field],s.id+': '+field);
    assert.equal(fs.readFileSync(path.join(__dirname,'../courses/calculadora/steps',String(i).padStart(2,'0')+'.tom'),'utf8'),s.snapshot);
    const c=compile(s.snapshot);assert.equal(c.success,true,JSON.stringify(c.diagnostics));
  }
});
for(const optimize of ['-O0','-O2'])for(const [index,step] of steps.entries())test(`calculator course ${index+1}: ${step.id} ${optimize}`,{timeout:120000},()=>{
  const r=verify(root,step.snapshot,index,{optimize});assert.equal(r.passed,true,JSON.stringify(r));
  if(index===21)assert.ok(r.count>=38);
});
test('equivalent implementation, renamed locals and comments are accepted',()=>{
  const source=steps[1].snapshot.replace(/Dc34xA/g,'Dc34xEsquerdo').replace(/Dc34xB/g,'Dc34xDireito').replace(/@A/g,'@Esquerdo').replace(/@B/g,'@Direito').replace('x@Esquerdoy@Direito','x@Direitoy@Esquerdo');
  const r=verify(root,'// Minha implementação\n'+source.split('\n').map(l=>'  '+l).join('\n'),1);assert.equal(r.passed,true,JSON.stringify(r));
});
test('function harness preserves named constants and helper declarations without running learner initialization',()=>{
  const source='DefConstInSd32xSOMAy11\n'+steps[1].snapshot.replace('Operadory11','Operadory@SOMA')+"\nGerarTxtxl'Inicialização do programa do aluno'";
  const r=verify(root,source,1);assert.equal(r.passed,true,JSON.stringify(r));
});
test('valid wrong code reports measured expected/observed; invalid code keeps compiler diagnostics',()=>{
  const wrong=verify(root,steps[1].snapshot.replace('Somarxy','Subtrxy'),1);assert.equal(wrong.status,'different');assert.equal(wrong.expected,'0.3');assert.equal(wrong.observed,'-0.1');
  const invalid=verify(root,'DefVarDc34xRy@ULTIMO',0);assert.equal(invalid.status,'invalid');assert.ok(invalid.diagnostics.length);
});
