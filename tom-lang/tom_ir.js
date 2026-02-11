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
  constructor({ name, args = [], returnType = null, body = [] }) {
    super('TomIR.Function');
    this.name = name;
    this.args = args;
    this.returnType = returnType;
    this.body = body;
  }
}

class TomIrLocalVar extends TomIrNode {
  constructor({ name, type, initialValue = null }) {
    super('TomIR.LocalVar');
    this.name = name;
    this.type = type;
    this.initialValue = initialValue;
  }
}

class TomIrAssign extends TomIrNode {
  constructor({ target, value, type = null }) {
    super('TomIR.Assign');
    this.target = target;
    this.value = value;
    this.type = type;
  }
}

class TomIrBinaryOp extends TomIrNode {
  constructor({ op, left, right, type = null }) {
    super('TomIR.BinaryOp');
    this.op = op;
    this.left = left;
    this.right = right;
    this.type = type;
  }
}

class TomIrReturn extends TomIrNode {
  constructor({ value = null, type = null }) {
    super('TomIR.Return');
    this.value = value;
    this.type = type;
  }
}

class TomIrIf extends TomIrNode {
  constructor({ condition, thenBody = [], elseBody = [] }) {
    super('TomIR.If');
    this.condition = condition;
    this.thenBody = thenBody;
    this.elseBody = elseBody;
  }
}

class TomIrScfFor extends TomIrNode {
  constructor({ iv, lowerBound = 0, upperBound, step = 1, body = [] }) {
    super('TomIR.ScfFor');
    this.iv = iv;
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.step = step;
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

class TomIrParaCadaSoaLowering extends TomIrNode {
  constructor({ bufferArg, countArg, amount, elementType = 'f32', vectorWidth = 4 }) {
    super('TomIR.ParaCadaSoaLowering');
    this.bufferArg = bufferArg;
    this.countArg = countArg;
    this.amount = amount;
    this.elementType = elementType;
    this.vectorWidth = vectorWidth;
  }
}

function sanitizeSymbol(value) {
  return String(value || 'anon').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
}

function buildParaCadaSoaTomIr({ instanceName, propertyName, count, amount, elementType = 'i32' }) {
  const symbol = `paracadasoa_${sanitizeSymbol(instanceName)}_${sanitizeSymbol(propertyName)}`;
  const bufferArg = `%${sanitizeSymbol(propertyName)}_buffer`;
  const countArg = '%n';
  const vectorWidth = count % 8 === 0 ? 8 : 4;

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
          new TomIrParaCadaSoaLowering({
            bufferArg,
            countArg,
            amount,
            elementType,
            vectorWidth,
          }),
        ],
      }),
    ],
  });
}

function buildSimpleSumTomIr() {
  return new TomIrModule({
    name: 'soma',
    functions: [
      new TomIrFunction({
        name: 'Soma',
        args: [
          { name: '%a', type: 'In32' },
          { name: '%b', type: 'In32' },
        ],
        returnType: 'In32',
        body: [
          new TomIrReturn({
            value: new TomIrBinaryOp({
              op: '+',
              left: 'a',
              right: 'b',
              type: 'In32',
            }),
            type: 'In32',
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
  TomIrParaCadaSoaLowering,
  TomIrLocalVar,
  TomIrAssign,
  TomIrBinaryOp,
  TomIrReturn,
  TomIrIf,
  TomIrScfFor,
  buildParaCadaSoaTomIr,
  buildSimpleSumTomIr,
  renderTomIrModuleAsMlir,
};
