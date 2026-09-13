'use strict';
// Shared scalar/SOA emission. Control flow and resource ownership live in emitter.js.
const { fail } = require('./source');
const { literal, sameType } = require('./types');

class Emitter {
  constructor() {
    this.globals = [];
    this.allocations = [];
    this.body = [];
    this.declarations = new Set();
    this.symbols = new Map();
    this.strings = new Map();
    this.scopes = [];
    this.id = 0;
    this.lastNumeric = null;
    this.lastText = null;
  }

  fresh(prefix = 'v') { return `${prefix}${this.id++}`; }
  instruction(text) { this.body.push(`  ${text}`); }
  label(name) { this.body.push(`${name}:`); }
  value(expression) {
    const reg = `%${this.fresh()}`;
    this.instruction(`${reg} = ${expression}`);
    return reg;
  }
  allocate(type) {
    const ptr = `%${this.fresh('slot')}`;
    this.allocations.push(`  ${ptr} = alloca ${type}`);
    return ptr;
  }
  globalString(text) {
    if (this.strings.has(text)) return this.strings.get(text);
    const bytes = Buffer.from(text, 'utf8');
    const escaped = [...bytes].map(byte => `\\${byte.toString(16).padStart(2, '0').toUpperCase()}`).join('');
    const name = `@${this.fresh('text')}`;
    this.globals.push(`${name} = private unnamed_addr constant [${bytes.length + 1} x i8] c"${escaped}\\00"`);
    this.strings.set(text, name);
    return name;
  }
  print(text) {
    this.declarations.add('declare i32 @printf(ptr, ...)');
    this.instruction(`call i32 (ptr, ...) @printf(ptr ${this.globalString('%s')}, ptr ${this.globalString(text)})`);
  }
  lookup(name, location, kind) {
    const symbol = this.symbols.get(name);
    if (!symbol) fail('E_UNDEFINED', `'${name}' não foi definido neste escopo.`, location);
    if (kind && symbol.kind !== kind) fail('E_TYPE', `'${name}' não é ${kind}.`, location);
    return symbol;
  }
  define(name, value, location) {
    if (name === 'ULTIMO' || name === 'TomPerf_StressLevel') fail('E_NAME', `'${name}' é reservado.`, location);
    if (this.symbols.has(name)) fail('E_DUPLICATE', `'${name}' já foi definido.`, location);
    this.symbols.set(name, value);
  }

