'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../core/compiler');
const { execute, rejection } = require('./helpers');

test('pure modules deduplicate dependencies and retain imported diagnostics', () => {
  const source = "Importar[l'./a.tom']\nImportar[l'./b.tom']\nChamarxF[]";
  const modules = { 'a.tom': "Importar[l'./shared.tom']", 'b.tom': "Importar[l'./shared.tom']", 'shared.tom': 'DefConstInSd32xCy7\nDefFuncaoxF[]yInSd32\nRetornarx@C\nFimFuncao' };
  assert.equal(compile(source, { file: 'main.tom', modules }).success, true);
  modules['shared.tom'] = '\nDefConstInSd32xCywrong';
  const d = compile(source, { file: 'main.tom', modules }).diagnostics[0];
  assert.equal(d.file, 'shared.tom'); assert.equal(d.line, 2); assert.equal(d.code, 'E_LITERAL');
  assert.equal(compile("Importar[l'./main.tom']", { file: 'main.tom' }).diagnostics[0].code, 'E_IMPORT_CYCLE');
  assert.equal(compile("Importar[l'./x.tom']", { modules: { 'x.tom': "GerarTxtxl'forbidden'" } }).diagnostics[0].code, 'E_MODULE_INIT');
  assert.equal(compile("Importar[l'./missing.tom']").diagnostics[0].code, 'E_IMPORT_MISSING');
});

test('constant writes, duplicate modules and read-only collection mutation are rejected', () => {
  rejection('DefConstInSd32xAy2\nSetVarInSd32xAy3', 'E_CONSTANT');
  rejection('DefConstInSd32xAy2\nLerEntradaInSd32xA', 'E_CONSTANT');
  rejection('DefConstInSd32xAy2\nDefConstInSd32xAy3', 'E_DUPLICATE');
  const structure = 'DefStructSOAxS\nPropIn32xvalor\nFimDef\n';
  rejection(structure + 'DefFuncaoxF[SOA<S>xDados]yVazio\nSetVarInSd32xDados@0.valory1\nFimFuncao', 'E_BORROW');
  rejection(structure + 'DefFuncaoxF[SOA<S>xDados]yVazio\nParaCadaSOAxDadosxSomarvalor1\nFimFuncao', 'E_BORROW');
  rejection(structure + 'DefFuncaoxF[RefSOA<S>xDados]yVazio\nFimFuncao\nDefFuncaoxG[SOA<S>xDados]yVazio\nChamarxF[@Dados]\nFimFuncao', 'E_BORROW');
  rejection('DefVarInSd32xAy1\nDefConstInSd32xBy@A', 'E_UNDEFINED');
});

for (const optimize of ['-O0', '-O2']) {
  test(`SOA borrowing preserves length, booleans, mutation, bounds and reinitialization (${optimize})`, () => {
    const source = `DefConstInSd32xIncrementoy3
DefStructSOAxS
PropIn32xvalor
PropBlxativo
FimDef
DefFuncaoxF[RefSOA<S>xDados]yInSd64
SetVarInSd32xDados@1.valory@Incremento
SetVarBlxDados@1.ativoyVerdadeiro
ComprimentoSOA[@Dados]
Retornarx@ULTIMO
FimFuncao
DefFuncaoxFora[SOA<S>xDados]yVazio
GetVarxDadosxIndex2xvalor
FimFuncao
DefVarInSd32xIy0
DefVarBlxContinuaryVerdadeiro
Enquanto x@Continuar
DefArraySoAxItensxSx2
CompararIgualxyBlxItens@1.ativoyFalso
Se x@ULTIMO
GerarTxtxl'zero;'
FimSe
ChamarxF[@Itens]
CompararIgualxyInSd64x@ULTIMOy2
Se x@ULTIMO
GerarTxtxl'len;'
FimSe
CompararIgualxyInSd32xItens@1.valory3
Se x@ULTIMO
GerarTxtxl'value;'
FimSe
Tentar
ChamarxFora[@Itens]
CapturarxErro
GerarTxtxl'bounds;'
FimTentar
SomarxyInSd32x@Iy1
SetVarInSd32xIy@ULTIMO
CompararMenorxyInSd32x@Iy2
SetVarBlxContinuary@ULTIMO
FimEnquanto`.replace(/(Enquanto|Se) x/g, '$1x');
    const r = execute(source, { optimize }); assert.equal(r.status, 0);
    assert.equal(r.stdout, 'zero;len;value;bounds;'.repeat(2));
  });
  test(`numeric conversions, finite power and reproducible PCG vector (${optimize})`, () => {
    const source = `Fl64ParaInSd32[-2.9]
CompararIgualxyInSd32x@ULTIMOy-2
Sex@ULTIMO
GerarTxtxl'trunc;'
FimSe
PotenciaFl64[2.0,3.0]
CompararIgualxyFl64x@ULTIMOy8.0
Sex@ULTIMO
GerarTxtxl'power;'
FimSe
DefRecursoxRySorteadorCriar[42,54]
SortearInteiro[@R,4294967295]
CompararIgualxyInUd32x@ULTIMOy2707161783
Sex@ULTIMO
GerarTxtxl'pcg;'
FimSe
Tentar
Fl64ParaInSd64[9223372036854775808.0]
CapturarxErro
GerarTxtxl'overflow;'
FimTentar
Tentar
PotenciaFl64[-1.0,0.5]
CapturarxErro
GerarTxtxl'invalid;'
FimTentar`;
    const r = execute(source, { optimize }); assert.equal(r.status, 0); assert.equal(r.stdout, 'trunc;power;pcg;overflow;invalid;');
  });
}
