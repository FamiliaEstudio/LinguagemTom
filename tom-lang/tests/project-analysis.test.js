'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeProject,compile}=require('../core/compiler');
const analyze=(source,previous)=>analyzeProject({file:'a.tom',source},{previous});
test('incomplete commands preserve independent declarations and never compile',()=>{
  const source="DefVarInSd32xAy1\nChamarxF[\nDefVarInSd32xBy2\nSomarxyInSd32x@Ay@B";
  const a=analyze(source);assert.equal(a.success,false);assert.deepEqual(a.symbols.map(s=>s.name),['A','B']);assert.equal(a.references.filter(r=>r.resolved).length,2);assert.equal(compile(source).success,false);
  for(let i=0;i<=source.length;i++)assert.doesNotThrow(()=>JSON.stringify(analyze(source.slice(0,i))));
});
test('line insertions, safe renames and deletion reconcile identities',()=>{
  const a=analyze('DefFuncaoxF[]yVazio\nDefVarInSd32xAy1\nFimFuncao');
  const b=analyze('// comentário 🐈\n\nDefFuncaoxF[]yVazio\nDefVarInSd32xBy1\nFimFuncao',a);
  assert.equal(a.symbols[0].id,b.symbols[0].id);assert.equal(a.instructions[0].id,b.instructions[0].id);
  assert.equal(analyze('DefFuncaoxF[]yVazio\nFimFuncao',b).symbols.length,0);
});
test('UTF-16 ranges identify names and quoted arguments including Unicode',()=>{
  const source="  DefStkFB64CxTextoyl'🐈 ação'\nCopiarTxt[@Texto,l'á 🐈 @ULTIMO']";
  const a=analyze(source),n=a.instructions[1],range=n.ranges.arguments[1];
  assert.equal(source.slice(range.start.offset,range.end.offset),"l'á 🐈 @ULTIMO'");assert.equal(a.lastResults.length,0);
  const s=a.symbols[0];assert.equal(source.slice(s.range.start.offset,s.range.end.offset),'Texto');
  assert.ok(a.edges.some(e=>e.kind==='writes'&&e.to===s.id));assert.ok(!a.edges.some(e=>e.kind==='reads'&&e.from===n.id&&e.to===s.id));
});
test('ULTIMO has separate producers and is invalidated by joins',()=>{
  const a=analyze('SomarxyInSd32x1y2\nDefVarInSd32xAy@ULTIMO\nSexVerdadeiro\nSomarxyInSd32x3y4\nFimSe\nDefVarInSd32xBy@ULTIMO');
  assert.equal(a.lastResults[0].producer,a.instructions[0].id);assert.equal(a.lastResults[1].resolved,false);
  assert.equal(a.nodes.filter(n=>n.kind==='result').length,2);
});
test('borrow permission alone is not a proven mutation; transitive calls derive effects',()=>{
  const source="DefFuncaoxVer[RefFB64CxTexto]yVazio\nGerarTxtxTexto\nFimFuncao\nDefFuncaoxMudar[RefFB64CxTexto]yVazio\nCopiarTxt[@Texto,l'ok']\nFimFuncao\nDefStkFB64CxEntrada yl''".replace('Entrada y','Entraday')+"\nChamarxVer[@Entrada]\nChamarxMudar[@Entrada]";
  const a=analyze(source);assert.deepEqual(a.diagnostics,[]);const calls=a.instructions.filter(n=>n.kind==='call');
  assert.ok(!a.edges.some(e=>e.kind==='writes'&&e.from===calls[0].id));assert.ok(a.edges.some(e=>e.kind==='writes'&&e.from===calls[1].id));
});
test('project imports prefer supplied revisions, deduplicate and enforce budgets',()=>{
  const input={entry:'main.tom',sources:{'main.tom':{source:"Importar[l'./f.tom']\nChamarxF[]",revision:3},'f.tom':{source:'DefFuncaoxF[]yVazio\nFimFuncao',revision:9}}};
  const a=analyzeProject(input);assert.equal(a.success,true);assert.equal(a.files.find(f=>f.file==='f.tom').revision,9);assert.ok(a.edges.some(e=>e.kind==='imports'));
  const limited=analyzeProject(input,{limits:{files:1}});assert.equal(limited.complete,false);assert.equal(limited.nodes.length,0);assert.ok(limited.diagnostics.some(d=>d.code==='E_PROJECT_LIMIT'));
});
test('uncertain block headers cannot leak declarations or ULTIMO into the enclosing scope',()=>{
 const a=analyze('Sex\nDefVarInSd32xInternay1\nFimSe\nSomarxyInSd32x@Internay2\nDefVarInSd32xFinaly3');
 assert.ok(a.symbols.some(s=>s.name==='Interna'));assert.ok(a.symbols.some(s=>s.name==='Final'));assert.ok(a.references.some(r=>r.name==='Interna'&&!r.resolved));
 const b=analyze('DefVarInSd32xAy1\nDefVarInSd32xAy2\nSomarxyInSd32x@Ay3');assert.ok(b.references.some(r=>r.name==='A'&&!r.resolved));
});
test('independent record types and regions survive a broken type',()=>{
 const a=analyze('DefRegistroxRuim\nPropRegistro<Ausente>xvalor\nFimDef\nDefRegistroxBom\nPropInSd32xvalor\nFimDef\nDefVarRegistro<Bom>xByPadrao\nSetVarInSd32xB.valory1');
 assert.equal(a.success,false);assert.ok(a.references.some(r=>r.name==='B.valor'&&r.write&&r.resolved));
});
test('one thousand revisions have bounded snapshots and preserve repeated instructions',()=>{
 let previous=analyze('DefFuncaoxF[]yVazio\nGerarTxtxl\'a\'\nGerarTxtxl\'a\'\nFimFuncao');const ids=previous.instructions.map(n=>n.id);
 for(let i=0;i<1000;i++){previous=analyze('// '+i+'\nDefFuncaoxF[]yVazio\nGerarTxtxl\'a\'\nGerarTxtxl\'a\'\nFimFuncao',previous);assert.deepEqual(previous.instructions.map(n=>n.id),ids);assert.ok(JSON.stringify(previous).length<16000);}
});
test('editor edit intervals disambiguate deletion among repeated instructions',()=>{
 const line="GerarTxtxl'a'",source=line+'\n'+line;
 const previous=analyzeProject({entry:'a.tom',sources:{'a.tom':{source,revision:1}}});
 const current=analyzeProject({entry:'a.tom',sources:{'a.tom':{source:line,revision:2}},edits:[{file:'a.tom',fromRevision:1,toRevision:2,changes:[{rangeOffset:0,rangeLength:line.length+1,text:''}]}]},{previous});
 assert.equal(current.instructions[0].id,previous.instructions[1].id);
});
test('parameter ranges disambiguate a name that prefixes another parameter',()=>{
 const source='DefFuncaoxF[InSd32xValorExtra,InSd32xValor]yInSd32\nRetornarx@Valor\nFimFuncao';
 const a=analyze(source);assert.deepEqual(a.diagnostics,[]);
 for(const s of a.symbols)assert.equal(source.slice(s.range.start.offset,s.range.end.offset),s.name);
 assert.ok(a.symbols[1].range.start.offset>a.symbols[0].range.end.offset);
});