  arrayPointer(raw, location) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)@(@?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|-?\d+)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(raw);
    if (!match) return null;
    const array = this.lookup(match[1], location, 'array');
    const property = array.properties.get(match[3]);
    if (!property) fail('E_PROPERTY', `Propriedade '${match[3]}' não existe em '${match[1]}'.`, location);
    let index;
    if (match[2].startsWith('@')) {
      const variable = this.lookup(match[2].slice(1), location, 'numeric');
      if (variable.type.kind !== 'int') fail('E_TYPE', 'Índice SOA deve ser inteiro.', location);
      index = variable.constantValue ? variable.constantValue.value : this.value(`load ${variable.type.llvm}, ptr ${variable.ptr}`);
      if (variable.type.bits === 32) index = this.value(`${variable.type.signed ? 'sext' : 'zext'} i32 ${index} to i64`);
      const outside = this.value(`icmp uge i64 ${index}, ${array.count}`);
      this.guardFailure(outside, 'Índice SOA fora do limite.', location);
    } else {
      if (!/^-?\d+$/.test(match[2])) fail('E_INDEX', 'Índice SOA exige literal ou @variável.', location);
      const number = BigInt(match[2]);
      if (number < 0n || (typeof array.count === 'bigint' && number >= array.count)) fail('E_BOUNDS', 'Índice SOA fora do limite.', location);
      index = number.toString();
      if (typeof array.count !== 'bigint') this.guardFailure(this.value(`icmp uge i64 ${index}, ${array.count}`), 'Índice SOA fora do limite.', location);
    }
    const ptr = this.value(`getelementptr inbounds ${property.type.llvm}, ptr ${property.ptr}, i64 ${index}`);
    return { type: property.type, ptr, mutable: array.mutable };
  }

  operand(raw, type, location) {
    const array = this.arrayPointer(raw, location);
    if (array) {
      sameType(array.type, type, location);
      return { type, value: this.value(`load ${type.llvm}, ptr ${array.ptr}`) };
    }
    if (raw === '@ULTIMO') {
      if (!this.lastNumeric) fail('E_ULTIMO', '@ULTIMO sem resultado garantido neste bloco; use uma variável explícita.', location);
      sameType(this.lastNumeric.type, type, location);
      return this.lastNumeric;
    }
    if (raw.startsWith('@')) {
      const variable = this.lookup(raw.slice(1), location, 'numeric');
      sameType(variable.type, type, location);
      if (variable.constantValue) return variable.constantValue;
      return { type, value: this.value(`load ${type.llvm}, ptr ${variable.ptr}`) };
    }
    return literal(raw, type, location);
  }

  arithmetic(op, left, right, type, location) {
    if (type.kind === 'float') {
      const opcode = { Somar: 'fadd', Subtr: 'fsub', Multi: 'fmul', Divid: 'fdiv' }[op];
      return { type, value: this.value(`${opcode} ${type.llvm} ${left.value}, ${right.value}`) };
    }
    if (op === 'Divid' && right.constant === 0n) fail('E_DIVISION', 'Divisão inteira por zero.', location);
    if (left.constant !== undefined && right.constant !== undefined) {
      const a = left.constant;
      const b = right.constant;
      const result = { Somar: () => a + b, Subtr: () => a - b, Multi: () => a * b, Divid: () => a / b }[op]();
      if (result < type.min || result > type.max) fail('E_OVERFLOW', `Overflow em ${type.name}.`, location);
      return { type, value: result.toString(), constant: result };
    }
    if (op === 'Divid') {
      let invalid = this.value(`icmp eq ${type.llvm} ${right.value}, 0`);
      if (type.signed) {
        const minimum = this.value(`icmp eq ${type.llvm} ${left.value}, ${type.min}`);
        const minusOne = this.value(`icmp eq ${type.llvm} ${right.value}, -1`);
        const overflow = this.value(`and i1 ${minimum}, ${minusOne}`);
        invalid = this.value(`or i1 ${invalid}, ${overflow}`);
      }
      this.guardFailure(invalid, `Divisão inválida ou overflow em ${type.name}.`, location);
      return { type, value: this.value(`${type.signed ? 'sdiv' : 'udiv'} ${type.llvm} ${left.value}, ${right.value}`) };
    }
    const opcode = { Somar: 'add', Subtr: 'sub', Multi: 'mul' }[op];
    const intrinsic = `llvm.${type.signed ? 's' : 'u'}${opcode}.with.overflow.${type.llvm}`;
    this.declarations.add(`declare { ${type.llvm}, i1 } @${intrinsic}(${type.llvm}, ${type.llvm})`);
    const pair = this.value(`call { ${type.llvm}, i1 } @${intrinsic}(${type.llvm} ${left.value}, ${type.llvm} ${right.value})`);
    const result = this.value(`extractvalue { ${type.llvm}, i1 } ${pair}, 0`);
    const overflow = this.value(`extractvalue { ${type.llvm}, i1 } ${pair}, 1`);
    this.guardFailure(overflow, `Overflow em ${type.name}.`, location);
    return { type, value: result };
  }

  checkCapacity(text, rawCapacity, location) {
    const capacity = BigInt(rawCapacity);
    if (capacity <= 0n || BigInt(Buffer.byteLength(text, 'utf8')) + 1n > capacity) {
      fail('E_CAPACITY', `Texto excede a capacidade FB${capacity}, incluindo o terminador NUL.`, location);
    }
    return capacity;
  }

  emit(node) {
    const loc = node.location;
    switch (node.kind) {
      case 'scope': this.emitScope(node); break;
      case 'math': {
        const left = this.operand(node.left, node.type, loc);
        const right = this.operand(node.right, node.type, loc);
        this.lastNumeric = this.arithmetic(node.op, left, right, node.type, loc);
        break;
      }
      case 'textDeclare': this.define(node.name, { kind: 'text', text: node.text, capacity: null }, loc); break;
      case 'concat': {
        if (node.mode.startsWith('FB')) this.checkCapacity(node.text, node.mode.match(/\d+/)[0], loc);
        this.lastText = node.text;
        break;
      }
      case 'print': this.print(node.text); break;
      case 'struct': {
        if (!node.properties.length) fail('E_STRUCT', 'Struct SOA deve conter propriedades.', loc);
        this.define(node.name, { kind: 'struct', properties: node.properties }, loc);
        break;
      }
      case 'array': {
        const struct = this.lookup(node.struct, loc, 'struct');
        const count = BigInt(node.count);
        if (count <= 0n || count > 2147483647n) fail('E_RANGE', 'Quantidade SOA deve estar entre 1 e 2147483647.', loc);
        const properties = new Map();
        for (const prop of struct.properties) {
          // Calls cannot recurse and arrays cannot escape a function. Each declaration
          // has private storage, reset on every execution by emitter.js.
          const ptr = `@${this.fresh('soa')}`;
          this.globals.push(`${ptr} = private global [${count} x ${prop.type.llvm}] zeroinitializer`);
          properties.set(prop.name, { type: prop.type, ptr });
        }
        this.define(node.name, { kind: 'array', struct: node.struct, count, properties, mutable: true }, loc);
        break;
      }
      case 'get': {
        const target = this.arrayPointer(node.access, loc);
        this.lastNumeric = { type: target.type, value: this.value(`load ${target.type.llvm}, ptr ${target.ptr}`) };
        break;
      }
      case 'each': {
        const array = this.lookup(node.name, loc, 'array');
        if (array.mutable === false) fail('E_BORROW', 'SOA somente leitura.', loc);
        const candidates = [...array.properties].filter(([name]) => node.operation.startsWith(name) && /^-?\d+$/.test(node.operation.slice(name.length)));
        if (!candidates.length) fail('E_PROPERTY', 'ParaCadaSOA exige uma propriedade existente seguida de incremento inteiro.', loc);
        if (candidates.length > 1) fail('E_AMBIGUOUS', 'Propriedade e incremento ambíguos em ParaCadaSOA; use nomes de propriedades sem sufixos numéricos conflitantes.', loc);
        const [name, property] = candidates[0];
        if (property.type.kind !== 'int') fail('E_EXPERIMENTAL', 'ParaCadaSOA com float é experimental.', loc);
        const amount = literal(node.operation.slice(name.length), property.type, loc);
        const index = this.allocate('i64');
        this.instruction(`store i64 0, ptr ${index}`);
        const head = this.fresh('each');
        const body = this.fresh('element');
        const end = this.fresh('after_each');
        this.instruction(`br label %${head}`);
        this.label(head);
        const i = this.value(`load i64, ptr ${index}`);
        const condition = this.value(`icmp ult i64 ${i}, ${array.count}`);
        this.instruction(`br i1 ${condition}, label %${body}, label %${end}`);
        this.label(body);
        const ptr = this.value(`getelementptr inbounds ${property.type.llvm}, ptr ${property.ptr}, i64 ${i}`);
        const value = this.value(`load ${property.type.llvm}, ptr ${ptr}`);
        const added = this.arithmetic('Somar', { type: property.type, value }, amount, property.type, loc);
        this.instruction(`store ${property.type.llvm} ${added.value}, ptr ${ptr}`);
        const next = this.value(`add i64 ${i}, 1`);
        this.instruction(`store i64 ${next}, ptr ${index}`);
        this.instruction(`br label %${head}`);
        this.label(end);
        this.lastNumeric = null;
        break;
      }
      case 'vector': {
        if (node.left.length !== 4 || node.right.length !== 4) fail('E_VECTOR', 'Vec4 exige quatro elementos em cada operando.', loc);
        const values = node.left.map((raw, i) => this.arithmetic(node.op, literal(raw, node.type, loc), literal(node.right[i], node.type, loc), node.type, loc));
        // Constant folding retains exactly the same checked scalar semantics.
        const vector = values.map(value => `${node.type.llvm} ${value.value}`).join(', ');
        this.value(`add <4 x ${node.type.llvm}> <${vector}>, zeroinitializer`);
        break;
      }
      default: throw new Error(`Nó interno desconhecido: ${node.kind}`);
    }
  }

}

module.exports = { Emitter };
