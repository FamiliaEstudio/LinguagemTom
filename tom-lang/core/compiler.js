'use strict';
const { CompilationError, fail } = require('./source');
const { parse } = require('./parser');

const { emitProgram } = require('./emitter');

function compile(source, { file = '<input>', target = 'llvm' } = {}) {
  try {
    if (target !== 'llvm') fail('E_EXPERIMENTAL', `Backend '${target}' não está disponível no núcleo estável.`, { file, line: 1, column: 1 });
    const ast = parse(source, file);
    return { success: true, diagnostics: [], artifacts: emitProgram(ast) };
  } catch (error) {
    if (!(error instanceof CompilationError)) throw error;
    return { success: false, diagnostics: [error.diagnostic], artifacts: {} };
  }
}

module.exports = { compile };
