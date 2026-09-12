'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, rejection } = require('./helpers');
const { parseDecimal, calculate, canonical } = require('../core/decimal');
const location = { file: 'decimal.tom', line: 1, column: 1 };

test('Dc34 literals retain every digit and reject precision loss', () => {
  assert.equal(canonical(parseDecimal('9007199254740993.1', location)), '90071992547409931E-1');
  assert.equal(canonical(parseDecimal('0.10000000000000000000000000000000000', location)), '1E-1');
  rejection('DefVarDc34xAy12345678901234567890123456789012345', 'E_PRECISION');
  rejection('DefVarDc34xAy1e6145', 'E_OVERFLOW');
  rejection('DefVarDc34xAy1e-6177', 'E_UNDERFLOW');
  rejection('SomarxyDc34x9e6144y9e6144', 'E_OVERFLOW');
  rejection('DividxyDc34x1y0', 'E_DIVISION');
});
for (const optimize of ['-O0', '-O2']) {
  test(`decimal native operations agree with BigInt rounding (${optimize})`, () => {
    const cases = [
      ['Somar', '0.1', '0.2'], ['Subtr', '9007199254740993.1', '0.1'],
      ['Multi', '-0.2', '0.3'], ['Divid', '1', '3'], ['Divid', '-2', '7'],
      ['Somar', '1234567890123456789012345678901234', '0.5'],
      ['Somar', '1234567890123456789012345678901235', '0.5'],
      ['Multi', '1e-6176', '1'], ['Divid', '1e6144', '2'], ['Subtr', '1e300', '1e300'],
    ];
    const lines = ['DefVarDc34xAy0', 'DefVarDc34xBy0', 'DefVarDc34xRy0'];
    for (const [op, a, b] of cases) {
      const expected = canonical(calculate(op, parseDecimal(a, location), parseDecimal(b, location), location));
      lines.push(`SetVarDc34xAy${a}`, `SetVarDc34xBy${b}`, `${op}xyDc34x@Ay@B`, 'SetVarDc34xRy@ULTIMO', `CompararIgualxyDc34x@Ry${expected}`, 'Sex@ULTIMO', "GerarTxtxl'OK'", 'Senao', "GerarTxtxl'BAD'", 'FimSe');
    }
    const r = execute(lines.join('\n'), { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, 'OK'.repeat(cases.length));
  });
  test(`decimal formatting, copying and recoverable errors (${optimize})`, () => {
    const r = execute("DefStkFB128CxVisoryl''\nDefFuncaoxDividir[Dc34xA,Dc34xB]yDc34\nDividxyDc34x@Ay@B\nRetornarx@ULTIMO\nFimFuncao\nChamarxDividir[1,3]\nDefVarDc34xRy@ULTIMO\nDc34ParaTexto[@R,@Visor]\nGerarTxtxVisor\nTentar\nChamarxDividir[1,0]\nCapturarxErro\nGerarTxtxl'|erro|'\nFimTentar\nTextoParaDc34[l'0.3']\nSetVarDc34xRy@ULTIMO\nDc34ParaTexto[@R,@Visor]\nGerarTxtxVisor", { optimize });
    assert.equal(r.status, 0); assert.equal(r.stdout, '0.' + '3'.repeat(34) + '|erro|0.3');
  });
  test(`decimal failures do not escape catches or leak resources (${optimize})`, () => {
    for (const [a, b, op] of [['9e6144', '10', 'Multi'], ['1e-6176', '10', 'Divid']]) {
      const r = execute(`DefVarDc34xAy${a}\nDefVarDc34xBy${b}\nTentar\n${op}xyDc34x@Ay@B\nCapturarxErro\nGerarTxtxl'caught'\nFimTentar`, { optimize });
      assert.equal(r.status, 0); assert.equal(r.stdout, 'caught');
    }
  });
}
const official = require('./fixtures/decimal128.json');
const errorNames = { 1: 'E_OVERFLOW', 2: 'E_DIVISION', 3: 'E_UNDERFLOW' };
test('BigInt compiler agrees with published decimal128 arithmetic vectors', () => {
  for (const c of official) {
    const operation = () => calculate(c.op, parseDecimal(c.a, location), parseDecimal(c.b, location), location);
    if (c.error) assert.throws(operation, error => error.diagnostic.code === errorNames[c.error], c.id);
    else assert.equal(canonical(operation()), canonical(parseDecimal(c.expected, location)), c.id);
  }
});
for (const optimize of ['-O0', '-O2']) test(`native runtime agrees with published decimal128 arithmetic vectors (${optimize})`, () => {
  const lines = ["DefVarDc34xAy0", "DefVarDc34xBy0"];
  for (const c of official) {
    lines.push(`SetVarDc34xAy${c.a}`, `SetVarDc34xBy${c.b}`, 'Tentar', `${c.op}xyDc34x@Ay@B`);
    if (c.error) lines.push(`GerarTxtxl'BAD:${c.id}'`);
    else lines.push(`CompararDiferentexyDc34x@ULTIMOy${c.expected}`, 'Sex@ULTIMO', `GerarTxtxl'BAD:${c.id}'`, 'FimSe');
    lines.push('CapturarxE');
    if (c.error) lines.push('ErroCodigoxE', `CompararDiferentexyInSd32x@ULTIMOy${c.error}`, 'Sex@ULTIMO', `GerarTxtxl'BAD:${c.id}'`, 'FimSe');
    else lines.push(`GerarTxtxl'UNEXPECTED:${c.id}'`);
    lines.push('FimTentar');
  }
  const r = execute(lines.join('\n'), { optimize });
  assert.equal(r.status, 0); assert.equal(r.stdout, '');
});
