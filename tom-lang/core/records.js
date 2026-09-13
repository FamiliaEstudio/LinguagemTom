'use strict';
const { fail } = require('./source');
const { typeOf, sameType } = require('./types');
const { Emitter: ScalarEmitter } = require('./scalar-emitter');

function resolveTypes(ast) {
  const types = new Map(), definitions = new Map(), active = new Set();
  for (const node of ast.body.filter(x => ['enum', 'record'].includes(x.kind))) {
    if (definitions.has(node.name)) fail('E_DUPLICATE', `Tipo '${node.name}' duplicado.`, node.location);
    if (!node.properties.length) fail('E_TYPE', 'Tipo deve conter pelo menos um membro.', node.location);
    definitions.set(node.name, node);
  }
  function resolve(type, loc) {
    if (!['enum', 'record'].includes(type.kind)) return type;
    const definition = definitions.get(type.nominal);
    if (!definition || definition.kind !== type.kind) fail('E_TYPE', `Tipo '${type.name}' não foi declarado.`, loc);
    if (active.has(type.name)) fail('E_TYPE_CYCLE', `Registro circular: ${type.name}.`, loc);
    if (types.has(type.name)) return types.get(type.name);
    active.add(type.name);
    const value = { ...type, properties: definition.properties.map(p => ({ ...p, type: p.type && resolve(p.type, p.location) })) };
    active.delete(type.name); types.set(type.name, value); return value;
  }
  for (const node of definitions.values()) resolve(typeOf(`${node.kind === 'enum' ? 'Enum' : 'Registro'}<${node.name}>`), node.location);
  function walk(node) {
    if (node.type) node.type = resolve(node.type, node.location);
    if (node.kind === 'struct') for (const p of node.properties) {
      if (['decimal', 'record'].includes(p.type.kind)) fail('E_TYPE', 'SOA aceita inteiros, floats, Bl e enumerações.', p.location);
    }
    if (node.result && node.result !== 'Vazio') resolve(typeOf(node.result), node.location);
    for (const p of node.params || []) p.type = resolve(p.type, node.location);
    for (const key of ['body', 'otherwise', 'handler', 'properties']) for (const child of node[key] || []) walk(child);
    if (node.child) walk(node.child);
  }
  walk(ast); return types;
}

