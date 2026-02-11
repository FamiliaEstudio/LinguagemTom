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

function renderTomIrNode(node, printer) {
  if (node.kind === 'TomIR.AffineFor') {
    printer.block(`affine.for ${node.iv} = ${node.lowerBound} to ${node.upperBound} step ${node.step}`, () => {
      for (const child of node.body) {
        renderTomIrNode(child, printer);
      }
    });
    return;
  }

  if (node.kind === 'TomIR.SoaAddScalar') {
    const loadReg = '%loaded';
    const sumReg = '%sum';
    const cstReg = '%addcst';
    printer.line(`${cstReg} = arith.constant ${node.amount} : ${node.elementType}`);
    printer.line(`${loadReg} = affine.load ${node.bufferArg}[${node.indexVar}] : memref<?x${node.elementType}>`);
    printer.line(`${sumReg} = arith.addi ${loadReg}, ${cstReg} : ${node.elementType}`);
    printer.line(`affine.store ${sumReg}, ${node.bufferArg}[${node.indexVar}] : memref<?x${node.elementType}>`);
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

    this.printer.block(`func.func @${fnNode.name}(${args})`, () => {
      for (const node of fnNode.body || []) {
        renderTomIrNode(node, this.printer);
      }
      this.printer.line('return');
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
