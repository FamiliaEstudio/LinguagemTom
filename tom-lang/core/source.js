'use strict';

class CompilationError extends Error {
  constructor(code, message, location) {
    super(message);
    this.diagnostic = { code, message, severity: 'error', ...location };
  }
}

function fail(code, message, location) {
  throw new CompilationError(code, message, location);
}

// Scan once: comments and command separators never inspect literal contents.
function readSource(source, file = '<input>') {
  const statements = [];
  const rows = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  rows.forEach((row, index) => {
    let quoted = false;
    let escaped = false;
    let end = row.length;
    for (let i = 0; i < row.length; i += 1) {
      const ch = row[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === "'") quoted = false;
      } else if (ch === "'" && row[i - 1] === 'l') {
        quoted = true;
      } else if (ch === '/' && row[i + 1] === '/') {
        end = i;
        break;
      }
    }
    const column = row.search(/\S/) + 1 || 1;
    const location = { file, line: index + 1, column };
    if (quoted) fail('E_STRING', 'Literal de texto sem fechamento.', location);
    const text = row.slice(0, end).trim();
    if (text) statements.push({ text, location });
  });
  return statements;
}

function decodeString(raw, location) {
  const escapes = { n: '\n', r: '\r', t: '\t', "'": "'", '\\': '\\' };
  const value = raw.replace(/\\([\s\S])/g, (_, ch) => {
    if (!(ch in escapes)) fail('E_ESCAPE', `Escape não suportado: \\${ch}.`, location);
    return escapes[ch];
  });
  if (value.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    fail('E_STRING', 'Texto deve conter UTF-8 válido, sem byte NUL.', location);
  }
  return value;
}

module.exports = { CompilationError, fail, readSource, decodeString };
