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

const {
  renderTomIrModuleAsMlir,
} = require('./tom_to_mlir');

module.exports = {
  TomIrModule,
  TomIrFunction,
  TomIrAffineFor,
  TomIrSoaAddScalar,
  buildParaCadaSoaTomIr,
  renderTomIrModuleAsMlir,
};
