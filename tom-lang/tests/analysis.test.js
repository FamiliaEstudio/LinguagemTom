'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compile,analyze}=require('../core/compiler');
test('analysis observes real declarations, parameters, calls and last-result producers',()=>{
  const source=`DefFuncaoxDobro[InSd32xValor]yInSd32
SomarxyInSd32x@Valory@Valor
Retornarx@ULTIMO
FimFuncao
DefVarInSd32xAy4
ChamarxDobro[@A]
DefVarInSd32xBy@ULTIMO
SetVarInSd32xBy8
DefVarInSd32xCy@ULTIMO`;
  const a=analyze(source,{file:'teste.tom'});assert.equal(a.success,true);
  assert.equal(a.symbols.find(s=>s.name==='Valor').kind,'parameter');
  assert.equal(a.symbols.find(s=>s.name==='Valor').owner,'Dobro');
  assert.equal(a.calls[0].target,'teste.tom:1');
  assert.equal(a.lastResults.find(r=>r.location.line===3).producer,'teste.tom:2');
  assert.equal(a.lastResults.find(r=>r.location.line===7).producer,'teste.tom:6');
  assert.equal(a.lastResults.find(r=>r.location.line===9).producer,'teste.tom:8');
  assert.ok(a.references.some(r=>r.name==='B'&&r.write));
  assert.doesNotThrow(()=>JSON.stringify(a));
  assert.deepEqual(compile(source),compile(source));
});
test('analysis invalidates ULTIMO at joins and preserves the compiler diagnostic',()=>{
  const source='SexVerdadeiro\nSomarxyInSd32x1y2\nFimSe\nDefVarInSd32xAy@ULTIMO';
  const a=analyze(source,{file:'case.tom'}),c=compile(source,{file:'case.tom'});
  assert.deepEqual(a.diagnostics,c.diagnostics);assert.equal(a.lastResults.at(-1).resolved,false);
});
test('analysis handles incomplete source without inventing semantic resolution',()=>{
  const a=analyze("DefFuncaoxF[]yVazio\nDefStkFB32CxTxtyl'á 🐈'\nChamarxAusente[\n");
  assert.equal(a.success,false);assert.equal(a.instructions[1].owner,'F');
  assert.equal(a.instructions[1].end.column,"DefStkFB32CxTxtyl'á 🐈'".length+1);
  assert.equal(a.instructions[2].recognized,false);
  assert.equal(a.symbols.find(s=>s.name==='Txt').type,'FB32C');
});
test('literal contents never create calls or references and module positions survive',()=>{
  const source="Importar[l'./f.tom']\nGerarTxtxl'ChamarxF[] @ULTIMO // literal'\nChamarxF[]";
  const a=analyze(source,{file:'main.tom',modules:{'f.tom':"DefFuncaoxF[]yVazio\nGerarTxtxl'ok'\nFimFuncao"}});
  assert.equal(a.success,true);assert.equal(a.calls.length,1);assert.equal(a.calls[0].target,'f.tom:1');assert.equal(a.lastResults.length,0);
});
test('analyzing cannot alter normal LLVM output',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../exemplos/calculadora.tom'),'utf8');
  const before=compile(source);const a=analyze(source);assert.equal(a.success,true);
  assert.deepEqual(compile(source),before);assert.equal(a.instructions.filter(n=>n.kind==='function').length,9);
  assert.ok(a.lastResults.length>150);assert.ok(a.instructions.some(n=>n.opens&&n.kind==='endIf'));
});
