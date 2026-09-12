'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, rejection } = require('./helpers');

for (const optimize of ['-O0', '-O2']) {
  test(`loop break/continue clean each iteration (${optimize})`, () => {
    const r = execute("DefVarBlxRuny1\nDefVarInSd32xIy0\nEnquantox@Run\nDeferGerarTxtxl'D'\nSomarxyInSd32x@Iy1\nSetVarInSd32xIy@ULTIMO\nCompararIgualxyInSd32x@Iy3\nSex@ULTIMO\nInterromper\nFimSe\nContinuar\nFimEnquanto\nGerarTxtxl'F'", { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'DDDF');
  });
  test(`exceptions cross functions and preserve the first cleanup failure (${optimize})`, () => {
    const r = execute("DefFuncaoxFalhar[InSd32xZ]yVazio\nDeferGerarTxtxl'F'\nDividxyInSd32x1y@Z\nFimFuncao\nTentar\nDeferGerarTxtxl'A'\nDeferChamarxFalhar[0]\nDeferGerarTxtxl'B'\nChamarxFalhar[0]\nCapturarxErro\nErroCodigoxErro\nDefVarInSd32xCy@ULTIMO\nCompararIgualxyInSd32x@Cy2\nSex@ULTIMO\nGerarTxtxl'C'\nFimSe\nFimTentar\nGerarTxtxl'K'", { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'FBFACK');
  });
  test(`function returns retain their value across defers (${optimize})`, () => {
    const r = execute("DefFuncaoxValor[InSd32xA]yInSd32\nDeferSetVarInSd32xAy99\nRetornarx@A\nFimFuncao\nChamarxValor[7]\nDefVarInSd32xRy@ULTIMO\nCompararIgualxyInSd32x@Ry7\nSex@ULTIMO\nGerarTxtxl'OK'\nFimSe", { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'OK');
  });
  test(`buffers mutate at runtime and retain bytes on failure (${optimize})`, () => {
    const r = execute("DefStkFB10CxByl'á'\nTentar\nAnexarTxt[@B,l'🐈']\nAnexarTxt[@B,l'12345']\nCapturarxErro\nGerarTxtxB\nApagarTxt[@B]\nGerarTxtxB\nFimTentar", { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'á🐈á');
  });
}
test('functions enforce signatures, borrowing, returns and non-recursion', () => {
  rejection('DefFuncaoxA[]yVazio\nChamarxA[]\nFimFuncao', 'E_RECURSION');
  rejection('DefFuncaoxA[FB8CxB]yVazio\nLimparTxt[@B]\nFimFuncao', 'E_BORROW');
  rejection('DefFuncaoxA[]yInSd32\nFimFuncao', 'E_RETURN');
  rejection('DefFuncaoxA[]yVazio\nFimFuncao\nChamarxA[1]', 'E_ARGUMENT');
  rejection('Interromper', 'E_LOOP');
  rejection('Relancar', 'E_CATCH');
});
for (const optimize of ['-O0', '-O2']) {
  test(`typed branch returns, nested rethrow and uncaught cleanup (${optimize})`, () => {
    const r = execute("DefFuncaoxEscolher[BlxB]yInSd32\nSex@B\nRetornarx7\nSenao\nRetornarx8\nFimSe\nFimFuncao\nChamarxEscolher[0]\nCompararIgualxyInSd32x@ULTIMOy8\nSex@ULTIMO\nGerarTxtxl'R'\nFimSe\nEscopoInixExterno\nDeferGerarTxtxl'Z'\nTentar\nDeferGerarTxtxl'A'\nTentar\nDeferGerarTxtxl'B'\nDefVarInSd32xZy0\nDividxyInSd32x1y@Z\nCapturarxInterno\nErroLinhaxInterno\nDefVarInSd32xLinhay@ULTIMO\nCompararIgualxyInSd32x@Linhay20\nSex@ULTIMO\nGerarTxtxl'L'\nFimSe\nRelancar\nFimTentar\nCapturarxExterno\nDeferGerarTxtxl'C'\nErroArquivoxExterno\nGerarTxtUltimo\nRelancar\nFimTentar\nEscopoFimxExterno", { optimize, file: 'location.tom' });
    assert.equal(r.status, 1); assert.match(r.stdout, /^RBLAlocation.tomCZlocation.tom:20:1: erro: /);
  });
  test(`declarations and SOA reinitialize without accumulating resources (${optimize})`, () => {
    const r = execute("DefVarInSd32xIy0\nDefVarBlxRuny1\nEnquantox@Run\nDefStructSOAxP\nPropIn32xN\nFimDef\nDefArraySoAxAxPx1\nCompararIgualxyInSd32xA@0.Ny0\nSex@ULTIMO\nSenao\nGerarTxtxl'BAD'\nFimSe\nSetVarInSd32xA@0.Ny99\nDefStkFB32CxByl'á🐈%'\nDefVarDc34xDy0.1\nDc34ParaTexto[@D,@B]\nSomarxyInSd32x@Iy1\nSetVarInSd32xIy@ULTIMO\nCompararMenorxyInSd32x@Iy10000\nSetVarBlxRuny@ULTIMO\nFimEnquanto\nGerarTxtxl'OK'", { optimize, maximumLiveObjects: 4 });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'OK');
  });
  test(`text slices are Unicode aware and atomic, including aliases (${optimize})`, () => {
    const r = execute("DefStkFB16CxByl'á🐈%z'\nRecortarTxt[@B,@B,1,2]\nGerarTxtxB\nTentar\nRecortarTxt[@B,l'xx',1,9]\nCapturarxE\nGerarTxtxB\nFimTentar\nQuantidadeCaracteresTxt[@B]\nCompararIgualxyInUd64x@ULTIMOy2\nSex@ULTIMO\nGerarTxtxl'OK'\nFimSe", { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, '🐈%🐈%OK');
  });
}
test('references and ULTIMO cannot escape their lexical block', () => {
  rejection("Sex1\nDefStkFB8CxByl'x'\nFimSe\nGerarTxtxB", 'E_UNDEFINED');
  rejection('Sex1\nSomarxyInSd32x1y2\nSenao\nSomarxyInSd32x2y3\nFimSe\nDefVarInSd32xAy@ULTIMO', 'E_ULTIMO');
  rejection('DefFuncaoxA[]yInSd32\nSeMaiorxyInSd32x1y2\nRetornarx1\nFimFuncao', 'E_SCOPE');
});
