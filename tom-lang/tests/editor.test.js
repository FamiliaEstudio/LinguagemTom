'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('editor shares compiler diagnostics, validates open documents and clears closed ones', () => {
  const documents = new Map();
  const callbacks = {};
  const doc = { languageId: 'tom', fileName: 'editor.tom', uri: 'uri', lineCount: 3,
    getText: () => '\n// comentário\n  DefVarInSd32xAy12abc',
    lineAt: () => ({ text: '  DefVarInSd32xAy12abc' }) };
  const collection = { set: (uri, ds) => documents.set(uri, ds), delete: uri => documents.delete(uri), dispose() {} };
  const vscode = {
    languages: { createDiagnosticCollection: () => collection },
    Range: class { constructor(line, column) { this.start = { line, character: column }; } },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    DiagnosticSeverity: { Error: 0 },
    workspace: { textDocuments: [doc], ...Object.fromEntries(['onDidOpenTextDocument','onDidChangeTextDocument','onDidCloseTextDocument'].map(name => [name, cb => { callbacks[name] = cb; return { dispose() {} }; }])) },
  };
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(name, ...args) { return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args); };
    extension = require('../extension');
  } finally { Module._load = originalLoad; }
  extension.activate({ subscriptions: [] });
  const [diagnostic] = documents.get('uri');
  assert.equal(diagnostic.code, 'E_LITERAL');
  assert.equal(diagnostic.range.start.line, 2);
  assert.equal(diagnostic.range.start.character, 2);
  doc.getText = () => 'SomarxyInSd32x10y20';
  callbacks.onDidChangeTextDocument({ document: doc });
  assert.deepEqual(documents.get('uri'), []);
  callbacks.onDidCloseTextDocument(doc);
  assert.equal(documents.has('uri'), false);
});

test('0.2 snippets expand to valid programs and grammar recognizes stable functions', () => {
  const { compile } = require('../core/compiler');
  const snippets = require('../snippets.json');
  const expand = body => body.join('\n').replace(/\$\{\d+\|([^|]+)\|\}/g, (_, values) => values.split(',')[0]).replace(/\$\{\d+:([^{}]*)\}/g, '$1').replace(/\$\d+/g, '');
  for (const name of ['Decimal', 'Booleano', 'Se / Senao', 'Funcao CPU', 'Capturar erro', 'Janela SDL']) {
    const result = compile(expand(snippets[name].body));
    assert.equal(result.success, true, name + JSON.stringify(result.diagnostics));
  }
  const patterns = require('../syntaxes/tom.tmGrammar.json').patterns;
  const deprecated = new RegExp(patterns.find(x => x.name === 'invalid.deprecated.tom').match);
  assert.equal(deprecated.test('DefFuncaoxSomar[Dc34xA,Dc34xB]yDc34'), false);
  assert.equal(deprecated.test('GpuBufCriarIn32x10yA'), true);
});
