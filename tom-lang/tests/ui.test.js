'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, rejection } = require('./helpers');
const smoke = `DefRecursoxJyJanelaCriar[l'Tom 0.2',480,640]
DefRecursoxFyFonteCarregar[20]
DefRecursoxEyEventoCriar[]
JanelaLimpar[@J,538976511]
DesenharRetangulo[@J,20,180,100,80,809124607]
DesenharTexto[@J,@F,l'Olá, 0,3 %',24,40,4294967295]
JanelaApresentar[@J]
EventoAguardar[@J,@E]
EventoCampo[@E,0]
DefVarInSd32xTy@ULTIMO
CompararIgualxyInSd32x@Ty1
Sex@ULTIMO
GerarTxtxl'OK'
FimSe`;
for (const optimize of ['-O0', '-O2']) test(`SDL software drawing and event wait (${optimize})`, () => {
  const result = execute(smoke, { optimize, environment: { SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software' }, events: 'quit\n' });
  assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(result.stdout, 'OK');
  assert.match(result.trace, /Olá, 0,3 %/);
});
test('window mutation requires a mutable borrow', () => {
  rejection('DefFuncaoxDesenhar[JanelaxJ]yVazio\nJanelaLimpar[@J,0]\nFimFuncao', 'E_BORROW');
});
const fs = require('node:fs');
const path = require('node:path');
const calculator = fs.readFileSync(path.join(__dirname, '../exemplos/calculadora.tom'), 'utf8');
const displays = trace => [...trace.matchAll(/^TEXT 36 86 (.*)$/gm)].map(x => x[1]);
for (const optimize of ['-O0', '-O2']) {
  test(`Tom calculator: decimals, sequential operations, repeated equals and recovery (${optimize})`, () => {
    const result = execute(calculator, { optimize, environment: { SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software' }, events:
      'text 0.1+0,2=\ntext c2+3*4=\nkey 13\ntext c1/0=\ntext 7+8=\ntext c1/3=\nquit\n' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(displays(result.trace), ['0', '0,3', '20', '80', 'Erro', '15', '0,3333333333333333333333333333333333']);
  });
  test(`Tom calculator: mouse, resize, sign, backspace and ignored keys (${optimize})`, () => {
    const result = execute(calculator, { optimize, environment: { SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software' }, events:
      'mouse 180 480\nmouse 400 480\nresize 960 1280\nmouse 600 960\nkey 13\ntext c123\nkey 8\ntext ±\nkey 48\ntext ,5=\nquit\n' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const values = displays(result.trace);
    assert.ok(values.includes('5'), JSON.stringify(values));
    assert.equal(values.at(-1), '-12,5');
  });
}
for (const optimize of ['-O0', '-O2']) test(`repeated windows/fonts close without retaining runtime resources (${optimize})`, () => {
  const source = "DefVarInSd32xIy0\nDefVarBlxRuny1\nEnquantox@Run\nDefRecursoxJyJanelaCriar[l'Recursos',120,160]\nDefRecursoxFyFonteCarregar[12]\nDefRecursoxEyEventoCriar[]\nJanelaLimpar[@J,0]\nDesenharTexto[@J,@F,l'á🐈%',2,2,4294967295]\nJanelaApresentar[@J]\nSomarxyInSd32x@Iy1\nSetVarInSd32xIy@ULTIMO\nCompararMenorxyInSd32x@Iy25\nSetVarBlxRuny@ULTIMO\nFimEnquanto";
  const r = execute(source, { optimize, maximumLiveObjects: 3, environment: { SDL_VIDEODRIVER: 'dummy', SDL_RENDER_DRIVER: 'software', LD_LIBRARY_PATH: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
