'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, checkValue } = require('./helpers');

for (const optimize of ['-O0', '-O2']) {
  test(`literal text and mutation preserve bytes (${optimize})`, () => {
    const r = execute("DefTxtxMyl'100% %s %n 🐈 // '\nSomarTxtxMyl'á\\n'\nGerarTxtxM\nSetTxtxMyl'fim'\nGerarTxtxM", { optimize });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '100% %s %n 🐈 // á\nfim');
  });

  test(`defer LIFO and conditional registration (${optimize})`, () => {
    const r = execute("EscopoInixS\nDeferGerarTxtxl'A'\nDeferGerarTxtxl'B'\nSeMaiorxyInSd32x0y1\nDeferGerarTxtxl'C'\nGerarTxtxl'BAD'\nEscopoFimxS", { optimize });
    assert.equal(r.stdout, 'BA');
    assert.equal(r.status, 0);
  });

  test(`nested cleanup and deferred numeric assignments (${optimize})`, () => {
    const source = "DefVarInSd32xAy0\nEscopoInixOuter\nDeferSetVarInSd32xAy1\nDeferSetVarInSd32xAy2\nEscopoInixInner\nDeferGerarTxtxl'I'\nSeMaiorxyInSd32x0y1\nEscopoFimxInner\nDeferGerarTxtxl'O'\nEscopoFimxOuter\n" + checkValue('InSd32', '@A', '1');
    const r = execute(source, { optimize });
    assert.equal(r.stdout, 'IOOK');
    assert.equal(r.status, 0);
  });

  test(`dynamic integer arithmetic retains precision (${optimize})`, () => {
    const source = 'DefVarInSd64xAy9007199254740993\nSomarxyInSd64x@Ay2\nSetVarInSd64xAy@ULTIMO\n' + checkValue('InSd64', '@A', '9007199254740995');
    const r = execute(source, { optimize });
    assert.equal(r.stdout, 'OK');
    assert.equal(r.status, 0);
  });

  test(`runtime arithmetic failures are controlled (${optimize})`, () => {
    for (const source of [
      'DefVarInSd32xAy2147483647\nSomarxyInSd32x@Ay1',
      'DefVarInUd32xAy0\nSubtrxyInUd32x@Ay1',
      'DefVarInUd64xAy18446744073709551615\nMultixyInUd64x@Ay2',
      'DefVarInSd64xAy-9223372036854775808\nDividxyInSd64x@Ay-1',
      'DefVarInSd32xAy0\nDividxyInSd32x1y@A',
    ]) {
      const r = execute(source, { optimize });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /case\.tom:2:1: erro: (?:Overflow|Divisão inválida)/);
    }
  });

  test(`SOA scalar loop and strings are invariant under optimization (${optimize})`, () => {
    const source = "DefStructSOAxP\nPropIn32xhp\nPropIn32xmp\nFimDef\nDefArraySoAxgrupoxPx5\nParaCadaSOAxgrupoxSomarhp2\nGerarTxtxl'grupo@0.hp'\nGetVarxgrupoxIndex4xhp\nDefVarInSd32xAy@ULTIMO\n" + checkValue('InSd32', '@A', '2');
    const r = execute(source, { optimize });
    assert.equal(r.stdout, 'grupo@0.hpOK');
    assert.equal(r.status, 0);
  });

  test(`dynamic array indices are checked (${optimize})`, () => {
    for (const index of ['-1', '4', '99']) {
      const r = execute(`DefStructSOAxP\nPropIn32xhp\nFimDef\nDefArraySoAxgrupoxPx4\nDefVarInSd32xIdy${index}\nGetVarxgrupoxIndex@Idxhp`, { optimize });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /Índice SOA fora do limite/);
    }
  });
}

test('float constants, vector constants and i64 final result verify and execute', () => {
  const r = execute('DefVarFl32xAy0.0\nDefVarFl32xBy0.1\nSomarxyFl32x@Ay@B\nDefVarFl64xCy-0.0\nDividxyFl64x1.0y2.0\nSomarVec4In64x[1,2,3,4]y[4,3,2,1]\nDefVarInSd64xIy9007199254740993\nSetVarInSd64xIy@I');
  assert.equal(r.status, 0);
});

test('all integer operations agree with a BigInt reference at both optimization levels', () => {
  for (const type of ['InSd32', 'InUd32', 'InSd64', 'InUd64']) {
    const signed = type.includes('Sd');
    const pairs = signed ? [[-17n, 3n], [17n, -3n], [-9n, -4n], [0n, 3n]] : [[17n, 3n], [9n, 4n], [0n, 3n]];
    const operations = { Somar: (a, b) => a + b, Subtr: (a, b) => a - b, Multi: (a, b) => a * b, Divid: (a, b) => a / b };
    const lines = [`DefVar${type}xAy0`, `DefVar${type}xBy0`, `DefVar${type}xRy0`];
    let checks = 0;
    for (const [a, b] of pairs) {
      for (const [op, evaluate] of Object.entries(operations)) {
        const expected = evaluate(a, b);
        if (!signed && expected < 0n) continue;
        lines.push(`SetVar${type}xAy${a}`, `SetVar${type}xBy${b}`, `${op}xy${type}x@Ay@B`, `SetVar${type}xRy@ULTIMO`, checkValue(type, '@R', expected.toString()));
        checks += 1;
      }
    }
    for (const optimize of ['-O0', '-O2']) {
      const r = execute(lines.join('\n'), { optimize });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, 'OK'.repeat(checks));
    }
  }
});

test('defer captures visible bindings and can read a conditional local at cleanup', () => {
  const r = execute("EscopoInixS\nSeMaiorxyInSd32x2y1\nDefVarInSd32xLocaly1\nDeferSomarxyInSd32x@Localy1\nDeferGerarTxtxl'done'\nEscopoFimxS", { optimize: '-O2' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'done');
});

test('SOA property names ending in digits are resolved without changing the increment', () => {
  const source = 'DefStructSOAxP\nPropIn32xhp2\nFimDef\nDefArraySoAxaxPx4\nParaCadaSOAxaxSomarhp22\nGetVarxaxIndex0xhp2\nDefVarInSd32xRy@ULTIMO\n' + checkValue('InSd32', '@R', '2');
  const r = execute(source, { optimize: '-O2' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'OK');
});

test('input accepts all signed/unsigned extrema and rejects malformed/out-of-range tokens', () => {
  for (const [type, values, invalid] of [
    ['InSd32', ['-2147483648', '2147483647', '0'], ['2147483648', '-2147483649']],
    ['InUd32', ['0', '4294967295'], ['4294967296', '-1']],
    ['InSd64', ['-9223372036854775808', '9223372036854775807'], ['9223372036854775808', '-9223372036854775809']],
    ['InUd64', ['0', '18446744073709551615'], ['18446744073709551616', '-0']],
  ]) {
    for (const value of values) {
      const source = `DefVar${type}xAy0\nLerEntrada${type}xA\n` + checkValue(type, '@A', value);
      const r = execute(source, { input: ` \t${value}\n` });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, 'OK');
    }
    for (const value of [...invalid, '12abc', '+', '-', '', '1.5']) {
      const r = execute(`DefVar${type}xAy0\nLerEntrada${type}xA`, { input: value });
      assert.equal(r.status, 1, `${type}: ${value}`);
      assert.match(r.stdout, /Entrada inválida/);
    }
  }
});
