'use strict';
const { CompilationError, fail } = require('./source');
const { expand } = require('./modules');

const { emitProgram } = require('./emitter');
const { checkProgram } = require('./semantic');

function compile(source, { file = '<input>', target = 'llvm', modules = {} } = {}) {
  try {
    if (target !== 'llvm') fail('E_EXPERIMENTAL', `Backend '${target}' não está disponível no núcleo estável.`, { file, line: 1, column: 1 });
    const ast = expand(source, file, modules);
    const semantic = checkProgram(ast);
    const artifacts = emitProgram(ast, null, semantic);
    artifacts.assetRequirements = ast.imported.includes('tom/musica') ? ['tom/Bravura.otf', 'tom/Bravura.LICENSE'] : [];
    if(ast.imported.includes('tom/grafos'))artifacts.assetRequirements.push('tom/DejaVuSansMono.ttf','tom/DejaVuSansMono.LICENSE');
    return { success: true, diagnostics: [], artifacts };
  } catch (error) {
    if (!(error instanceof CompilationError)) throw error;
    return { success: false, diagnostics: [error.diagnostic], artifacts: {} };
  }
}

module.exports = { compile, analyze: (...args) => require('./analysis').analyze(...args), analyzeProject: (...args) => require('./project-analysis').analyzeProject(...args) };