const methods = {
  resolved(name) { return this.module.types.get(name) || typeOf(name); },
  lookup(name, loc, kind) {
    if (!name.includes('.') || this.symbols.has(name)) return ScalarEmitter.prototype.lookup.call(this, name, loc, kind);
    const [root, ...fields] = name.split('.');
    let symbol = ScalarEmitter.prototype.lookup.call(this, root, loc);
    for (const field of fields) {
      if (symbol.type?.kind !== 'record') fail('E_TYPE', `'${root}' não contém campos de registro.`, loc);
      const type = this.resolved(symbol.type.name), index = type.properties.findIndex(p => p.name === field);
      if (index < 0) fail('E_PROPERTY', `Campo '${field}' não existe em ${type.name}.`, loc);
      symbol = { kind: 'numeric', type: type.properties[index].type, mutable: symbol.mutable, immutable: symbol.immutable,
        ptr: this.value(`getelementptr ${type.storage}, ptr ${symbol.ptr}, i32 0, i32 ${index}`) };
    }
    if (kind && symbol.kind !== kind) fail('E_TYPE', `'${name}' não é ${kind}.`, loc);
    return symbol;
  },
  recordLeaves(type, pointer, entry = false) {
    const result = [];
    this.resolved(type.name).properties.forEach((field, index) => {
      const expression = `getelementptr ${type.storage}, ptr ${pointer}, i32 0, i32 ${index}`;
      let target;
      if (entry) { target = `%${this.fresh()}`; this.allocations.push(`  ${target} = ${expression}`); }
      else target = this.value(expression);
      if (field.type.kind === 'record') result.push(...this.recordLeaves(field.type, target, entry));
      else result.push({ type: field.type, ptr: target });
    });
    return result;
  },
  recordOwned(type) {
    const slot = this.allocate(type.storage);
    for (const leaf of this.recordLeaves(type, slot, true)) if (leaf.type.kind === 'decimal') this.scopes.at(-1).owned.push({ ptr: leaf.ptr, type: 'Dc34' });
    return slot;
  },
  recordDefault(type, loc) {
    const slot = this.recordOwned(type);
    this.instruction(`store ${type.storage} zeroinitializer, ptr ${slot}`);
    for (const leaf of this.recordLeaves(type, slot)) if (leaf.type.kind === 'decimal') {
      this.native('tom_decimal_parse', [{ type: 'ptr', value: this.globalString('0') }, { type: 'ptr', value: leaf.ptr }], loc, 'decimal');
    }
    return { type, value: slot };
  },
  recordCopy(source, destination, type, loc) {
    // Prepare every managed field before publishing. Even self/overlapping copies
    // have value semantics and leave the destination intact on failure.
    const scratch = this.recordOwned(type), from = this.recordLeaves(type, source), into = this.recordLeaves(type, scratch);
    from.forEach((field, i) => {
      const value = this.value(`load ${field.type.llvm}, ptr ${field.ptr}`);
      if (field.type.kind === 'decimal') this.copyDecimal(value, into[i].ptr, loc);
      else this.instruction(`store ${field.type.llvm} ${value}, ptr ${into[i].ptr}`);
    });
    for (const field of this.recordLeaves(type, destination)) if (field.type.kind === 'decimal') {
      this.declarations.add('declare void @tom_decimal_free(ptr)');
      this.instruction(`call void @tom_decimal_free(ptr ${this.handle(field.ptr)})`);
    }
    const value = this.value(`load ${type.storage}, ptr ${scratch}`);
    this.instruction(`store ${type.storage} ${value}, ptr ${destination}`);
    for (const field of into) if (field.type.kind === 'decimal') this.instruction(`store ptr null, ptr ${field.ptr}`);
  },
  recordArgument(raw, type, loc, mutable) {
    if (mutable) {
      if (!raw.startsWith('@') || raw === '@ULTIMO') fail('E_BORROW', 'RefRegistro exige variável explícita.', loc);
      const symbol = this.lookup(raw.slice(1), loc, 'numeric');
      sameType(symbol.type, type, loc);
      if (symbol.immutable || symbol.mutable === false) fail('E_BORROW', 'Registro somente leitura.', loc);
      return { type: 'ptr', value: symbol.ptr };
    }
    return { type: 'ptr', value: this.operand(raw, type, loc).value };
  },
  forLoop(node) {
    const loc = node.location, type = typeOf('InSd64');
    const values = node.array ? [ { value: '0', constant: 0n }, { value: String(this.lookup(node.array, loc, 'array').count) }, { value: '1', constant: 1n } ]
      : node.args.map(raw => this.operand(raw, type, loc));
    if (values[2].constant === 0n) fail('E_LOOP_STEP', 'Passo de Para não pode ser zero.', loc);
    if (values[2].constant === undefined) {
      this.native('tom_require', [{ type: 'i32', value: this.value(`zext i1 ${this.value(`icmp ne i64 ${values[2].value}, 0`)} to i32`) }], loc, 'math');
    }
    const wide = values.map(x => this.value(`sext i64 ${x.value} to i128`)), slot = this.allocate('i128'), visible = this.allocate('i64');
    this.instruction(`store i128 ${wide[0]}, ptr ${slot}`);
    const head = this.fresh('for'), body = this.fresh('iteration'), increment = this.fresh('increment'), end = this.fresh('after_for'), breakId = ++this.module.id;
    this.branch(head); this.label(head);
    const current = this.value(`load i128, ptr ${slot}`), positive = this.value(`icmp sgt i128 ${wide[2]}, 0`);
    const lower = this.value(`icmp slt i128 ${current}, ${wide[1]}`), higher = this.value(`icmp sgt i128 ${current}, ${wide[1]}`);
    const condition = this.value(`select i1 ${positive}, i1 ${lower}, i1 ${higher}`);
    this.instruction(`br i1 ${condition}, label %${body}, label %${end}`); this.label(body);
    this.instruction(`store i64 ${this.value(`trunc i128 ${current} to i64`)}, ptr ${visible}`);
    this.block(node.body, { end: increment, noEndLabel: true, loop: true, breakId, extraRoutes: [[breakId, end]], initialize: () => {
      this.define(node.name, { kind: 'numeric', type, ptr: visible, immutable: true }, loc);
    } });
    this.label(increment);
    this.instruction(`store i128 ${this.value(`add i128 ${current}, ${wide[2]}`)}, ptr ${slot}`);
    this.branch(head); this.label(end); this.invalidate();
  },
};
module.exports = { resolveTypes, methods };
