'use strict';
const { fail, CompilationError } = require('./source');
const { typeOf } = require('./types');
function resolveTypes(ast, onError=null) {
  const types = new Map(), definitions = new Map(), active = new Set();
  const check=(fn,node)=>{try{return fn();}catch(error){if(!onError||!(error instanceof CompilationError))throw error;onError(error,node);return null;}};
  for (const node of ast.body.filter(x => ['enum', 'record'].includes(x.kind))) {
    check(()=>{if (definitions.has(node.name)) fail('E_DUPLICATE', `Tipo '${node.name}' duplicado.`, node.location);
      if (!node.properties.length) fail('E_TYPE', 'Tipo deve conter pelo menos um membro.', node.location);
      definitions.set(node.name, node);},node);
  }
  function resolve(type, loc) {
    if (!['enum', 'record'].includes(type.kind)) return type;
    const definition = definitions.get(type.nominal);
    if (!definition || definition.kind !== type.kind) fail('E_TYPE', `Tipo '${type.name}' não foi declarado.`, loc);
    if (active.has(type.name)) fail('E_TYPE_CYCLE', `Registro circular: ${type.name}.`, loc);
    if (types.has(type.name)) return types.get(type.name);
    active.add(type.name);
    try{const value = { ...type, properties: definition.properties.map(p => ({ ...p, type: p.type && resolve(p.type, p.location) })) };
      types.set(type.name, value); return value;}finally{active.delete(type.name);}
  }
  for (const node of definitions.values()) check(()=>resolve(typeOf(`${node.kind === 'enum' ? 'Enum' : 'Registro'}<${node.name}>`), node.location),node);
  function walk(node) {
    if (node.type) check(()=>{node.type = resolve(node.type, node.location);},node);
    if (node.kind === 'struct') for (const p of node.properties) {
      check(()=>{if (['decimal', 'record'].includes(p.type.kind)) fail('E_TYPE', 'SOA aceita inteiros, floats, Bl e enumerações.', p.location);},p);
    }
    if (node.result && node.result !== 'Vazio') check(()=>resolve(typeOf(node.result), node.location),node);
    for (const p of node.params || []) check(()=>{p.type = resolve(p.type, node.location);},node);
    for (const key of ['body', 'otherwise', 'handler', 'properties']) for (const child of node[key] || []) walk(child);
    if (node.child) walk(node.child);
  }
  walk(ast); return types;
}

module.exports={resolveTypes};
