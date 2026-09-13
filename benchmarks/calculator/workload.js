'use strict';
// Explicit oracle for observable behavior, independent of both implementations.
const errors = {
  division: 'Divisão por zero ou operação inválida.',
  invalid: 'Entrada inválida ou perda de precisão.',
  capacity: 'Capacidade do buffer excedida.',
};
const step = (event, display, message = '') => ({ event, ...(display === null ? {} : { display, message }) });
const cases = [
  { name: 'exact decimal and comma', steps: [step('text 0.1+0,2=', '0,3')] },
  { name: 'sequential and repeat equals', steps: [step('text 2+3*4=', '20'), step('key 13', '80'), step('key 13', '320')] },
  { name: 'replace pending operator', steps: [step('text 2+*3=', '6')] },
  { name: 'repeat addition', steps: [step('text 2+3==', '8')] },
  { name: 'equals without input', steps: [step('text ==', '0')] },
  { name: 'pending without new right operand', steps: [step('text 2+=', '4')] },
  { name: 'Unicode operators', steps: [step('text 12−5=', '7'), step('text c12÷3×2=', '8')] },
  { name: 'partial and repeated separator', steps: [step('text .5=', '0,5'), step('text c1,,2=', '1,2'), step('text c12.=', '12')] },
  { name: 'backspace and sign', steps: [step('text 123', '123'), step('key 8', '12'), step('text ±', '-12'), step('text ,5=', '-12,5')] },
  { name: 'sign preserves repeat history', steps: [step('text 2+3=', '5'), step('text ±', '-5'), step('text =', '-2')] },
  { name: 'backspace result and isolated sign', steps: [step('text 1+2=', '3'), step('key 8', '0'), step('text 1±', '-1'), step('key 8', '0')] },
  { name: 'division error and recovery', steps: [step('text 1/0=', 'Erro', errors.division), step('text +', null), step('text 7+8=', '15')] },
  { name: 'capacity and clear', steps: [step('text ' + '1'.repeat(128), 'Erro', errors.capacity), step('key 27', '0')] },
  { name: 'inexact input rejected', steps: [step('text ' + '1'.repeat(35) + '=', 'Erro', errors.invalid), step('text c5', '5')] },
  { name: 'integer beyond binary64 precision', steps: [step('text 9007199254740993+1=', '9007199254740994')] },
  { name: 'periodic decimal', steps: [step('text 1/3=', '0,3333333333333333333333333333333333')] },
  { name: 'unknown text and printable keydown ignored', steps: [step('text %🦉', null), step('key 48', null), step('expose', '0')] },
  { name: 'mouse scale and close-independent redraw', steps: [
    step('mouse 180 480 1', '2'), step('mouse 400 480 1', '2'), step('resize 960 1280', '2'),
    step('mouse 600 960 1', '3'), step('key 13', '5'), step('expose', '5'),
    step('mouse 10 10 1', null), step('mouse 360 960 3', null),
  ] },
  { name: 'exclusive button edges', steps: [step('mouse 126 250 1', null), step('mouse 70 288 1', null), step('mouse 24 296 1', '7')] },
];
const buttons = [
  [24,216,102,'0'], [134,216,102,'0'], [244,216,102,'-0'], [354,216,102,'0'],
  [24,296,102,'7'], [134,296,102,'8'], [244,296,102,'9'], [354,296,102,'0'],
  [24,376,102,'4'], [134,376,102,'5'], [244,376,102,'6'], [354,376,102,'0'],
  [24,456,102,'1'], [134,456,102,'2'], [244,456,102,'3'], [354,456,102,'0'],
  [24,536,102,'0'], [134,536,102,'0,'], [244,536,212,'0'],
];
buttons.forEach(([x,y,width,display],i) => cases.push({ name: `button ${i+1}`, steps: [step(`mouse ${x+Math.floor(width/2)} ${y+36} 1`,display)] }));

function workload() {
  const events = [], observations = [{ display: '0', message: '' }];
  const boundaries = [];
  for (const test of cases) {
    const start = events.length;
    // Explicit state/size reset makes repeated cycles independent.
    for (const action of [step('text c','0'), step('resize 480 640','0'), ...test.steps]) {
      if (!/^(?:text |key |mouse |resize |expose$)/.test(action.event) || /[\r\n]/.test(action.event)) throw new Error('Invalid fixture');
      events.push(action.event);
      if (action.display !== undefined) observations.push({ display: action.display, message: action.message });
    }
    boundaries.push({ name: test.name, firstEvent: start, eventCount: events.length-start });
  }
  return { text: events.join('\n')+'\n', events: events.length, observations, cases: boundaries };
}
module.exports = { workload };
