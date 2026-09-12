'use strict';
const vscode = require('vscode');
const { compile } = require('./core/compiler');

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('tom');
  const refresh = document => {
    if (document.languageId !== 'tom') return;
    const result = compile(document.getText(), { file: document.fileName });
    diagnostics.set(document.uri, result.diagnostics.map(item => {
      const line = Math.max(0, Math.min(document.lineCount - 1, item.line - 1));
      const column = Math.min(document.lineAt(line).text.length, item.column - 1);
      const range = new vscode.Range(line, column, line, document.lineAt(line).text.length);
      const diagnostic = new vscode.Diagnostic(range, item.message, vscode.DiagnosticSeverity.Error);
      diagnostic.code = item.code;
      diagnostic.source = 'Tom';
      return diagnostic;
    }));
  };
  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(event => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri)),
  );
  vscode.workspace.textDocuments.forEach(refresh);
}

function deactivate() {}
module.exports = { activate, deactivate };
