'use strict';
// Filesystem boundary used by CLI/editor; compile() itself never reads files.
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('./parser');
const { resolve, normalize } = require('./modules');
const { CompilationError, fail } = require('./source');
const { compile } = require('./compiler');
function loadModules(source, file, read = name => fs.readFileSync(name)) {
  const modules = {}, visited = new Set();
  function visit(text, name) {
    const key = normalize(name); if (visited.has(key)) return; visited.add(key);
    for (const item of parse(text, name).body.filter(n => n.kind === 'import')) {
      const target = resolve(item.specifier, name, item.location);
      if (visited.has(target)) continue;
      const disk = target.startsWith('tom/') ? path.join(__dirname, '../stdlib', target.slice(4) + '.tom') : target;
      let bytes;
      try { bytes = read(disk); } catch { fail('E_IMPORT_MISSING', `Não foi possível ler '${target}'.`, item.location); }
      try { modules[target] = typeof bytes === 'string' ? bytes : new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { fail('E_ENCODING', `O módulo '${target}' não é UTF-8 válido.`, item.location); }
      visit(modules[target], target);
    }
  }
  visit(source, file); return modules;
}
function compileResolved(source, options = {}, read) {
  try { return compile(source, { ...options, modules: loadModules(source, options.file || '<input>', read) }); }
  catch (error) {
    if (!(error instanceof CompilationError)) throw error;
    return { success: false, diagnostics: [error.diagnostic], artifacts: {} };
  }
}
module.exports = { loadModules, compileResolved };
