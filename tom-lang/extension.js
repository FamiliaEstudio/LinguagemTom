const vscode = require('vscode');

const frameRegex = /^DefBudgetFramexyTargetFPSy(\d+)$/;
const systemRegex = /^DefBudgetSistemax([A-Za-z_][A-Za-z0-9_]*)yMaxMsy(-?\d+(?:\.\d+)?)$/;
const priorityRegex = /^DefPrioridadex([A-Za-z_][A-Za-z0-9_]*)y(-?\d+)$/;

const scopeStartRegex = /^EscopoInix([A-Za-z_][A-Za-z0-9_]*)$/;
const scopeEndRegex = /^EscopoFimx([A-Za-z_][A-Za-z0-9_]*)$/;
const numericOpRegex = /^(Somar|Subtr|Multi|Divid)xy(In|Fl)(Sd|Ud)?(32|64)x/;
const vectorOpRegex = /^(Somar|Subtr|Multi|Divid)Vec4(In|Fl)(32|64)x/;
const TOMCYCLES_PER_MS = 1000;
const OP_COSTS = {
  Somar: 1,
  Subtr: 1,
  Multi: 3,
  Divid: 60,
  SomarVec4: 6,
  SubtrVec4: 6,
  MultiVec4: 10,
  DividVec4: 120,
};


function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('tom-live-budget');
  const budgetDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor('charts.green'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  const refresh = (document) => {
    if (!document || document.languageId !== 'tom') return;

    const docDiagnostics = [];
    const decorationRanges = [];
    const systemNames = new Set();
    const systemLimits = new Map();
    const scopeStack = [];
    const scopeCosts = new Map();

    for (let index = 0; index < document.lineCount; index += 1) {
      const line = document.lineAt(index);
      const text = line.text.trim();
      if (!text) continue;

      let hover;
      const frame = text.match(frameRegex);
      if (frame) {
        const fps = Number.parseInt(frame[1], 10);
        if (!Number.isInteger(fps) || fps <= 0) {
          docDiagnostics.push(new vscode.Diagnostic(
            line.range,
            'Tom Live Budget: Target FPS deve ser maior que zero.',
            vscode.DiagnosticSeverity.Error,
          ));
          continue;
        }

        const frameMs = (1000 / fps).toFixed(2);
        hover = `⏱ Tom Live Budget: alvo ${fps} FPS (~${frameMs} ms/frame)`;
      }

      const system = text.match(systemRegex);
      if (system) {
        const [, name, maxMsRaw] = system;
        const maxMs = Number.parseFloat(maxMsRaw);

        if (!Number.isFinite(maxMs) || maxMs <= 0) {
          docDiagnostics.push(new vscode.Diagnostic(
            line.range,
            `Tom Live Budget: sistema ${name} deve ter MaxMs > 0.`,
            vscode.DiagnosticSeverity.Error,
          ));
          continue;
        }

        if (systemNames.has(name)) {
          docDiagnostics.push(new vscode.Diagnostic(
            line.range,
            `Tom Live Budget: sistema ${name} já foi definido.`,
            vscode.DiagnosticSeverity.Warning,
          ));
        }

        systemNames.add(name);
        systemLimits.set(name, Math.round(maxMs * TOMCYCLES_PER_MS));
        hover = `🧩 Tom Live Budget: sistema ${name} com limite de ${maxMs} ms/frame`;
      }

      const priority = text.match(priorityRegex);
      if (priority) {
        const [, name, levelRaw] = priority;
        const level = Number.parseInt(levelRaw, 10);

        if (!Number.isInteger(level) || level < 0) {
          docDiagnostics.push(new vscode.Diagnostic(
            line.range,
            `Tom Live Budget: prioridade ${name} precisa ser um inteiro >= 0.`,
            vscode.DiagnosticSeverity.Error,
          ));
          continue;
        }

        if (level > 10) {
          docDiagnostics.push(new vscode.Diagnostic(
            line.range,
            `Tom Live Budget: prioridade ${name} acima de 10 pode desequilibrar agendamento.`,
            vscode.DiagnosticSeverity.Information,
          ));
        }

        hover = `📌 Tom Live Budget: prioridade ${name} = ${level}`;
      }


      const scopeStart = text.match(scopeStartRegex);
      if (scopeStart) {
        scopeStack.push(scopeStart[1]);
      }

      const numeric = text.match(numericOpRegex);
      if (numeric && scopeStack.length > 0) {
        const op = numeric[1];
        const activeScope = scopeStack[scopeStack.length - 1];
        const currentCost = scopeCosts.get(activeScope) || 0;
        scopeCosts.set(activeScope, currentCost + (OP_COSTS[op] || 1));
      }

      const vector = text.match(vectorOpRegex);
      if (vector && scopeStack.length > 0) {
        const op = `${vector[1]}Vec4`;
        const activeScope = scopeStack[scopeStack.length - 1];
        const currentCost = scopeCosts.get(activeScope) || 0;
        scopeCosts.set(activeScope, currentCost + (OP_COSTS[op] || 6));
      }

      const scopeEnd = text.match(scopeEndRegex);
      if (scopeEnd) {
        const scopeName = scopeEnd[1];
        const activeScope = scopeStack.pop();
        if (activeScope !== scopeName) {
          docDiagnostics.push(new vscode.Diagnostic(
            line.range,
            `Tom Live Budget: EscopoFimx${scopeName} não corresponde ao escopo ativo (${activeScope || 'nenhum'}).`,
            vscode.DiagnosticSeverity.Warning,
          ));
        }

        const limit = systemLimits.get(scopeName);
        if (limit) {
          const estimated = scopeCosts.get(scopeName) || 0;
          if (estimated > limit) {
            docDiagnostics.push(new vscode.Diagnostic(
              line.range,
              `Tom Live Budget WCET: escopo ${scopeName} estimado em ${estimated} TomCycles (limite ${limit}).`,
              vscode.DiagnosticSeverity.Warning,
            ));
          }
        }
      }

      if (hover) {
        decorationRanges.push({
          range: line.range,
          hoverMessage: hover,
          renderOptions: {
            after: {
              contentText: '  ← Tom Live Budget',
              color: new vscode.ThemeColor('descriptionForeground'),
            },
          },
        });
      }
    }

    diagnostics.set(document.uri, docDiagnostics);

    const visibleEditors = vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri.toString() === document.uri.toString(),
    );

    for (const editor of visibleEditors) {
      editor.setDecorations(budgetDecoration, decorationRanges);
    }
  };

  const refreshVisibleTomEditors = () => {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'tom') {
        refresh(editor.document);
      }
    }
  };

  context.subscriptions.push(
    diagnostics,
    budgetDecoration,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.window.onDidChangeVisibleTextEditors(refreshVisibleTomEditors),
  );

  refreshVisibleTomEditors();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
