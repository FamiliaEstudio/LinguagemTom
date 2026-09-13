'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {options,stats,expectedChecksum}=require('./run');
const {headlessSource}=require('./build');
const {parse}=require('../../tom-lang/core/parser');

test('benchmark rejects invalid sample counts, modes and optimization flags',()=>{
  for(const args of [['--samples','0'],['--cycles','1.5'],['--warmup','-1'],['--mode','typo'],['--opt','O3'],['--unknown']]) assert.throws(()=>options(args));
  assert.equal(options(['--quick','--samples','5']).samples,5);
});
test('statistics report median and nearest-rank p95, including an even sample count',()=>{
  const s=stats([40,1,3,2]);assert.equal(s.median,2.5);assert.equal(s.p95,40);assert.equal(s.mean,11.5);
  assert.throws(()=>stats([]));assert.throws(()=>stats([NaN]));
});
test('output checksum includes message, event order and repeat count',()=>{
  const a=[{display:'0',message:''},{display:'1',message:'a'},{display:'2',message:''}];
  const b=[a[0],a[2],a[1]];
  assert.notEqual(expectedChecksum(a,1),expectedChecksum(b,1));
  assert.notEqual(expectedChecksum(a,1),expectedChecksum(a,2));
  assert.notEqual(expectedChecksum(a,1),expectedChecksum([a[0],{display:'1',message:'b'},a[2]],1));
});
test('headless adapter preserves every AST node outside Desenhar',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../tom-lang/exemplos/calculadora.tom'),'utf8');
  const strip=ast=>JSON.parse(JSON.stringify(ast, (key,value)=>key==='location'?undefined:typeof value==='bigint'?value.toString():value));
  const original=strip(parse(source,'original.tom')),adapted=strip(parse(headlessSource(source),'headless.tom'));
  const withoutDraw=ast=>ast.body.filter(n=>n.kind!=='function'||n.name!=='Desenhar');
  assert.deepEqual(withoutDraw(original),withoutDraw(adapted));
  assert.notDeepEqual(original,adapted);
  assert.throws(()=>headlessSource(source.replace('FontexGrande,FontexPequena','FontexMaior,FontexPequena')));
});
