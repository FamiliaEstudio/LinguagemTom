'use strict';
const { CompilationError, fail } = require('./source');
const { expand } = require('./modules');

const { emitProgram } = require('./emitter');

function compile(source, { file = '<input>', target = 'llvm', modules = {} } = {}) {
  try {
    if (target !== 'llvm') fail('E_EXPERIMENTAL', `Backend '${target}' não está disponível no núcleo estável.`, { file, line: 1, column: 1 });
    const ast = expand(source, file, modules);
    const artifacts = emitProgram(ast);
    artifacts.assetRequirements = ast.imported.includes('tom/musica') ? ['tom/Bravura.otf', 'tom/Bravura.LICENSE'] : [];
    return { success: true, diagnostics: [], artifacts };
  } catch (error) {
    if (!(error instanceof CompilationError)) throw error;
    return { success: false, diagnostics: [error.diagnostic], artifacts: {} };
  }
}

module.exports = { compile };
