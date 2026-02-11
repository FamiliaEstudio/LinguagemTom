class MLIRPrinter {
  constructor({ indentUnit = '  ' } = {}) {
    this.indentUnit = indentUnit;
    this.indentLevel = 0;
    this.lines = [];
  }

  line(text = '') {
    this.lines.push(`${this.indentUnit.repeat(this.indentLevel)}${text}`);
  }

  block(header, emitBody) {
    this.line(`${header} {`);
    this.indentLevel += 1;
    emitBody();
    this.indentLevel = Math.max(0, this.indentLevel - 1);
    this.line('}');
  }

  toString() {
    return this.lines.join('\n');
  }
}

function traduzirTipo(tomType) {
  if (!tomType) return 'none';

  const rawType = typeof tomType === 'string'
    ? tomType.trim()
    : String(tomType.type || tomType.name || '').trim();

  const builtinTypeMap = {
    In32: 'i32',
    Fl32: 'f32',
    Vec4: 'vector<4xf32>',
    Texto: '!llvm.ptr<i8>',
    i32: 'i32',
    f32: 'f32',
    index: 'index',
  };

  if (builtinTypeMap[rawType]) {
    return builtinTypeMap[rawType];
  }

  const fixedArrayMatch = rawType.match(/^\[(.+);\s*(\d+)\]$/);
  if (fixedArrayMatch) {
    const [, elementTypeRaw, lengthRaw] = fixedArrayMatch;
    const elementType = traduzirTipo(elementTypeRaw.trim());
    return `memref<${lengthRaw}x${elementType}>`;
  }

  return rawType || 'none';
}

function inferTypeFromValue(value, fallback = 'i32') {
  if (fallback === 'index') {
    return 'index';
  }

  if (value && typeof value === 'object' && value.type) {
    return traduzirTipo(value.type);
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'i32' : 'f32';
  }

  if (typeof value === 'string' && value.includes('.')) {
    return 'f32';
  }

  return traduzirTipo(fallback);
}

class FunctionLoweringContext {
  constructor({ fnNode, printer }) {
    this.fnNode = fnNode;
    this.printer = printer;
    this.nextValueId = 0;
    this.nextStackId = 0;
    this.symbolTable = new Map();
  }

  freshValue(prefix = 'v') {
    const reg = `%${prefix}${this.nextValueId}`;
    this.nextValueId += 1;
    return reg;
  }

  freshStack(prefix = 'slot') {
    const reg = `%${prefix}${this.nextStackId}`;
    this.nextStackId += 1;
    return reg;
  }

  normalizeName(name) {
    return String(name || '').replace(/^%/, '');
  }

  ensureLocal(name, type) {
    const key = this.normalizeName(name);
    if (this.symbolTable.has(key)) {
      return this.symbolTable.get(key);
    }

    const stackReg = this.freshStack(key || 'slot');
    this.printer.line(`${stackReg} = memref.alloca() : memref<1x${type}>`);
    const entry = { kind: 'stack', stackReg, type };
    this.symbolTable.set(key, entry);
    return entry;
  }

  bindArgument(arg) {
    const argName = this.normalizeName(arg.name);
    const type = traduzirTipo(arg.type);
    const stackReg = this.freshStack(`${argName}_slot`);
    this.printer.line(`${stackReg} = memref.alloca() : memref<1x${type}>`);
    this.printer.line(`memref.store %${argName}, ${stackReg}[0] : memref<1x${type}>`);
    this.symbolTable.set(argName, { kind: 'stack', stackReg, type });
  }

  loadSymbol(name) {
    const key = this.normalizeName(name);
    const entry = this.symbolTable.get(key);
    if (!entry) {
      return null;
    }

    const loaded = this.freshValue(key || 'load');
    this.printer.line(`${loaded} = memref.load ${entry.stackReg}[0] : memref<1x${entry.type}>`);
    return { reg: loaded, type: entry.type };
  }

  storeSymbol(name, sourceReg, type) {
    const entry = this.ensureLocal(name, type);
    this.printer.line(`memref.store ${sourceReg}, ${entry.stackReg}[0] : memref<1x${entry.type}>`);
  }

