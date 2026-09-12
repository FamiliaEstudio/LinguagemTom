'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../core/compiler');
const { success, rejection } = require('./helpers');

test('literal arithmetic and diagnostics use original source positions', () => {
  success('SomarxyInSd32x10y20');
  const d = rejection('\n// comentário\n  DefVarInSd32xAy12abc', 'E_LITERAL');
  assert.equal(d.file, 'case.tom');
  assert.equal(d.line, 3);
  assert.equal(d.column, 3);
});

test('comments, escaped literals and lexical errors', () => {
  success("EscopoInixS\nDeferGerarTxtxl'@ULTIMO %s'\nEscopoFimxS");
  success("// início\r\nGerarTxtxl'URL // e \\'aspas\\' e \\\\n' // fim");
  rejection("GerarTxtxl'fim", 'E_STRING');
  rejection("GerarTxtxl'\\q'", 'E_ESCAPE');
  rejection("GerarTxtxl'\0'", 'E_STRING');
});

test('exact ranges and strict integer tokens', () => {
  for (const [type, min, max] of [
    ['InSd32', '-2147483648', '2147483647'],
    ['InUd32', '0', '4294967295'],
    ['InSd64', '-9223372036854775808', '9223372036854775807'],
    ['InUd64', '0', '18446744073709551615'],
  ]) {
    success(`DefVar${type}xAy${min}\nDefVar${type}xBy${max}`);
    rejection(`DefVar${type}xAy${BigInt(min) - 1n}`, 'E_RANGE');
    rejection(`DefVar${type}xAy${BigInt(max) + 1n}`, 'E_RANGE');
  }
  assert.match(success('DefVarInSd64xAy9007199254740993'), /i64 9007199254740993/);
  for (const raw of ['12abc', '1.5', '1e3', '0x10']) rejection(`DefVarInSd32xAy${raw}`, 'E_LITERAL');
  rejection('DefVarInUd32xAy-0', 'E_RANGE');
  rejection('DefVarInSd32xAy0\nSetVarInUd32xAy1', 'E_TYPE');
});

test('floats have exact LLVM encodings including negative zero', () => {
  assert.match(success('DefVarFl32xAy0.0'), /float 0x0000000000000000/);
  assert.match(success('DefVarFl32xAy0.1'), /float 0x3FB99999A0000000/);
  assert.match(success('DefVarFl64xAy-0.0'), /double 0x8000000000000000/);
  rejection('DefVarFl32xAy1e39', 'E_RANGE');
  rejection('DefVarFl64xAyInfinity', 'E_LITERAL');
});

test('known invalid arithmetic is rejected before artifact publication', () => {
  for (const source of [
    'SomarxyInSd32x2147483647y1',
    'SubtrxyInUd32x0y1',
    'MultixyInSd64x9223372036854775807y2',
    'DividxyInSd64x-9223372036854775808y-1',
    'SomarVec4In32x[2147483647,0,0,0]y[1,0,0,0]',
  ]) rejection(source, 'E_OVERFLOW');
  rejection('DividxyInSd32x10y0', 'E_DIVISION');
  rejection('SomarVec4In32x[1,2]y[3,4]', 'E_VECTOR');
});

test('scope lifetime, duplicate declarations and ambiguous ULTIMO', () => {
  rejection('DefVarInSd32xAy1\nDefVarInSd32xAy2', 'E_DUPLICATE');
  rejection('EscopoInixS\nDefVarInSd32xAy1\nEscopoFimxS\nSetVarInSd32xAy2', 'E_UNDEFINED');
  rejection('EscopoInixS\nSeMaiorxyInSd32x0y1\nSomarxyInSd32x1y2\nEscopoFimxS\nDefVarInSd32xAy@ULTIMO', 'E_ULTIMO');
  rejection('EscopoInixS', 'E_UNCLOSED');
  rejection('EscopoInixS\nEscopoFimxT', 'E_SCOPE');
  rejection('DeferGerarTxtxl\'x\'', 'E_DEFER');
  rejection('EscopoInixS\nDeferDefVarInSd32xAy1\nEscopoFimxS', 'E_DEFER');
  rejection('EscopoInixS\nDeferSetVarInSd32xAy@ULTIMO\nEscopoFimxS', 'E_DEFER');
});

test('text mutations are restricted to deterministic top-level evaluation', () => {
  rejection("DefTxtxMyl'antes'\nEscopoInixS\nSeMaiorxyInSd32x0y1\nSetTxtxMyl'depois'\nEscopoFimxS", 'E_TEXT_FLOW');
  rejection("DefStkFB3CxMyl'áá'", 'E_CAPACITY');
  rejection("SomarlFB3Cxyxl'ab'yl'c'", 'E_CAPACITY');
  rejection("DefStkFB4CxMyl'a'\nSomarlFB5CxMyl'b'", 'E_CAPACITY');
  rejection("DefStkFB4CxMyl'a'\nSetTxtxMyl'b'", 'E_TYPE');
  success("DefStkFB5CxMyl'áá'");
});

test('experimental features fail explicitly without executing JavaScript', () => {
  for (const source of ['@gpu', '@cpu', 'DefFuncaoxSoma', 'Inseguro', 'GpuBufCriarIn32x10yA', 'DefBudgetFramexyTargetFPSy60', 'EscopoInixComptime', 'EscopoInixMainLoop', 'ZonaDefxZy16', "DefStkFB4UxMyl'a'", 'CompDefConstxAyprocess.exit(7)']) {
    rejection(source, 'E_EXPERIMENTAL');
  }
  assert.equal(compile('', { target: 'mlir' }).diagnostics[0].code, 'E_EXPERIMENTAL');
});

test('SOA validates properties, counts and literal bounds', () => {
  const prelude = 'DefStructSOAxP\nPropIn32xhp\nFimDef\nDefArraySoAxgrupoxPx4\n';
  rejection(prelude + 'GetVarxgrupoxIndex4xhp', 'E_BOUNDS');
  rejection(prelude + 'GetVarxgrupoxIndex-1xhp', 'E_BOUNDS');
  rejection(prelude + 'GetVarxgrupoxIndex0xmissing', 'E_PROPERTY');
  rejection('DefStructSOAxP\nPropFl32xx\nFimDef\nDefArraySoAxaxPx4\nParaCadaSOAxaxSomarx2', 'E_EXPERIMENTAL');
  rejection('DefStructSOAxP\nPropIn32xhp\nPropIn32xhp2\nFimDef\nDefArraySoAxaxPx4\nParaCadaSOAxaxSomarhp22', 'E_AMBIGUOUS');
});

test('compilation is deterministic, reentrant and has no CLI side effects', () => {
  const source = "GerarTxtxl'100% %s %n 🐈'";
  const before = success(source);
  rejection('NaoExiste', 'E_SYNTAX');
  assert.equal(success(source), before);
  assert.match(before, /@printf\(ptr @text\d+, ptr @text\d+\)/);
  assert.equal(require('../tomc').compile, compile);
});
