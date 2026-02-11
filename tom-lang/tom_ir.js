class TomIrNode {
  constructor(kind) {
    this.kind = kind;
  }
}

class TomIrModule extends TomIrNode {
  constructor({ name, functions = [] }) {
    super('TomIR.Module');
    this.name = name;
    this.functions = functions;
  }
}

class TomIrFunction extends TomIrNode {
  constructor({ name, args = [], body = [] }) {
    super('TomIR.Function');
    this.name = name;
    this.args = args;
    this.body = body;
  }
}

class TomIrAffineFor extends TomIrNode {
  constructor({ iv, lowerBound = 0, upperBound, step = 1, body = [] }) {
    super('TomIR.AffineFor');
    this.iv = iv;
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.step = step;
    this.body = body;
  }
}

class TomIrSoaAddScalar extends TomIrNode {
  constructor({ bufferArg, indexVar, amount, elementType = 'i32' }) {
    super('TomIR.SoaAddScalar');
    this.bufferArg = bufferArg;
    this.indexVar = indexVar;
    this.amount = amount;
    this.elementType = elementType;
  }
}

function sanitizeSymbol(value) {
  return String(value || 'anon').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
}

function buildParaCadaSoaTomIr({ instanceName, propertyName, count, amount, elementType = 'i32' }) {
  const symbol = `paracadasoa_${sanitizeSymbol(instanceName)}_${sanitizeSymbol(propertyName)}`;
  const bufferArg = `%${sanitizeSymbol(propertyName)}_buffer`;
  const countArg = '%n';
  const loopIv = '%i';

  return new TomIrModule({
    name: symbol,
    functions: [
      new TomIrFunction({
        name: symbol,
        args: [
          { name: bufferArg, type: `memref<?x${elementType}>` },
          { name: countArg, type: 'index', staticValue: count },
        ],
        body: [
          new TomIrAffineFor({
            iv: loopIv,
            lowerBound: 0,
            upperBound: countArg,
            step: 1,
            body: [new TomIrSoaAddScalar({ bufferArg, indexVar: loopIv, amount, elementType })],
          }),
        ],
      }),
    ],
  });
}

function renderTomIrNodeAsMlir(node, indent = '  ') {
  if (node.kind === 'TomIR.AffineFor') {
    const body = node.body.map((child) => renderTomIrNodeAsMlir(child, `${indent}  `)).join('\n');
    return `${indent}affine.for ${node.iv} = ${node.lowerBound} to ${node.upperBound} step ${node.step} {\n${body}\n${indent}}`;
  }

  if (node.kind === 'TomIR.SoaAddScalar') {
    const loadReg = '%loaded';
    const sumReg = '%sum';
    const cstReg = '%addcst';
    return [
      `${indent}${cstReg} = arith.constant ${node.amount} : ${node.elementType}`,
      `${indent}${loadReg} = affine.load ${node.bufferArg}[${node.indexVar}] : memref<?x${node.elementType}>`,
      `${indent}${sumReg} = arith.addi ${loadReg}, ${cstReg} : ${node.elementType}`,
      `${indent}affine.store ${sumReg}, ${node.bufferArg}[${node.indexVar}] : memref<?x${node.elementType}>`,
    ].join('\n');
  }

  return `${indent}// nó TomIR não suportado: ${node.kind}`;
}

function renderTomIrModuleAsMlir(moduleNode) {
  const functionBlocks = moduleNode.functions.map((fn) => {
    const args = fn.args.map((arg) => `${arg.name}: ${arg.type}`).join(', ');
    const body = fn.body.map((node) => renderTomIrNodeAsMlir(node, '    ')).join('\n');
    return `  func.func @${fn.name}(${args}) {\n${body}\n    return\n  }`;
  }).join('\n');

  return `module {\n${functionBlocks}\n}`;
}

module.exports = {
  TomIrModule,
  TomIrFunction,
  TomIrAffineFor,
  TomIrSoaAddScalar,
  buildParaCadaSoaTomIr,
  renderTomIrModuleAsMlir,
};