  emitBinaryOp(op, lhs, rhs, type) {
    const arithmeticType = type || lhs.type || rhs.type || 'i32';
    const opMap = {
      '+': { i32: 'arith.addi', f32: 'arith.addf' },
      '-': { i32: 'arith.subi', f32: 'arith.subf' },
      '*': { i32: 'arith.muli', f32: 'arith.mulf' },
      '/': { i32: 'arith.divsi', f32: 'arith.divf' },
      '<': { i32: 'arith.cmpi slt', f32: 'arith.cmpf olt' },
      '<=': { i32: 'arith.cmpi sle', f32: 'arith.cmpf ole' },
      '>': { i32: 'arith.cmpi sgt', f32: 'arith.cmpf ogt' },
      '>=': { i32: 'arith.cmpi sge', f32: 'arith.cmpf oge' },
      '==': { i32: 'arith.cmpi eq', f32: 'arith.cmpf oeq' },
      '!=': { i32: 'arith.cmpi ne', f32: 'arith.cmpf one' },
    };

    const family = opMap[op];
    if (!family) {
      this.printer.line(`// operador não suportado: ${op}`);
      return { reg: lhs.reg, type: arithmeticType };
    }

    const mlirOp = family[arithmeticType] || family.i32;
    const result = this.freshValue('tmp');
    const isComparison = ['<', '<=', '>', '>=', '==', '!='].includes(op);
    this.printer.line(`${result} = ${mlirOp} ${lhs.reg}, ${rhs.reg} : ${arithmeticType}`);
    return { reg: result, type: isComparison ? 'i1' : arithmeticType };
  }

  emitValue(value, expectedType = null) {
    if (value && typeof value === 'object' && value.kind === 'TomIR.BinaryOp') {
      const binaryType = traduzirTipo(value.type || 'i32');
      const lhs = this.emitValue(value.left, binaryType);
      const rhs = this.emitValue(value.right, binaryType);
      return this.emitBinaryOp(value.op, lhs, rhs, binaryType);
    }

    if (typeof value === 'number') {
      const type = inferTypeFromValue(value, expectedType || 'i32');
      const cst = this.freshValue('cst');
      this.printer.line(`${cst} = arith.constant ${value} : ${type}`);
      return { reg: cst, type };
    }

    if (typeof value === 'string') {
      const normalized = this.normalizeName(value);
      const loaded = this.loadSymbol(normalized);
      if (loaded) {
        return loaded;
      }

      if (normalized.match(/^-?\d+(\.\d+)?$/)) {
        const numeric = Number(normalized);
        const type = inferTypeFromValue(numeric, expectedType || 'i32');
        const cst = this.freshValue('cst');
        this.printer.line(`${cst} = arith.constant ${normalized} : ${type}`);
        return { reg: cst, type };
      }

      return { reg: `%${normalized}`, type: traduzirTipo(expectedType || 'i32') };
    }

    const fallbackType = traduzirTipo(expectedType || 'i32');
    const zero = this.freshValue('cst');
    this.printer.line(`${zero} = arith.constant 0 : ${fallbackType}`);
    return { reg: zero, type: fallbackType };
  }
}

function resolveLoopBound(bound, ctx) {
  if (typeof bound === 'number') {
    return { kind: 'constant', value: bound };
  }

  if (typeof bound === 'string') {
    const trimmed = bound.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return { kind: 'constant', value: Number(trimmed) };
    }

    if (trimmed.startsWith('%')) {
      return { kind: 'symbol', value: trimmed };
    }

    return { kind: 'symbol', value: `%${trimmed}` };
  }

  if (bound && typeof bound === 'object' && bound.kind === 'TomIR.BinaryOp') {
    const lowered = ctx.emitValue(bound);
    return { kind: 'dynamic', value: lowered.reg, type: lowered.type };
  }

  const fallback = ctx.emitValue(bound, 'index');
  return { kind: 'dynamic', value: fallback.reg, type: fallback.type };
}

function isAffineBound(boundInfo) {
  return boundInfo.kind === 'constant' || boundInfo.kind === 'symbol';
}

