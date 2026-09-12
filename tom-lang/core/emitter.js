'use strict';
const { Emitter: ScalarEmitter } = require('./scalar-emitter');
const { fail, decodeString } = require('./source');
const { typeOf, sameType, literal } = require('./types');
const decimal = require('./decimal');
const { builtins } = require('./builtins');
const integerInput = require('./input-ir');
const arg = (type, value) => ({ type, value });
const ptr = value => arg('ptr', value);
const returns = body => body.some(node => node.kind === 'return' || node.kind === 'rethrow' ||
  (node.kind === 'if' && returns(node.body) && returns(node.otherwise)) ||
  (node.kind === 'try' && returns(node.body) && returns(node.handler)) ||
  (node.kind === 'scope' && !node.body.some(x => x.kind === 'guard') && returns(node.body)));

class Emitter extends ScalarEmitter {
  constructor(module, fn = null) {
    super(); this.module = module; this.fn = fn;
    this.globals = module.globals; this.strings = module.strings; this.declarations = module.declarations;
    this.err = fn ? '%error' : this.allocate('%TomError');
    this.flow = this.allocate('i32'); this.returnSlot = fn && fn.result !== 'Vazio' ? '%out' : null;
    this.terminated = false; this.cleanupNext = null; this.errorBindings = [];
  }
  fresh(prefix = 'v') { return `${prefix}${this.module ? ++this.module.id : ++this.id}`; }
  branch(label) { this.instruction(`br label %${label}`); this.terminated = true; }
  label(name) { super.label(name); this.terminated = false; }
  invalidate() { this.lastNumeric = null; this.lastText = null; }
  errorField(index, pointer = this.err) { return this.value(`getelementptr %TomError, ptr ${pointer}, i32 0, i32 ${index}`); }
  errorCode() { return this.value(`load i32, ptr ${this.err}`); }
  errorSet(code, reason, loc) {
    this.instruction(`store i32 ${code}, ptr ${this.err}`);
    this.instruction(`store ptr ${reason}, ptr ${this.errorField(1)}`);
    this.instruction(`store ptr ${this.globalString(loc.file)}, ptr ${this.errorField(2)}`);
    this.instruction(`store i32 ${loc.line}, ptr ${this.errorField(3)}`);
    this.instruction(`store i32 ${loc.column}, ptr ${this.errorField(4)}`);
  }
  errorBranch() { this.branch(this.cleanupNext || this.scopes.at(-1).cleanup); }
  guardFailure(condition, reason, loc) {
    const bad = this.fresh('error'), good = this.fresh('checked');
    this.instruction(`br i1 ${condition}, label %${bad}, label %${good}`); this.label(bad);
    this.errorSet(/[Dd]ivis/.test(reason) ? 2 : /[ÍI]ndice/.test(reason) ? 6 : /Entrada/.test(reason) ? 4 : 1, this.globalString(reason), loc);
    this.errorBranch(); this.label(good);
  }
  native(name, args, loc, lib) {
    if (lib) this.module.requirements.add(lib);
    this.declarations.add(`declare i32 @${name}(${args.map(x => x.type).join(', ')})`);
    const status = this.value(`call i32 @${name}(${args.map(x => `${x.type} ${x.value}`).join(', ')})`);
    this.declarations.add('declare ptr @tom_error_message(i32)');
    const bad = this.fresh('native_error'), good = this.fresh('native_ok');
    const failed = this.value(`icmp ne i32 ${status}, 0`);
    this.instruction(`br i1 ${failed}, label %${bad}, label %${good}`); this.label(bad);
    this.errorSet(status, this.value(`call ptr @tom_error_message(i32 ${status})`), loc);
    this.errorBranch(); this.label(good);
  }
  owned(type) { const pointer = this.allocate('ptr'); this.scopes.at(-1).owned.push({ ptr: pointer, type }); return pointer; }
  handle(slot) { return this.value(`load ptr, ptr ${slot}`); }
  decimalConstant(value, loc) {
    const slot = this.owned('Dc34');
    this.native('tom_decimal_parse', [ptr(this.globalString(decimal.canonical(value))), ptr(slot)], loc, 'decimal');
    return { type: typeOf('Dc34'), value: this.handle(slot), constant: value };
  }
  operand(raw, type, loc) {
    if (type.kind === 'decimal' && !raw.startsWith('@')) return this.decimalConstant(literal(raw, type, loc).constant, loc);
    return super.operand(raw, type, loc);
  }
  arithmetic(op, a, b, type, loc) {
    if (type.kind !== 'decimal') return super.arithmetic(op, a, b, type, loc);
    if (a.constant && b.constant) return this.decimalConstant(decimal.calculate(op, a.constant, b.constant, loc), loc);
    const slot = this.owned('Dc34');
    this.native('tom_decimal_math', [arg('i32', { Somar: 0, Subtr: 1, Multi: 2, Divid: 3 }[op]), ptr(a.value), ptr(b.value), ptr(slot)], loc, 'decimal');
    return { type, value: this.handle(slot) };
  }
  copyDecimal(value, slot, loc) { this.native('tom_decimal_copy', [ptr(value), ptr(slot)], loc, 'decimal'); }
  emitScope(node) { this.block(node.body); }
  exit(id) { this.instruction(`store i32 ${id}, ptr ${this.flow}`); this.branch(this.scopes.at(-1).cleanup); }
  block(body, options = {}) {
    const previousSymbols = this.symbols; this.symbols = new Map(previousSymbols);
    const frame = { cleanup: this.fresh('cleanup'), end: options.end || this.fresh('after_block'), id: ++this.module.id, owned: [], defers: new Map(), ...options };
    this.scopes.push(frame); this.invalidate(); const initAt = this.body.length;
    for (const item of body) if (item.kind === 'defer') frame.defers.set(item, { flag: this.allocate('i1') });
    if (options.initialize) options.initialize();
    for (const item of body) {
      if (this.terminated) fail('E_UNREACHABLE', 'Comando após saída incondicional do bloco.', item.location);
      this.emit(item);
    }
    if (!this.terminated) {
      if (options.functionRoot && this.fn && this.fn.result !== 'Vazio' && !returns(body)) fail('E_RETURN', `Função '${this.fn.name}' pode terminar sem retornar.`, this.fn.location);
      this.exit(frame.id);
    }
    this.label(frame.cleanup); this.cleanup(frame);
    const outer = this.scopes.at(-2), normal = this.fresh('dispatch');
    const failed = this.value(`icmp ne i32 ${this.errorCode()}, 0`);
    this.instruction(`br i1 ${failed}, label %${frame.catchLabel || (outer ? outer.cleanup : frame.failure)}, label %${normal}`);
    this.label(normal);
    const destination = this.value(`load i32, ptr ${this.flow}`);
    const cases = [[frame.id, frame.end], ...(frame.extraRoutes || [])];
    this.instruction(`switch i32 ${destination}, label %${outer ? outer.cleanup : frame.end} [${cases.map(([id, label]) => ` i32 ${id}, label %${label}`).join('')} ]`);
    this.body.splice(initAt, 0, ...[...frame.defers.values()].map(x => `  store i1 false, ptr ${x.flag}`), ...frame.owned.map(x => `  store ptr null, ptr ${x.ptr}`));
    this.scopes.pop(); this.symbols = previousSymbols; this.invalidate();
    if (!options.noEndLabel) this.label(frame.end);
    return frame;
  }
  cleanup(frame) {
    const previousSymbols = this.symbols;
    for (const [item, registration] of [...frame.defers].reverse()) {
      const run = this.fresh('defer'), next = this.fresh('defer_next'), merged = this.fresh('defer_merge');
      const saved = this.allocate('%TomError'), active = this.value(`load i1, ptr ${registration.flag}`);
      this.instruction(`br i1 ${active}, label %${run}, label %${next}`); this.label(run);
      this.instruction(`store i1 false, ptr ${registration.flag}`);
      this.instruction(`store %TomError ${this.value(`load %TomError, ptr ${this.err}`)}, ptr ${saved}`);
      this.instruction(`store %TomError zeroinitializer, ptr ${this.err}`);
      this.symbols = registration.symbols;
      const oldNext = this.cleanupNext; this.cleanupNext = merged; this.invalidate(); this.emit(item.child); this.cleanupNext = oldNext;
      if (!this.terminated) this.branch(merged);
      this.label(merged);
      const original = this.value(`load %TomError, ptr ${saved}`), oldCode = this.value(`extractvalue %TomError ${original}, 0`);
      const hadError = this.value(`icmp ne i32 ${oldCode}, 0`), restore = this.fresh('restore'), keep = this.fresh('keep');
      this.instruction(`br i1 ${hadError}, label %${restore}, label %${keep}`); this.label(restore);
      this.instruction(`store %TomError ${original}, ptr ${this.err}`); this.branch(keep); this.label(keep); this.branch(next); this.label(next);
    }
    this.symbols = previousSymbols;
    for (const resource of [...frame.owned].reverse()) {
      const name = resource.type === 'Dc34' ? 'tom_decimal_free' : resource.type === 'buffer' ? 'tom_text_free' : { Janela: 'tom_window_free', Fonte: 'tom_font_free', Evento: 'tom_event_free' }[resource.type];
      this.declarations.add(`declare void @${name}(ptr)`);
      this.instruction(`call void @${name}(ptr ${this.handle(resource.ptr)})`); this.instruction(`store ptr null, ptr ${resource.ptr}`);
    }
  }
  textOperand(raw, loc) {
    const match = /^l'((?:\\.|[^'\\])*)'$/.exec(raw);
    if (match) return this.globalString(decodeString(match[1], loc));
    if (raw === '@ULTIMO' && this.lastText !== null) return typeof this.lastText === 'string' ? this.globalString(this.lastText) : this.lastText.value;
    const symbol = this.lookup(raw.replace(/^@/, ''), loc);
    if (symbol.kind === 'text') return this.globalString(symbol.text);
    if (symbol.kind === 'textview') return symbol.value;
    if (symbol.kind !== 'buffer') fail('E_TYPE', 'Esperado texto ou buffer.', loc);
    this.declarations.add('declare ptr @tom_text_data(ptr)');
    return this.value(`call ptr @tom_text_data(ptr ${this.handle(symbol.ptr)})`);
  }
  printPointer(pointer) {
    this.declarations.add('declare i32 @printf(ptr, ...)');
    this.instruction(`call i32 (ptr, ...) @printf(ptr ${this.globalString('%s')}, ptr ${pointer})`);
  }
  argument(raw, expected, loc, mutable = false) {
    if (expected === 'Txt') return ptr(this.textOperand(raw, loc));
    if (/^(?:Ref)?(?:Buffer|Janela|Fonte|Evento)$/.test(expected) || /^FB\d+C$/.test(expected)) {
      if (!raw.startsWith('@')) fail('E_ARGUMENT', 'Recurso exige @nome.', loc);
      const symbol = this.lookup(raw.slice(1), loc), buffer = expected.includes('Buffer') || expected.startsWith('FB');
      if (buffer ? symbol.kind !== 'buffer' : symbol.type?.name !== expected.replace(/^Ref/, '')) fail('E_TYPE', `Esperado ${expected}.`, loc);
      if (expected.startsWith('FB') && symbol.type.name !== expected) fail('E_TYPE', `Esperado ${expected}.`, loc);
      if ((mutable || expected.startsWith('Ref')) && symbol.mutable === false) fail('E_BORROW', 'Parâmetro somente leitura; declare Ref para alterá-lo.', loc);
      return ptr(this.handle(symbol.ptr));
    }
    const type = typeOf(expected); return arg(type.llvm, this.operand(raw, type, loc).value);
  }
  builtin(node, createdName) {
    const descriptor = builtins[node.name];
    if (node.args.length !== descriptor.args.length) fail('E_ARGUMENT', `${node.name} exige ${descriptor.args.length} argumentos.`, node.location);
    if (['Janela', 'Fonte', 'Evento'].includes(descriptor.result) && !createdName) fail('E_RESOURCE', 'Use DefRecurso para receber um recurso.', node.location);
    const args = node.args.map((raw, i) => this.argument(raw, descriptor.args[i], node.location)); let slot;
    if (descriptor.result !== 'Vazio') {
      const type = typeOf(descriptor.result);
      slot = ['decimal', 'resource'].includes(type.kind) ? this.owned(descriptor.result) : this.allocate(type.kind === 'bool' ? 'i32' : type.llvm);
      args.push(ptr(slot));
    }
    this.native(descriptor.c, args, node.location, descriptor.lib);
    if (createdName) this.define(createdName, { kind: 'resource', type: typeOf(descriptor.result), ptr: slot, mutable: true }, node.location);
    else if (slot) {
      const type = typeOf(descriptor.result); let value = this.value(`load ${type.kind === 'bool' ? 'i32' : type.llvm}, ptr ${slot}`);
      if (type.kind === 'bool') value = this.value(`icmp ne i32 ${value}, 0`);
      this.lastNumeric = { type, value };
    }
  }
  emit(node) {
    const loc = node.location;
    switch (node.kind) {
      case 'function': return;
      case 'if': {
        const condition = this.operand(node.condition, typeOf('Bl'), loc).value;
        const yes = this.fresh('then'), no = this.fresh('else'), end = this.fresh('after_if');
        this.instruction(`br i1 ${condition}, label %${yes}, label %${no}`);
        this.label(yes); this.block(node.body, { end, noEndLabel: true });
        this.label(no); this.block(node.otherwise, { end, noEndLabel: true });
        this.label(end); this.invalidate(); return;
      }
      case 'while': {
        const head = this.fresh('while'), body = this.fresh('iteration'), end = this.fresh('after_while'), breakId = ++this.module.id;
        this.branch(head); this.label(head); this.invalidate();
        const condition = this.operand(node.condition, typeOf('Bl'), loc).value;
        this.instruction(`br i1 ${condition}, label %${body}, label %${end}`); this.label(body);
        this.block(node.body, { end: head, noEndLabel: true, loop: true, breakId, extraRoutes: [[breakId, end]] });
        this.label(end); this.invalidate(); return;
      }
      case 'break': case 'continue': {
        const loop = [...this.scopes].reverse().find(x => x.loop);
        if (!loop) fail('E_LOOP', 'Comando exige Enquanto.', loc);
        this.exit(node.kind === 'break' ? loop.breakId : loop.id); return;
      }
      case 'try': {
        const capture = this.fresh('catch'), end = this.fresh('after_try');
        this.block(node.body, { catchLabel: capture, end, noEndLabel: true }); this.label(capture);
        const saved = this.allocate('%TomError');
        this.instruction(`store %TomError ${this.value(`load %TomError, ptr ${this.err}`)}, ptr ${saved}`);
        this.instruction(`store %TomError zeroinitializer, ptr ${this.err}`);
        this.block(node.handler, { end, noEndLabel: true, initialize: () => {
          this.define(node.errorName, { kind: 'error', ptr: saved }, loc); this.errorBindings.push(saved);
        } });
        this.errorBindings.pop(); this.label(end); this.invalidate(); return;
      }
      case 'rethrow': {
        if (!this.errorBindings.length) fail('E_CATCH', 'Relancar exige Capturar.', loc);
        this.instruction(`store %TomError ${this.value(`load %TomError, ptr ${this.errorBindings.at(-1)}`)}, ptr ${this.err}`);
        this.errorBranch(); return;
      }
      case 'errorField': {
        const symbol = this.lookup(node.name, loc, 'error'), index = { Codigo: 0, Mensagem: 1, Arquivo: 2, Linha: 3, Coluna: 4 }[node.field];
        const pointer = index === 1 || index === 2, value = this.value(`load ${pointer ? 'ptr' : 'i32'}, ptr ${this.errorField(index, symbol.ptr)}`);
        if (pointer) this.lastText = { value }; else this.lastNumeric = { type: typeOf('InSd32'), value }; return;
      }
      case 'guard': {
        if (this.scopes.length === 1) fail('E_SCOPE', 'SeMaior exige um escopo explícito.', loc);
        const a = this.operand(node.left, node.type, loc), b = this.operand(node.right, node.type, loc);
        const condition = this.value(`icmp ${node.type.signed ? 'sgt' : 'ugt'} ${node.type.llvm} ${a.value}, ${b.value}`);
        const next = this.fresh('guard'), leave = this.fresh('guard_exit');
        this.instruction(`br i1 ${condition}, label %${next}, label %${leave}`);
        this.label(leave); this.exit(this.scopes.at(-1).id); this.label(next); this.invalidate(); return;
      }
      case 'defer': {
        if (this.scopes.length === 1 && !this.fn) fail('E_DEFER', 'Defer exige um escopo.', loc);
        const registration = this.scopes.at(-1).defers.get(node); registration.symbols = new Map(this.symbols);
        this.instruction(`store i1 true, ptr ${registration.flag}`); return;
      }
      case 'compare': {
        const a = this.operand(node.left, node.type, loc), b = this.operand(node.right, node.type, loc);
        const predicate = { Igual: 'eq', Diferente: 'ne', Menor: 'lt', MenorIgual: 'le', Maior: 'gt', MaiorIgual: 'ge' }[node.op]; let expression;
        if (node.type.kind === 'decimal') {
          const slot = this.allocate('i32');
          this.native('tom_decimal_compare', [ptr(a.value), ptr(b.value), ptr(slot)], loc, 'decimal');
          expression = `icmp ${['eq', 'ne'].includes(predicate) ? predicate : 's' + predicate} i32 ${this.value(`load i32, ptr ${slot}`)}, 0`;
        } else if (node.type.kind === 'float') expression = `fcmp ${predicate === 'ne' ? 'une' : 'o' + predicate} ${node.type.llvm} ${a.value}, ${b.value}`;
        else expression = `icmp ${['eq', 'ne'].includes(predicate) ? predicate : (node.type.signed ? 's' : 'u') + predicate} ${node.type.llvm} ${a.value}, ${b.value}`;
        this.lastNumeric = { type: typeOf('Bl'), value: this.value(expression) }; return;
      }
      case 'boolean': {
        const a = this.operand(node.left, typeOf('Bl'), loc).value, b = node.op === 'Nao' ? 'true' : this.operand(node.right, typeOf('Bl'), loc).value;
        this.lastNumeric = { type: typeOf('Bl'), value: this.value(`${{ Nao: 'xor', E: 'and', Ou: 'or' }[node.op]} i1 ${a}, ${b}`) }; return;
      }
      case 'declare': {
        const value = this.operand(node.operand, node.type, loc), slot = node.type.kind === 'decimal' ? this.owned('Dc34') : this.allocate(node.type.llvm);
        this.define(node.name, { kind: 'numeric', type: node.type, ptr: slot }, loc);
        if (node.type.kind === 'decimal') this.copyDecimal(value.value, slot, loc);
        else this.instruction(`store ${node.type.llvm} ${value.value}, ptr ${slot}`); return;
      }
      case 'set': {
        const value = this.operand(node.operand, node.type, loc), target = this.arrayPointer(node.name, loc) || this.lookup(node.name, loc, 'numeric');
        sameType(target.type, node.type, loc);
        if (node.type.kind === 'decimal') this.copyDecimal(value.value, target.ptr, loc);
        else this.instruction(`store ${node.type.llvm} ${value.value}, ptr ${target.ptr}`);
        this.lastNumeric = value; return;
      }
      case 'bufferDeclare': {
        this.checkCapacity(node.text, node.capacity, loc);
        if (BigInt(node.capacity) > 0x7fffffffn) fail('E_CAPACITY', 'Buffer excede a capacidade suportada de 2147483647 bytes.', loc);
        const slot = this.owned('buffer');
        this.define(node.name, { kind: 'buffer', type: typeOf(`FB${node.capacity}C`), ptr: slot, mutable: true }, loc);
        this.native('tom_text_new', [arg('i64', node.capacity), ptr(this.globalString(node.text)), ptr(slot)], loc, 'text');
        this.lastText = { value: this.textOperand('@' + node.name, loc) }; return;
      }
      case 'bufferAppend': {
        const symbol = this.lookup(node.name, loc, 'buffer');
        if (symbol.type.capacity !== BigInt(node.capacity)) fail('E_CAPACITY', 'Capacidade diferente da declaração do buffer.', loc);
        if (symbol.mutable === false) fail('E_BORROW', 'Buffer somente leitura.', loc);
        this.native('tom_text_append', [ptr(this.handle(symbol.ptr)), ptr(this.globalString(node.text))], loc, 'text');
        this.lastText = { value: this.textOperand('@' + node.name, loc) }; return;
      }
      case 'textSet': case 'textAppend': {
        if (this.scopes.length > 1 || this.fn) fail('E_TEXT_FLOW', 'Texto estático só pode ser alterado no nível superior; use FBnC em execução.', loc);
        const old = this.lookup(node.name, loc, 'text');
        this.symbols.set(node.name, { ...old, text: node.kind === 'textSet' ? node.text : old.text + node.text }); return;
      }
      case 'printName': this.printPointer(this.textOperand('@' + node.name, loc)); return;
      case 'printLast':
        if (this.lastText === null) fail('E_ULTIMO', 'GerarTxtUltimo sem texto garantido.', loc);
        this.printPointer(typeof this.lastText === 'string' ? this.globalString(this.lastText) : this.lastText.value); return;
      case 'builtin': this.builtin(node); return;
      case 'resource': this.builtin({ ...node, name: node.builtin }, node.name); return;
      case 'call': {
        const fn = this.module.functions.get(node.name);
        if (!fn) fail('E_FUNCTION', `Função '${node.name}' não existe.`, loc);
        if (node.args.length !== fn.params.length) fail('E_ARGUMENT', `Função '${node.name}' exige ${fn.params.length} argumentos.`, loc);
        const args = [ptr(this.err)]; let slot, type;
        if (fn.result !== 'Vazio') { type = typeOf(fn.result); slot = type.kind === 'decimal' ? this.owned('Dc34') : this.allocate(type.llvm); args.push(ptr(slot)); }
        args.push(...node.args.map((raw, i) => this.argument(raw, fn.params[i].type.name, loc, fn.params[i].mutable)));
        this.instruction(`call void @tom_fn_${node.name}(${args.map(x => `${x.type} ${x.value}`).join(', ')})`);
        const bad = this.fresh('call_error'), good = this.fresh('call_ok'), failed = this.value(`icmp ne i32 ${this.errorCode()}, 0`);
        this.instruction(`br i1 ${failed}, label %${bad}, label %${good}`); this.label(bad); this.errorBranch(); this.label(good); this.invalidate();
        if (slot) this.lastNumeric = { type, value: this.value(`load ${type.llvm}, ptr ${slot}`) }; return;
      }
      case 'return': {
        if (!this.fn) fail('E_RETURN', 'Retornar exige função.', loc);
        if (this.fn.result === 'Vazio') { if (node.operand) fail('E_RETURN', 'Função Vazio não retorna valor.', loc); }
        else {
          if (!node.operand) fail('E_RETURN', 'Retorno exige valor.', loc);
          const type = typeOf(this.fn.result), value = this.operand(node.operand, type, loc);
          if (type.kind === 'decimal') this.copyDecimal(value.value, this.returnSlot, loc);
          else this.instruction(`store ${type.llvm} ${value.value}, ptr ${this.returnSlot}`);
        }
        this.exit(this.scopes[0].id); return;
      }
      case 'read': {
        const target = this.lookup(node.name, loc, 'numeric'); sameType(target.type, node.type, loc);
        this.module.needsInput = true; this.declarations.add('declare i32 @getchar()');
        const ok = this.allocate('i1'), read = this.value(`call i64 @tom_read_integer(i64 ${node.type.max}, i64 ${-node.type.min}, ptr ${ok})`);
        const bad = this.value(`xor i1 ${this.value(`load i1, ptr ${ok}`)}, true`);
        this.guardFailure(bad, `Entrada inválida ou fora da faixa de ${node.type.name}.`, loc);
        this.instruction(`store ${node.type.llvm} ${node.type.bits === 32 ? this.value(`trunc i64 ${read} to i32`) : read}, ptr ${target.ptr}`); return;
      }
      case 'array': {
        super.emit(node); const array = this.lookup(node.name, loc, 'array');
        this.declarations.add('declare void @llvm.memset.p0.i64(ptr, i8, i64, i1)');
        for (const property of array.properties.values()) this.instruction(`call void @llvm.memset.p0.i64(ptr ${property.ptr}, i8 0, i64 ${array.count * BigInt(property.type.bits / 8)}, i1 false)`);
        return;
      }
      default: super.emit(node);
    }
  }
  renderFunction(body) {
    const failure = this.fresh('failed'), success = this.fresh('success');
    if (!this.fn) this.instruction(`store %TomError zeroinitializer, ptr ${this.err}`);
    this.instruction(`store i32 0, ptr ${this.flow}`);
    this.block(body, { functionRoot: true, failure, end: success, noEndLabel: true, initialize: () => {
      if (!this.fn) return;
      this.fn.params.forEach((param, index) => {
        const incoming = `%arg${index}`;
        if (param.type.kind === 'textview') this.define(param.name, { kind: 'textview', value: incoming }, this.fn.location);
        else {
          const slot = param.type.kind === 'decimal' ? this.owned('Dc34') : this.allocate(param.type.llvm);
          if (param.type.kind === 'decimal') this.copyDecimal(incoming, slot, this.fn.location);
          else this.instruction(`store ${param.type.llvm} ${incoming}, ptr ${slot}`);
          const kind = param.type.kind === 'buffer' ? 'buffer' : param.type.kind === 'resource' ? 'resource' : 'numeric';
          this.define(param.name, { kind, type: param.type, ptr: slot, mutable: param.mutable }, this.fn.location);
        }
      });
    } });
    this.label(success); this.instruction(this.fn ? 'ret void' : 'ret i32 0'); this.label(failure);
    if (this.fn) this.instruction('ret void');
    else {
      this.declarations.add('declare i32 @printf(ptr, ...)');
      const fields = [1, 2, 3, 4].map(index => this.value(`load ${index < 3 ? 'ptr' : 'i32'}, ptr ${this.errorField(index)}`));
      this.instruction(`call i32 (ptr, ...) @printf(ptr ${this.globalString('%s:%d:%d: erro: %s\n')}, ptr ${fields[1]}, i32 ${fields[2]}, i32 ${fields[3]}, ptr ${fields[0]})`);
      this.instruction('ret i32 1');
    }
    const params = this.fn ? ['ptr %error', ...(this.returnSlot ? ['ptr %out'] : []), ...this.fn.params.map((p, i) => `${p.type.llvm} %arg${i}`)].join(', ') : '';
    return `define ${this.fn ? 'void @tom_fn_' + this.fn.name : 'i32 @main'}(${params}) {\nentry:\n${this.allocations.join('\n')}\n${this.body.join('\n')}\n}\n`;
  }
}

