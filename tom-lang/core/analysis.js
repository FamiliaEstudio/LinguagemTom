'use strict';
// Version-one adapter over the shared semantic project model.
const { command } = require('./parser');
const { readSource, CompilationError } = require('./source');
const { normalize } = require('./modules');
const { builtins } = require('./builtins');
const key = location => `${normalize(location.file)}:${location.line}`;
const opening = new Set(['function', 'if', 'while', 'for', 'scope', 'try', 'struct', 'record', 'enum']);
const closing = new Set(['endFunction', 'endIf', 'endWhile', 'endFor', 'endScope', 'endTry', 'endStruct']);

function instructions(source, file) {
  const result = [], stack = [];
  source.split(/\r?\n/).forEach((row, index) => {
    let statement, node;
    try {
      statement = readSource(row, file)[0];
      if (!statement) return;
      statement.location.line = index + 1;
      node = command(statement);
    } catch (error) {
      if (!(error instanceof CompilationError)) throw error;
      result.push({ id: key({ file, line: index + 1 }), kind: 'incomplete', text: row.trim(),
        location: { file, line: index + 1, column: row.search(/\S/) + 1 || 1 },
        end: { line: index + 1, column: row.length + 1 }, owner: stack.find(x => x.kind === 'function')?.name || null,
        recognized: false, diagnostic: { ...error.diagnostic, line: index + 1 } });
      return;
    }
    const owner = node.kind === 'function' ? node.name : stack.find(x => x.kind === 'function')?.name || null;
    const item = { id: key(node.location), kind: node.kind, text: statement.text,
      location: node.location, end: { line: index + 1, column: node.location.column + statement.text.length }, owner,
      block: stack.at(-1)?.id || null, recognized: true };
    item.command = ({function:'DefFuncao',endFunction:'FimFuncao',declare:'DefVar',set:'SetVar',bufferDeclare:'DefStk',call:'Chamar',return:'Retornar',if:'Se',else:'Senao',endIf:'FimSe',while:'Enquanto',endWhile:'FimEnquanto',continue:'Continuar',try:'Tentar',catch:'Capturar',endTry:'FimTentar',resource:'DefRecurso',print:'GerarTxt',printLast:'GerarTxt'})[node.kind] || node.builtin || node.name || node.op || node.kind;
    if(node.kind==='compare')item.command='Comparar'+node.op;
    if(node.kind==='printName')item.command='GerarTxt';
    for (const field of ['name', 'op', 'operand', 'left', 'right', 'condition', 'args', 'builtin', 'field', 'capacity', 'count', 'struct', 'specifier']) {
      if (node[field] !== undefined) item[field] = node[field];
    }
    if (node.text !== undefined) item.literal = node.text;
    if (node.type) item.type = node.type.name;
    if (node.kind === 'function') {
      item.params = node.params.map(p => ({ name: p.name, type: p.type.name, mutable: p.mutable }));
      item.result = node.result;
    }
    if (node.kind === 'builtin' || node.kind === 'resource') {
      const descriptor = builtins[node.builtin || node.name];
      item.parameters = descriptor.args; item.result = descriptor.result;
    }
    if (closing.has(node.kind)) {
      const expected = { endFunction: ['function'], endIf: ['if'], endWhile: ['while'], endFor: ['for'], endScope: ['scope'], endTry: ['try'], endStruct: ['struct','record','enum'] }[node.kind];
      if (expected.includes(stack.at(-1)?.kind)) item.opens = stack.pop().id;
    }
    result.push(item);
    if (opening.has(node.kind)) stack.push({ ...item });
  });
  return result;
}

function analyze(source, { file = '<input>', modules = {} } = {}) {
  const project = require('./project-analysis').analyzeProject({file,source,modules});
  const nodes = instructions(source,file);
  for(const [name,text] of Object.entries(modules))nodes.push(...instructions(text,normalize(name)));
  const ids = new Map(project.instructions.map(n=>[n.id,key(n.location)]));
  const symbols = project.symbols.map(s=>({...s,id:`${key(s.location)}:${s.name}`,kind:s.kind==='variable'?'numeric':s.kind}));
  const symbolIds = new Map(project.symbols.map((s,i)=>[s.id,symbols[i].id]));
  // Keep v1 line-based links; analyzeProject owns the stable graph contract.
  return {version:1,success:project.success,diagnostics:project.diagnostics,instructions:nodes,symbols,
    references:project.references.map(r=>({...r,instruction:ids.get(r.instruction),target:symbolIds.get(r.target)||null})),
    calls:project.calls.filter(c=>!c.target?.startsWith('native:')).map(c=>({...c,instruction:ids.get(c.instruction),target:ids.get(c.target)||null})),
    lastResults:project.lastResults.map(r=>({...r,instruction:ids.get(r.instruction),producer:ids.get(r.producer)||null}))};
}
module.exports = { analyze, instructions };
