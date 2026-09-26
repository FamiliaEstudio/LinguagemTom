'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const { compileResolved } = require('./core/module-loader');
const { normalize } = require('./core/modules');

let activeCompanion;
function activate(context) {
  const companion = vscode.commands?.registerCommand ? require('./companion/extension').activate(vscode, context) : null;
  if (companion) { activeCompanion=companion;context.subscriptions.push(companion); }
  const diagnostics = vscode.languages.createDiagnosticCollection('tom');
  let previous = new Set();
  const refresh = (documents = vscode.workspace.textDocuments) => {
    const open = documents.filter(d => d.languageId === 'tom');
    const buffers = new Map(open.map(d => [normalize(d.fileName), d]));
    const read = file => buffers.get(normalize(file))?.getText() ?? fs.readFileSync(file);
    const groups = new Map(open.map(d => [normalize(d.fileName), { uri: d.uri, document: d, items: [] }]));
    const seen = new Set();
    for (const document of open) {
      // Companion and map own diagnostics for watched buffers in Node workers.
      // Do not generate LLVM synchronously again on each editor keystroke.
      if (companion?.owns(document.fileName)) continue;
      const result = compileResolved(document.getText(), { file: document.fileName }, read);
      for (const item of result.diagnostics) {
        const name = item.file.startsWith('tom/') ? path.join(__dirname, 'stdlib', item.file.slice(4) + '.tom') : item.file;
        const key = normalize(name), identity = JSON.stringify({ ...item, file: key });
        if (seen.has(identity)) continue;
        seen.add(identity);
        if (!groups.has(key)) groups.set(key, { uri: vscode.Uri.file(name), items: [] });
        const group = groups.get(key);
        let lines;
        try { lines = (group.document?.getText() ?? read(name).toString()).split(/\r?\n/); } catch { lines = ['']; }
        const line = Math.max(0, Math.min(lines.length - 1, item.line - 1));
        const column = Math.max(0, Math.min(lines[line].length, item.column - 1));
        const range = new vscode.Range(line, column, line, lines[line].length);
        const diagnostic = new vscode.Diagnostic(range, item.message, vscode.DiagnosticSeverity.Error);
        diagnostic.code = item.code; diagnostic.source = 'Tom'; group.items.push(diagnostic);
      }
    }
    const current = new Set([...groups.values()].map(g => g.uri));
    for (const uri of previous) if (!current.has(uri)) diagnostics.delete(uri);
    for (const group of groups.values()) diagnostics.set(group.uri, group.items);
    previous = current;
  };
  context.subscriptions.push(diagnostics,
    vscode.workspace.onDidOpenTextDocument(() => refresh()),
    vscode.workspace.onDidChangeTextDocument(() => refresh()),
    vscode.workspace.onDidCloseTextDocument(document => { diagnostics.delete(document.uri); refresh(vscode.workspace.textDocuments.filter(d => d !== document)); }));
  if (vscode.workspace.createFileSystemWatcher) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.tom');
    context.subscriptions.push(watcher, watcher.onDidChange(() => refresh()), watcher.onDidCreate(() => refresh()), watcher.onDidDelete(() => refresh()));
  }
  refresh();
}
async function deactivate() { try { await activeCompanion?.shutdown(); } finally { activeCompanion?.dispose();activeCompanion=null; } }
module.exports = { activate, deactivate };
