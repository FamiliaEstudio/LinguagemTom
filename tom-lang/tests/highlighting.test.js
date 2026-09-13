'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const textmate = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const { createGrammar } = require('../editor/grammar');
const stored = require('../syntaxes/tom.tmGrammar.json');
let grammar;
test.before(async () => {
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({ createOnigScanner: patterns => new oniguruma.OnigScanner(patterns), createOnigString: text => new oniguruma.OnigString(text) }),
    loadGrammar: async name => name === 'source.tom' ? stored : null,
  });
  grammar = await registry.loadGrammar('source.tom');
});
function tokens(line, state) {
  return grammar.tokenizeLine(line, state).tokens.map(t => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes }));
}
function has(line, text, scope) {
  const found = tokens(line).find(t => t.text === text && t.scopes.includes(scope));
  assert.ok(found, `${JSON.stringify(text)} must be ${scope}: ${JSON.stringify(tokens(line))}`);
}
test('the shipped grammar matches the compiler-derived source', () => assert.deepEqual(stored, createGrammar()));
test('function names, parameter names and types remain distinct in compact signatures', () => {
  const line = 'DefFuncaoxSomarValores[Dc34xValorA,RefFB64CxVisor]yDc34';
  has(line, 'DefFuncao', 'keyword.control.tom');
  has(line, 'SomarValores', 'entity.name.function.tom');
  has(line, 'ValorA', 'variable.parameter.tom');
  has(line, 'Visor', 'variable.parameter.tom');
  has(line, 'FB64C', 'support.type.tom');
  has(line, 'Ref', 'storage.modifier.tom');
  has('ChamarxSomarValores[0.1,0.2]', 'SomarValores', 'entity.name.function.tom');
});
test('declarations and references do not split names containing types or commands', () => {
  has('DefVarDc34xSomarFl32y0.1', 'SomarFl32', 'variable.other.readwrite.tom');
  has('DefVarDc34xSomarFl32y0.1', '0.1', 'constant.numeric.tom');
  has('SomarxyDc34x@ValorAy@ValorB', 'ValorA', 'variable.other.readwrite.tom');
  has('SomarxyDc34x@ValorAy@ValorB', 'ValorB', 'variable.other.readwrite.tom');
  has('SomarxyInSd32x@ValorAy1', 'ValorA', 'variable.other.readwrite.tom');
  has('Retornarx@ULTIMO', '@ULTIMO', 'variable.language.tom');
  has('SexVerdadeiro', 'Verdadeiro', 'constant.language.boolean.tom');
});
test('runtime calls and resources are highlighted even with the E prefix', () => {
  has("DefRecursoxJanelayJanelaCriar[l'Tom',480,640]", 'Janela', 'variable.other.readwrite.tom');
  has("DefRecursoxJanelayJanelaCriar[l'Tom',480,640]", 'JanelaCriar', 'support.function.tom');
  has('EventoAguardar[@Janela,@Evento]', 'EventoAguardar', 'support.function.tom');
  has('DeferChamarxLimpar[@Buffer]', 'Limpar', 'entity.name.function.tom');
  has('DeferAnexarTxt[@Buffer,l\'D\']', 'AnexarTxt', 'support.function.tom');
});
test('0.3 imports, constants, borrowed collections and musical calls have stable scopes', () => {
  has("Importar[l'tom/musica']", 'Importar', 'keyword.control.tom');
  has('DefConstInSd64xORIGEMy0', 'ORIGEM', 'variable.other.constant.tom');
  has('DefFuncaoxDesenhar[RefSOA<Nota>xNotas,AudioxA]yVazio', 'SOA<Nota>', 'support.type.tom');
  has('DefFuncaoxDesenhar[RefSOA<Nota>xNotas,AudioxA]yVazio', 'Notas', 'variable.parameter.tom');
  has('PropBlxativa', 'Bl', 'support.type.tom');
  has('ComprimentoSOA[@Notas]', 'ComprimentoSOA', 'keyword.control.tom');
  has('AudioAgendarTom[@A,0,440.0,0.1,1000,0]', 'AudioAgendarTom', 'support.function.tom');
  has('EventoTempoNs[@E]', 'EventoTempoNs', 'support.function.tom');
});
test('strings and comments protect names, percent signs, escapes and command delimiters', () => {
  const line = "GerarTxtxl'DefFuncaoxF // @A %s 🐈 \\'fim\\'' // @B Somar";
  const ts = tokens(line);
  assert.ok(ts.filter(t => t.text.includes('@A') || t.text.includes('🐈')).every(t => t.scopes.includes('string.quoted.single.tom')));
  has(line, "\\'", 'constant.character.escape.tom');
  has(line, '// @B Somar', 'comment.line.double-slash.tom');
  const unfinished = grammar.tokenizeLine("GerarTxtxl'faltando fechar");
  has('DefVarInSd32xAy1', 'A', 'variable.other.readwrite.tom');
  assert.ok(tokens('DefVarInSd32xAy1', unfinished.ruleStack).some(t => t.text === 'A' && t.scopes.includes('variable.other.readwrite.tom')));
});
test('SOA and error objects distinguish receivers from properties and labels', () => {
  has('SetVarInSd32xgrupo@0.hpy10', 'grupo', 'variable.other.readwrite.tom');
  has('SetVarInSd32xgrupo@0.hpy10', 'hp', 'variable.other.property.tom');
  has('PropIn32xhp', 'hp', 'variable.other.property.tom');
  has('CapturarxErro', 'Erro', 'variable.other.readwrite.tom');
  has('EscopoInixBloco', 'Bloco', 'entity.name.label.tom');
});
test('the complete calculator tokenizes without losing state or classifying stable commands as experimental', () => {
  let state = textmate.INITIAL;
  const source = fs.readFileSync(path.join(__dirname, '../exemplos/calculadora.tom'), 'utf8');
  for (const line of source.split('\n')) {
    const result = grammar.tokenizeLine(line, state); state = result.ruleStack;
    assert.ok(result.tokens.every(t => !t.scopes.includes('invalid.deprecated.tom')), line);
  }
  assert.equal(state.depth, 1);
});

test('0.4 nominal declarations, nested properties and range indices retain distinct scopes', () => {
  has('DefRegistroxSessao', 'Sessao', 'entity.name.type.struct.tom');
  has('DefEnumxFase', 'Fase', 'entity.name.type.struct.tom');
  has('DefVarRegistro<Sessao>xEstadoyPadrao', 'Registro<Sessao>', 'support.type.tom');
  has('SetVarInSd64xEstado.relogio.origemNsy1', 'origemNs', 'variable.other.property.tom');
  has('DefFuncaoxPausar[RefRegistro<Sessao>xEstado]yVazio', 'Estado', 'variable.parameter.tom');
  has('ParaxI[0,10,1]', 'Para', 'keyword.control.tom');
  has('ParaIndiceSOAxI[@Itens]', 'ParaIndiceSOA', 'keyword.control.tom');
  has('SOAComprimento[@Itens]', 'SOAComprimento', 'keyword.control.tom');
  has("JsonObterInSd64[@J,l'/origemNs']", 'JsonObterInSd64', 'support.function.tom');
});