function renderTomIrNode(node, ctx) {
  const { printer } = ctx;

  if (node.kind === 'TomIR.AffineFor') {
    printer.block(`affine.for ${node.iv} = ${node.lowerBound} to ${node.upperBound} step ${node.step}`, () => {
      for (const child of node.body) {
        renderTomIrNode(child, ctx);
      }
      printer.line('affine.yield');
    });
    return;
  }

  if (node.kind === 'TomIR.ScfFor') {
    const lower = resolveLoopBound(node.lowerBound, ctx);
    const upper = resolveLoopBound(node.upperBound, ctx);
    const step = resolveLoopBound(node.step, ctx);

    const canBeAffine = isAffineBound(lower) && isAffineBound(upper) && step.kind === 'constant';
    if (canBeAffine) {
      printer.block(`affine.for ${node.iv} = ${lower.value} to ${upper.value} step ${step.value}`, () => {
        for (const child of node.body || []) {
          renderTomIrNode(child, ctx);
        }
        printer.line('affine.yield');
      });
      return;
    }

    const lowerReg = lower.kind === 'dynamic' ? lower.value : (lower.kind === 'symbol' ? lower.value : ctx.emitValue(lower.value, 'index').reg);
    const upperReg = upper.kind === 'dynamic' ? upper.value : (upper.kind === 'symbol' ? upper.value : ctx.emitValue(upper.value, 'index').reg);
    const stepReg = step.kind === 'dynamic' ? step.value : (step.kind === 'symbol' ? step.value : ctx.emitValue(step.value, 'index').reg);

    printer.block(`scf.for ${node.iv} = ${lowerReg} to ${upperReg} step ${stepReg}`, () => {
      for (const child of node.body || []) {
        renderTomIrNode(child, ctx);
      }
      printer.line('scf.yield');
    });
    return;
  }

  if (node.kind === 'TomIR.If') {
    const cond = ctx.emitValue(node.condition);
    const hasElse = node.elseBody && node.elseBody.length > 0;

    printer.line(`scf.if ${cond.reg} {`);
    printer.indentLevel += 1;
    for (const child of node.thenBody || []) {
      renderTomIrNode(child, ctx);
    }
    printer.line('scf.yield');
    printer.indentLevel = Math.max(0, printer.indentLevel - 1);

    if (hasElse) {
      printer.line('} else {');
      printer.indentLevel += 1;
      for (const child of node.elseBody) {
        renderTomIrNode(child, ctx);
      }
      printer.line('scf.yield');
      printer.indentLevel = Math.max(0, printer.indentLevel - 1);
    }

    printer.line('}');
    return;
  }

  if (node.kind === 'TomIR.SoaAddScalar') {
    const loadReg = '%loaded';
    const sumReg = '%sum';
    const cstReg = '%addcst';
    printer.line(`${cstReg} = arith.constant ${node.amount} : ${node.elementType}`);
    printer.line(`${loadReg} = affine.load ${node.bufferArg}[${node.indexVar}] : memref<?x${node.elementType}>`);
    const addOp = node.elementType === 'f32' ? 'arith.addf' : 'arith.addi';
    printer.line(`${sumReg} = ${addOp} ${loadReg}, ${cstReg} : ${node.elementType}`);
    printer.line(`affine.store ${sumReg}, ${node.bufferArg}[${node.indexVar}] : memref<?x${node.elementType}>`);
    return;
  }

  if (node.kind === 'TomIR.LocalVar') {
    const type = traduzirTipo(node.type);
    const entry = ctx.ensureLocal(node.name, type);
    if (node.initialValue !== null && node.initialValue !== undefined) {
      const init = ctx.emitValue(node.initialValue, type);
      printer.line(`memref.store ${init.reg}, ${entry.stackReg}[0] : memref<1x${type}>`);
    }
    return;
  }

  if (node.kind === 'TomIR.Assign') {
    const type = traduzirTipo(node.type || inferTypeFromValue(node.value));
    const value = ctx.emitValue(node.value, type);
    ctx.storeSymbol(node.target, value.reg, type);
    return;
  }

  if (node.kind === 'TomIR.Return') {
    if (node.value === null || node.value === undefined) {
      printer.line('return');
      return;
    }

    const returnType = traduzirTipo(node.type || ctx.fnNode.returnType || 'i32');
    const returnValue = ctx.emitValue(node.value, returnType);
    printer.line(`return ${returnValue.reg} : ${returnType}`);
    return;
  }

  printer.line(`// nó TomIR não suportado: ${node.kind}`);
}

class TomToMLIR {
  constructor({ printer = new MLIRPrinter() } = {}) {
    this.printer = printer;
  }

  emitModule(moduleNode) {
    this.printer.block('module', () => {
      for (const fn of moduleNode.functions || []) {
        this.emitFunction(fn);
      }
    });
    return this.printer.toString();
  }

  emitFunction(fnNode) {
    const args = (fnNode.args || [])
      .map((arg) => `${arg.name}: ${traduzirTipo(arg.type)}`)
      .join(', ');

    const returnType = fnNode.returnType ? traduzirTipo(fnNode.returnType) : null;
    const signature = returnType
      ? `func.func @${fnNode.name}(${args}) -> ${returnType}`
      : `func.func @${fnNode.name}(${args})`;

    this.printer.block(signature, () => {
      const ctx = new FunctionLoweringContext({ fnNode, printer: this.printer });
      for (const arg of fnNode.args || []) {
        ctx.bindArgument(arg);
      }

      let hasExplicitReturn = false;
      for (const node of fnNode.body || []) {
        renderTomIrNode(node, ctx);
        if (node.kind === 'TomIR.Return') {
          hasExplicitReturn = true;
        }
      }

      if (!hasExplicitReturn) {
        this.printer.line('return');
      }
    });
  }
}

function renderTomIrModuleAsMlir(moduleNode) {
  const lowering = new TomToMLIR();
  return lowering.emitModule(moduleNode);
}

module.exports = {
  MLIRPrinter,
  TomToMLIR,
  traduzirTipo,
  renderTomIrModuleAsMlir,
};