function emitProgram(ast) {
  const module = { globals: [], strings: new Map(), declarations: new Set(), requirements: new Set(), functions: new Map(), id: 0, needsInput: false };
  for (const fn of ast.body.filter(x => x.kind === 'function')) {
    if (module.functions.has(fn.name)) fail('E_DUPLICATE', `Função '${fn.name}' duplicada.`, fn.location);
    module.functions.set(fn.name, fn);
  }
  const calls = node => [...(node.kind === 'call' ? [node] : []), ...(node.child ? calls(node.child) : []), ...['body', 'otherwise', 'handler'].flatMap(key => (node[key] || []).flatMap(calls))];
  const visited = new Set(), active = new Set();
  function visit(fn) {
    if (active.has(fn.name)) fail('E_RECURSION', 'Recursão não é suportada.', fn.location);
    if (visited.has(fn.name)) return;
    active.add(fn.name);
    for (const call of calls(fn)) {
      const child = module.functions.get(call.name);
      if (!child) fail('E_FUNCTION', `Função '${call.name}' não existe.`, call.location);
      visit(child);
    }
    active.delete(fn.name); visited.add(fn.name);
  }
  for (const fn of module.functions.values()) visit(fn);
  const functions = [...module.functions.values()].map(fn => new Emitter(module, fn).renderFunction(fn.body));
  functions.push(new Emitter(module).renderFunction(ast.body.filter(x => x.kind !== 'function')));
  let helpers = '';
  if (module.needsInput) helpers = integerInput.replace(/%message/g, '%valid_out')
    .replace('  ret i64 %value', '  store i1 true, ptr %valid_out\n  ret i64 %value')
    .replace('  call void @tom_fail(ptr %valid_out)\n  unreachable', '  store i1 false, ptr %valid_out\n  ret i64 0');
  return { llvm: ['%TomError = type { i32, ptr, ptr, i32, i32 }', ...module.globals, ...module.declarations, ...functions, helpers].join('\n') + '\n', runtimeRequirements: [...module.requirements].sort() };
}
module.exports = { emitProgram };
