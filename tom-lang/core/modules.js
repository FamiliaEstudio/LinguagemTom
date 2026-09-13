'use strict';
const path = require('node:path').posix;
const { parse } = require('./parser');
const { fail } = require('./source');
const normalize = file => path.normalize(file.replace(/\\/g, '/'));
function resolve(specifier, importer, location) {
  if (specifier.startsWith('tom/')) {
    if (!/^tom\/[A-Za-z_][A-Za-z0-9_]*$/.test(specifier)) fail('E_IMPORT', 'Módulo padrão inválido.', location);
    return specifier;
  }
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('E_IMPORT', 'Importação exige caminho relativo ou tom/nome.', location);
  return normalize(path.join(path.dirname(normalize(importer)), specifier));
}
function expand(source, file, modules = {}) {
  const sources = new Map(Object.entries(modules).map(([key, value]) => [normalize(key), value]));
  const active = new Set(), done = new Set(), body = [], imported = [];
  function visit(text, name, isRoot, location) {
    const key = normalize(name);
    if (active.has(key)) fail('E_IMPORT_CYCLE', `Ciclo de importação: ${name}.`, location);
    if (done.has(key)) return;
    active.add(key);
    const ast = parse(text, name);
    for (const node of ast.body) {
      if (node.kind === 'import') {
        const target = resolve(node.specifier, name, node.location);
        if (active.has(target)) fail('E_IMPORT_CYCLE', `Ciclo de importação: ${target}.`, node.location);
        if (!sources.has(target)) fail('E_IMPORT_MISSING', `Fonte do módulo '${target}' não foi fornecido.`, node.location);
        visit(sources.get(target), target, false, node.location);
      } else {
        if (!isRoot && !['function', 'constant', 'struct', 'enum', 'record'].includes(node.kind)) fail('E_MODULE_INIT', 'Módulos só podem declarar funções, constantes e tipos.', node.location);
        body.push(node);
      }
    }
    active.delete(key); done.add(key);
    if (!isRoot) imported.push(key);
  }
  visit(source, file, true, { file, line: 1, column: 1 });
  return { kind: 'program', body, imported };
}
module.exports = { expand, resolve, normalize };
