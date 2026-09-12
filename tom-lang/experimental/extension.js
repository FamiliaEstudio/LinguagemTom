const vscode = require('vscode');

// --- Regex do Live Budget ---
const frameRegex = /^DefBudgetFramexyTargetFPSy(\d+)$/;
const systemRegex = /^DefBudgetSistemax([A-Za-z_][A-Za-z0-9_]*)yMaxMsy(-?\d+(?:\.\d+)?)$/;
const priorityRegex = /^DefPrioridadex([A-Za-z_][A-Za-z0-9_]*)y(-?\d+)$/;
const scopeStartRegex = /^EscopoInix([A-Za-z_][A-Za-z0-9_]*)$/;
const scopeEndRegex = /^EscopoFimx([A-Za-z_][A-Za-z0-9_]*)$/;
const numericOpRegex = /^(Somar|Subtr|Multi|Divid)xy(In|Fl)(Sd|Ud)?(32|64)x/;
const vectorOpRegex = /^(Somar|Subtr|Multi|Divid)Vec4(In|Fl)(32|64)x/;

// --- Regex das Pistas de Execução (Lanes) ---
// CPU: Operações lógicas, matemáticas e controle de fluxo
const cpuRegex = /^(Somar|Subtr|Multi|Divid|SeMaior|SetVar|DefVar|Escopo|DefTxt|SetTxt|SomarTxt|Somarl|LerEntrada|DefStk|DefBudget|DefPrioridade).*$/;// GPU: Comandos de despacho e configuração de kernel
const gpuRegex = /^(GpuDisp|GpuDispAsync|DefKernel|GpuIdObt|GpuLer|GpuEscr|FimDef|GpuBufCriar).*$/;
// Transferência: Uploads/Downloads (Gargalos)
const transferRegex = /^(GpuEnv|GpuRec|GpuApresentar).*$/;
// Fence: Barreiras de sincronia
const fenceRegex = /^(GpuFence|AguardarGpu|Sincronizar).*$/;

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
  // 1. Decorações do Live Budget (Existente)
  const diagnostics = vscode.languages.createDiagnosticCollection('tom-live-budget');
  const budgetDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    overviewRulerColor: new vscode.ThemeColor('charts.green'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  // 2. Novas Decorações: Pistas de Execução (Lanes)
  const cpuLaneDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(65, 105, 225, 0.4)', // Azul muito suave
  });

  const gpuLaneDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(50, 205, 50, 0.4)', // Verde muito suave
  });

  const transferLaneDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(255, 165, 0, 0.4)', // Laranja suave (alerta)
  });

  // 3. Nova Decoração: Fence (Barreira)
  const fenceDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: '0 0 2px 0', // Borda apenas embaixo
    borderColor: '#FF4500', // Vermelho alaranjado sólido
    borderStyle: 'solid',
    overviewRulerColor: '#FF4500',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

  const refresh = (document) => {
    if (!document || document.languageId !== 'tom') return;

    // Listas de ranges para aplicar as cores
    const budgetRanges = [];
    const cpuRanges = [];
    const gpuRanges = [];
    const transferRanges = [];
    const fenceRanges = [];

    const docDiagnostics = [];
    const systemNames = new Set();
    const systemLimits = new Map();
    const scopeStack = [];
    const scopeCosts = new Map();

    for (let index = 0; index < document.lineCount; index += 1) {
      const line = document.lineAt(index);
      const text = line.text.trim();
      if (!text) continue;

      // --- Lógica das Pistas (Visual) ---
      if (fenceRegex.test(text)) {
        fenceRanges.push(line.range);
      } else if (transferRegex.test(text)) {
        transferRanges.push(line.range);
      } else if (gpuRegex.test(text)) {
        gpuRanges.push(line.range);
      } else if (cpuRegex.test(text)) {
        cpuRanges.push(line.range);
      }

      // --- Lógica do Live Budget ---
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
        budgetRanges.push({
          range: line.range,
          hoverMessage: hover,
          renderOptions: {
            after: {
              contentText: '  ← Tom Budget',
              color: new vscode.ThemeColor('descriptionForeground'),
            },
          },
        });
      }
    }

    // Aplica as decorações
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
      editor.setDecorations(budgetDecoration, budgetRanges);
      editor.setDecorations(cpuLaneDecoration, cpuRanges);
      editor.setDecorations(gpuLaneDecoration, gpuRanges);
      editor.setDecorations(transferLaneDecoration, transferRanges);
      editor.setDecorations(fenceDecoration, fenceRanges);
    }

    diagnostics.set(document.uri, docDiagnostics);
  };

  const refreshActive = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) refresh(editor.document);
  };

  context.subscriptions.push(
    diagnostics,
    budgetDecoration,
    cpuLaneDecoration,
    gpuLaneDecoration,
    transferLaneDecoration,
    fenceDecoration,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode.window.onDidChangeVisibleTextEditors(refreshActive),
  );

  refreshActive();
}

function deactivate() { }

module.exports = { activate, deactivate };
