const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || 'teste.tom';
const sourceCode = fs.readFileSync(inputFile, 'utf-8');

const lines = sourceCode
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const irLines = [];
const mlirState = {
  vec4AddModules: [],
  nextId: 0,
};
const globals = [];
let regCount = 0;
let globalCount = 0;
let hasPrintf = false;
let hasSqrtf = false;
let hasSqrt = false;
let hasExit = false;
let hasScanf = false;
let hasTomGpuPresent = false;
let hasTomGpuReadInput = false;
let hasTomGpuQueueAudio = false;
let hasTomGpuLoadImage = false;
let hasTomGpuReadDelta = false;
let hasSinf = false;
let lastNumericValue = null;
let lastTextPointer = null;
let lastTextLength = 0;
let firstError = null;
const buffers = new Map();
const numericVars = new Map();
const compileTimeConsts = new Map();
const textVars = new Map();
const structDefinitions = new Map();
const soaVars = new Map();
const budgetState = {
  frameTargetFps: null,
  systems: [],
  priorities: [],
  systemMap: new Map(),
  staticCostBySystem: new Map(),
  staticWarnings: [],
  runtimeInstrumentation: false,
};
const gpuState = {
  buffers: new Map(),
  hostUploads: [],
  hostDownloads: [],
  kernels: new Map(),
  kernelOrder: [],
  dispatches: [],
  fences: [],
  currentKernel: null,
  backendManifestVersion: 1,
};
const controlState = {
  scopeStack: [],
  nextLabelId: 0,
  currentBlock: 'entry',
  blockTerminated: false,
};
const zoneState = new Map();
const structState = {
  currentDefinition: null,
};

const STRUCT_DEF_START_REGEX = /^DefStructSOAx([A-Za-z_][A-Za-z0-9_]*)$/;
const STRUCT_DEF_PROP_REGEX = /^Prop(In|Fl)(32|64)x([A-Za-z_][A-Za-z0-9_]*)$/;
const STRUCT_DEF_END = 'FimDef';

const TOMC_TOMCYCLES_PER_MS = 1000;
budgetState.runtimeInstrumentation = lines.some((line) => /^DefBudgetFramexyTargetFPSy(\d+)$/.test(line));

const OP_COSTS = {
  Somar: 1,
  Subtr: 1,
  Multi: 3,
  Divid: 60,
  SomarVec4: 6,
  SubtrVec4: 6,
  MultiVec4: 10,
  DividVec4: 120,
  GpuEnv: 400,
  GpuRec: 400,
  GpuApresentar: 500,
};

function nextReg() {
  regCount += 1;
  return `%r${regCount}`;
}

function sanitizeLabel(label) {
  return label.replace(/[^A-Za-z0-9_]/g, '_');
}

function nextLabel(prefix) {
  controlState.nextLabelId += 1;
  return `${prefix}_${controlState.nextLabelId}`;
}

function emitInstruction(instruction) {
  if (controlState.blockTerminated) {
    createError(`Bloco '${controlState.currentBlock}' já finalizado; instrução inválida: ${instruction}`);
    return;
  }
  irLines.push(`  ${instruction}`);
}

function nextMlirId(prefix = 'v') {
  mlirState.nextId += 1;
  return `%${prefix}${mlirState.nextId}`;
}

function mlirAttr(type, value) {
  return { kind: 'attr', type, value };
}

function mlirOp(name, payload = {}) {
  return {
    kind: 'op',
    name,
    ...payload,
  };
}

function formatMlirType(type) {
  if (Array.isArray(type)) {
    return type.map((item) => formatMlirType(item)).join(', ');
  }
  return type;
}

function formatMlirAttr(attr) {
  return `${attr.value} : ${attr.type}`;
}

function renderMlirOp(op, indent = '    ') {
  if (op.kind !== 'op') return '';

  if (op.name === 'return') {
    return `${indent}return`;
  }

  if (op.name === 'arith.constant') {
    return `${indent}${op.result} = arith.constant ${formatMlirAttr(op.value)}`;
  }

  if (op.name === 'arith.addi') {
    return `${indent}${op.result} = arith.addi ${op.operands.join(', ')} : ${formatMlirType(op.resultType)}`;
  }

  if (op.name === 'func') {
    const body = op.body.map((child) => renderMlirOp(child, `${indent}  `)).join('\n');
    return `${indent}func.func @${op.symbol}() {\n${body}\n${indent}}`;
  }

  if (op.name === 'module') {
    const body = op.body.map((child) => renderMlirOp(child, `${indent}  `)).join('\n');
    return `${indent}module {\n${body}\n${indent}}`;
  }

  return `${indent}// op desconhecida: ${op.name}`;
}

function buildVec4AddMlirModule(lhs, rhs, llvmElemType) {
  const mlirElemType = llvmElemType;
  const vecType = `vector<4x${mlirElemType}>`;
  const lhsReg = nextMlirId('lhs');
  const rhsReg = nextMlirId('rhs');
  const sumReg = nextMlirId('sum');

  const lhsLiteral = `dense<[${lhs.join(', ')}]>`;
  const rhsLiteral = `dense<[${rhs.join(', ')}]>`;

  const fn = mlirOp('func', {
    symbol: `somar_vec4_in32_${mlirState.vec4AddModules.length}`,
    body: [
      mlirOp('arith.constant', { result: lhsReg, value: mlirAttr(`tensor<4x${mlirElemType}>`, lhsLiteral) }),
      mlirOp('arith.constant', { result: rhsReg, value: mlirAttr(`tensor<4x${mlirElemType}>`, rhsLiteral) }),
      mlirOp('arith.addi', { result: sumReg, operands: [lhsReg, rhsReg], resultType: `tensor<4x${mlirElemType}>` }),
      mlirOp('return'),
    ],
  });

  return mlirOp('module', { body: [fn], resultType: vecType });
}

function renderMlirModule(moduleNode) {
  return renderMlirOp(moduleNode, '');
}

function parseStructPropType(typePrefix, bits) {
  if (typePrefix === 'In' && bits === '32') return 'i32';
  if (typePrefix === 'In' && bits === '64') return 'i64';
  if (typePrefix === 'Fl' && bits === '32') return 'float';
  if (typePrefix === 'Fl' && bits === '64') return 'double';
  return null;
}

function emitStructDefinition(line) {
  if (structState.currentDefinition) {
    if (line === STRUCT_DEF_END) {
      const { name, props } = structState.currentDefinition;
      structDefinitions.set(name, { props: [...props] });
      structState.currentDefinition = null;
      return true;
    }

    const propMatch = line.match(STRUCT_DEF_PROP_REGEX);
    if (!propMatch) {
      createError(`Comando inválido em DefStructSOA '${structState.currentDefinition.name}': ${line}`);
      return true;
    }

    const [, typePrefix, bits, propName] = propMatch;
    const propType = parseStructPropType(typePrefix, bits);
    if (!propType) {
      createError(`Tipo de propriedade SOA inválido: ${typePrefix}${bits}.`);
      return true;
    }

    const hasDuplicate = structState.currentDefinition.props.some((prop) => prop.name === propName);
    if (hasDuplicate) {
      createError(`Propriedade '${propName}' duplicada em DefStructSOA '${structState.currentDefinition.name}'.`);
      return true;
    }

    structState.currentDefinition.props.push({ name: propName, type: propType });
    return true;
  }

  const structStart = line.match(STRUCT_DEF_START_REGEX);
  if (!structStart) return false;

  const [, structName] = structStart;
  if (structDefinitions.has(structName)) {
    createError(`DefStructSOA duplicado para '${structName}'.`);
    return true;
  }

  structState.currentDefinition = {
    name: structName,
    props: [],
  };
  return true;
}

function terminateCurrentBlock(terminator) {
  if (controlState.blockTerminated) {
    createError(`Bloco '${controlState.currentBlock}' já possui terminador.`);
    return;
  }
  irLines.push(`  ${terminator}`);
  controlState.blockTerminated = true;
}

function emitLabel(label) {
  irLines.push(`${label}:`);
  controlState.currentBlock = label;
  controlState.blockTerminated = false;
}

function escapeLlvmString(text) {
  return text
    .replace(/\\/g, '\\5C')
    .replace(/\n/g, '\\0A')
    .replace(/\r/g, '\\0D')
    .replace(/\t/g, '\\09')
    .replace(/"/g, '\\22')
    .replace(/'/g, '\\27');
}

function createGlobalString(text, prefix = 'str') {
  const name = `@${prefix}${globalCount++}`;
  const escaped = escapeLlvmString(text);
  const len = Buffer.byteLength(text, 'utf8') + 1;
  globals.push(`${name} = private unnamed_addr constant [${len} x i8] c"${escaped}\\00"`);
  return { name, len };
}

function pointerToGlobal(globalInfo) {
  const reg = nextReg();
  emitInstruction(
    `${reg} = getelementptr inbounds [${globalInfo.len} x i8], [${globalInfo.len} x i8]* ${globalInfo.name}, i64 0, i64 0`,
  );
  return reg;
}

function createError(message) {
  if (!firstError) {
    firstError = message;
  }
}

function parseLiteral(text) {
  const m = text.match(/l'([^']*)'/);
  return m ? decodeTomString(m[1]) : null;
}

function decodeTomString(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

function parseNumber(value, llvmType, isFloat) {
  if (isFloat) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : null;
  }

  const num = Number.parseInt(value, 10);
  if (!Number.isInteger(num)) return null;

  if (llvmType === 'i32' && (num < -2147483648 || num > 2147483647)) {
    return null;
  }

  if (llvmType === 'i64') {
    return String(num);
  }

  return String(num);
}

function evaluateCompileTimeExpression(expression, line) {
  try {
    const evaluator = new Function(`return (${expression});`);
    const result = evaluator();
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      createError(`CompDefConst inválido: expressão deve resultar em número finito (${line}).`);
      return null;
    }
    return result;
  } catch (err) {
    createError(`CompDefConst falhou ao avaliar '${expression}': ${err.message}`);
    return null;
  }
}

function resolveCompileTimeConstValue(name, llvmType, isFloat) {
  if (!compileTimeConsts.has(name)) return null;
  const rawValue = compileTimeConsts.get(name);
  return parseNumber(String(rawValue), llvmType, isFloat);
}

function parseSoaPropertyAccess(raw) {
  const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)@(@?[A-Za-z_][A-Za-z0-9_]*|-?\d+)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) return null;

  const [, instanceName, indexRaw, propertyName] = match;
  return { instanceName, indexRaw, propertyName };
}

function resolveSoaIndex(indexRaw, count) {
  if (indexRaw.startsWith('@')) {
    const indexVarName = indexRaw.slice(1);
    const indexVar = numericVars.get(indexVarName);
    if (!indexVar) {
      return { error: `Índice SOA inválido: variável '${indexVarName}' não foi definida.` };
    }
    if (indexVar.llvmType !== 'i32' && indexVar.llvmType !== 'i64') {
      return { error: `Índice SOA inválido: '${indexVarName}' precisa ser i32/i64, encontrado ${indexVar.llvmType}.` };
    }

    const loadedIndex = nextReg();
    emitInstruction(`${loadedIndex} = load ${indexVar.llvmType}, ${indexVar.llvmType}* ${indexVar.ptr}`);
    if (indexVar.llvmType === 'i64') {
      return { value: loadedIndex };
    }

    const widened = nextReg();
    emitInstruction(`${widened} = sext i32 ${loadedIndex} to i64`);
    return { value: widened };
  }

  const parsed = Number.parseInt(indexRaw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: `Índice SOA inválido: '${indexRaw}'.` };
  }
  if (parsed >= count) {
    return { error: `Índice SOA fora do limite: ${parsed} (tamanho ${count}).` };
  }

  return { value: String(parsed) };
}

function resolveSoaPropertyPointer(raw, expectedType = null) {
  const access = parseSoaPropertyAccess(raw);
  if (!access) return null;

  const soaInstance = soaVars.get(access.instanceName);
  if (!soaInstance) {
    return { error: `Acesso SOA inválido: instância '${access.instanceName}' não foi definida.` };
  }

  const property = soaInstance.propPointers.get(access.propertyName);
  if (!property) {
    return { error: `Acesso SOA inválido: propriedade '${access.propertyName}' não existe em '${access.instanceName}'.` };
  }

  if (expectedType && property.llvmType !== expectedType) {
    return {
      error: `Acesso SOA incompatível: '${access.instanceName}@${access.indexRaw}.${access.propertyName}' é ${property.llvmType}, esperado ${expectedType}.`,
    };
  }

  const index = resolveSoaIndex(access.indexRaw, soaInstance.count);
  if (index.error) return { error: index.error };

  const elementPtr = nextReg();
  emitInstruction(
    `${elementPtr} = getelementptr inbounds [${soaInstance.count} x ${property.llvmType}], [${soaInstance.count} x ${property.llvmType}]* ${property.ptr}, i64 0, i64 ${index.value}`,
  );

  return {
    ptr: elementPtr,
    llvmType: property.llvmType,
    access,
  };
}

function resolveNumericOperand(raw, llvmType, isFloat) {
  const soaPointer = resolveSoaPropertyPointer(raw, llvmType);
  if (soaPointer) {
    if (soaPointer.error) return { error: soaPointer.error };

    const loaded = nextReg();
    emitInstruction(`${loaded} = load ${llvmType}, ${llvmType}* ${soaPointer.ptr}`);
    return { value: loaded };
  }

  if (raw.startsWith('@')) {
    const name = raw.slice(1);

    if (name === 'ULTIMO') {
      if (!lastNumericValue) {
        return { error: "'@ULTIMO' usado sem resultado numérico anterior." };
      }
      if (lastNumericValue.llvmType !== llvmType) {
        return { error: `Tipo incompatível em '@ULTIMO': esperado ${llvmType}, encontrado ${lastNumericValue.llvmType}.` };
      }
      return { value: lastNumericValue.reg };
    }

    const variable = numericVars.get(name);
    const compileTimeValue = resolveCompileTimeConstValue(name, llvmType, isFloat);
    if (compileTimeValue !== null) {
      return { value: compileTimeValue };
    }

    if (!variable) {
      return { error: `Variável numérica '${name}' não foi definida.` };
    }
    if (variable.llvmType !== llvmType) {
      return { error: `Tipo incompatível em '@${name}': esperado ${llvmType}, encontrado ${variable.llvmType}.` };
    }

    const reg = nextReg();
    emitInstruction(`${reg} = load ${llvmType}, ${llvmType}* ${variable.ptr}`);
    return { value: reg };
  }

  const literal = parseNumber(raw, llvmType, isFloat);
  if (literal === null) {
    return { error: `Operando inválido '${raw}' para ${llvmType}.` };
  }

  return { value: literal };
}

function parseDeclarationValue(raw, llvmType, isFloat) {
  const parsed = parseNumber(raw, llvmType, isFloat);
  if (parsed !== null) return parsed;

  if (!raw.startsWith('@')) return null;
  const sourceName = raw.slice(1);
  const constValue = resolveCompileTimeConstValue(sourceName, llvmType, isFloat);
  if (constValue !== null) return constValue;

  const source = numericVars.get(sourceName);
  if (!source || source.llvmType !== llvmType) return null;

  const reg = nextReg();
  emitInstruction(`${reg} = load ${llvmType}, ${llvmType}* ${source.ptr}`);
  return reg;
}

function getScalarBitWidth(scalarType) {
  const match = scalarType.match(/(32|64)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function scalarToGlslType(scalarType) {
  if (scalarType === 'In32') return 'int';
  if (scalarType === 'Fl32') return 'float';
  if (scalarType === 'In64') return 'int64_t';
  if (scalarType === 'Fl64') return 'double';
  return null;
}

function buildGlslKernelSource(kernel, buffersByName) {
  const glsl = [];
  const varTypes = new Map();
  const declaredBuffers = new Set();
  const unsupported = [];
  const pushConstants = new Map();
  const bufferBindings = [];
  const localSize = { x: 64, y: 1, z: 1 };
  const intExtRequired = Array.from(buffersByName.values()).some((buffer) => buffer.scalarType === 'In64');
  const float64ExtRequired = Array.from(buffersByName.values()).some((buffer) => buffer.scalarType === 'Fl64');
  const requiredExtensions = [];

  if (intExtRequired) requiredExtensions.push('GL_EXT_shader_explicit_arithmetic_types_int64');
  if (float64ExtRequired) requiredExtensions.push('GL_ARB_gpu_shader_fp64');

  function registerPushConstant(symbol, preferredType = 'int') {
    if (!symbol || declaredBuffers.has(symbol) || varTypes.has(symbol)) return;
    const current = pushConstants.get(symbol);
    if (!current || current === preferredType) {
      pushConstants.set(symbol, preferredType);
      return;
    }
    if (current === 'int' && preferredType !== 'int') {
      pushConstants.set(symbol, preferredType);
    }
  }

  function coerceSymbol(symbol, expectedType, fallbackType = 'int') {
    if (!symbol) return symbol;
    const knownType = varTypes.get(symbol);
    if (knownType) {
      return knownType === expectedType ? symbol : `${expectedType}(${symbol})`;
    }

    registerPushConstant(symbol, fallbackType);
    const sourceType = pushConstants.get(symbol) || fallbackType;
    return sourceType === expectedType ? symbol : `${expectedType}(${symbol})`;
  }

  glsl.push('#version 460');
  if (intExtRequired) glsl.push('#extension GL_EXT_shader_explicit_arithmetic_types_int64 : require');
  if (float64ExtRequired) glsl.push('#extension GL_ARB_gpu_shader_fp64 : require');
  glsl.push('');
  glsl.push(`layout(local_size_x = ${localSize.x}, local_size_y = ${localSize.y}, local_size_z = ${localSize.z}) in;`);
  glsl.push('');

  let bindingIndex = 0;
  for (const [bufferName, bufferCfg] of buffersByName.entries()) {
    const glslType = scalarToGlslType(bufferCfg.scalarType);
    if (!glslType) {
      unsupported.push(`Tipo de buffer sem mapeamento GLSL: ${bufferCfg.scalarType} (${bufferName})`);
      continue;
    }
    glsl.push(`layout(std430, binding = ${bindingIndex}) buffer TomBuf_${bufferName} { ${glslType} data[]; } ${bufferName};`);
    declaredBuffers.add(bufferName);
    bufferBindings.push({ name: bufferName, binding: bindingIndex, scalarType: bufferCfg.scalarType, glslType });
    bindingIndex += 1;
  }

  glsl.push('');
  glsl.push('layout(push_constant) uniform TomPushConstants {');
  glsl.push('  int _placeholder;');
  glsl.push('} pc;');
  glsl.push('');
  glsl.push('void main() {');
  let indentLevel = 1;

  function emitMainLine(code) {
    glsl.push(`${'  '.repeat(Math.max(indentLevel, 0))}${code}`);
  }

  function selectComparisonType(leftType, rightType) {
    if (leftType && rightType && leftType === rightType) return leftType;
    const priority = ['double', 'float', 'int64_t', 'uint', 'int'];
    for (const candidate of priority) {
      if (leftType === candidate || rightType === candidate) return candidate;
    }
    return leftType || rightType || 'int';
  }

  for (const op of kernel.ops) {
    if (op.kind === 'id') {
      varTypes.set(op.idVar, 'uint');
      emitMainLine(`uint ${op.idVar} = gl_GlobalInvocationID.x;`);
      continue;
    }

    if (op.kind === 'load_scalar') {
      const glslType = scalarToGlslType(op.scalarType);
      if (!glslType || !declaredBuffers.has(op.bufferName)) {
        unsupported.push(`load_scalar não suportado: ${op.scalarType} em ${op.bufferName}`);
        continue;
      }
      registerPushConstant(op.indexVar, 'uint');
      const indexExpr = coerceSymbol(op.indexVar, 'uint', 'uint');
      varTypes.set(op.outVar, glslType);
      emitMainLine(`${glslType} ${op.outVar} = ${op.bufferName}.data[${indexExpr}];`);
      continue;
    }

    if (op.kind === 'store_scalar') {
      if (!declaredBuffers.has(op.bufferName)) {
        unsupported.push(`store_scalar sem buffer declarado: ${op.bufferName}`);
        continue;
      }
      const buffer = buffersByName.get(op.bufferName);
      const targetType = scalarToGlslType(buffer?.scalarType || op.scalarType) || 'int';
      registerPushConstant(op.indexVar, 'uint');
      const indexExpr = coerceSymbol(op.indexVar, 'uint', 'uint');
      const valueExpr = coerceSymbol(op.inVar, targetType, targetType);
      emitMainLine(`${op.bufferName}.data[${indexExpr}] = ${valueExpr};`);
      continue;
    }

    if (op.kind === 'math_scalar') {
      const leftType = scalarToGlslType(op.scalarType) || varTypes.get(op.leftVar) || 'int';
      const operator = { Somar: '+', Subtr: '-', Multi: '*', Divid: '/' }[op.op];
      if (!operator) {
        unsupported.push(`math_scalar op não suportada: ${op.op}`);
        continue;
      }
      const leftExpr = coerceSymbol(op.leftVar, leftType, leftType);
      const rightExpr = coerceSymbol(op.rightVar, leftType, leftType);
      varTypes.set(op.outVar, leftType);
      emitMainLine(`${leftType} ${op.outVar} = ${leftExpr} ${operator} ${rightExpr};`);
      continue;
    }


    if (op.kind === 'sin_scalar') {
      if (op.scalarType !== 'Fl32') {
        unsupported.push(`sin_scalar não suportado para ${op.scalarType}`);
        continue;
      }
      const sinInput = coerceSymbol(op.inVar, 'float', 'float');
      varTypes.set(op.outVar, 'float');
      emitMainLine(`float ${op.outVar} = sin(${sinInput});`);
      continue;
    }

    if (op.kind === 'branch_start') {
      const leftType = varTypes.get(op.leftVar);
      const rightType = varTypes.get(op.rightVar);
      const compareType = selectComparisonType(leftType, rightType);
      const leftExpr = coerceSymbol(op.leftVar, compareType, compareType);
      const rightExpr = coerceSymbol(op.rightVar, compareType, compareType);
      emitMainLine(`if (${leftExpr} > ${rightExpr}) {`);
      indentLevel += 1;
      continue;
    }

    if (op.kind === 'branch_end') {
      if (indentLevel <= 1) {
        unsupported.push('GpuFimSe sem bloco condicional correspondente.');
        continue;
      }
      indentLevel -= 1;
      emitMainLine('}');
      continue;
    }

    if (op.kind === 'load_vec4' || op.kind === 'store_vec4' || op.kind === 'math_vec4') {
      unsupported.push(`Operação vetorial ainda não traduzida para GLSL: ${op.kind}`);
      continue;
    }

    unsupported.push(`Operação de kernel desconhecida: ${op.kind}`);
  }

  while (indentLevel > 1) {
    indentLevel -= 1;
    emitMainLine('}');
    unsupported.push('Kernel finalizado com bloco condicional aberto; fechando automaticamente no GLSL gerado.');
  }

  glsl.push('}');

  if (pushConstants.size > 0) {
    const pcFields = Array.from(pushConstants.entries())
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      .map(([name, type]) => `  ${type} ${name.replace(/^pc\./, '')};`)
      .join('\n');
    const pcBlock = ['layout(push_constant) uniform TomPushConstants {', pcFields, '} pc;'].join('\n');
    for (let i = 0; i < glsl.length; i += 1) {
      if (glsl[i] === 'layout(push_constant) uniform TomPushConstants {') {
        glsl.splice(i, 3, ...pcBlock.split('\n'));
        break;
      }
    }
    for (let i = 0; i < glsl.length; i += 1) {
      if (!glsl[i].startsWith('  ')) continue;
      for (const [name] of pushConstants.entries()) {
        const cleanName = name.replace(/^pc\./, '');
        glsl[i] = glsl[i].replace(new RegExp(`\\b${cleanName}\\b`, 'g'), `pc.${cleanName}`);
      }
    }

    let normalizePushBlock = false;
    for (let i = 0; i < glsl.length; i += 1) {
      if (glsl[i] === 'layout(push_constant) uniform TomPushConstants {') {
        normalizePushBlock = true;
        continue;
      }
      if (normalizePushBlock && glsl[i] === '} pc;') {
        normalizePushBlock = false;
        continue;
      }
      if (!normalizePushBlock) continue;
      glsl[i] = glsl[i].replace(/^\s*(int|uint|float|double|int64_t)\s+pc\./, '  $1 ');
    }
  }

  return {
    source: glsl.join('\n'),
    unsupported,
    localSize,
    requiredExtensions,
    bufferBindings,
    pushConstants: Array.from(pushConstants.entries())
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      .map(([name, glslType]) => ({ name: name.replace(/^pc\./, ''), glslType })),
  };
}


function buildGpuBackendManifest(inputPath) {
  if (!gpuState.buffers.size && !gpuState.kernelOrder.length && !gpuState.dispatches.length && !gpuState.fences.length) {
    return null;
  }

  const manifest = {
    version: gpuState.backendManifestVersion,
    sourceFile: path.basename(inputPath),
    generatedAtUtc: new Date().toISOString(),
    buffers: [],
    uploads: [...gpuState.hostUploads],
    downloads: [...gpuState.hostDownloads],
    dispatches: [...gpuState.dispatches],
    fences: [...gpuState.fences],
    kernels: [],
  };

  for (const [name, cfg] of gpuState.buffers.entries()) {
    manifest.buffers.push({
      name,
      scalarType: cfg.scalarType,
      scalarBits: getScalarBitWidth(cfg.scalarType),
      count: cfg.count,
    });
  }

  for (const kernelName of gpuState.kernelOrder) {
    const kernel = gpuState.kernels.get(kernelName);
    const glsl = buildGlslKernelSource(kernel, gpuState.buffers);
    manifest.kernels.push({
      name: kernelName,
      opCount: kernel.ops.length,
      ops: kernel.ops,
      backends: {
        glsl_compute: {
          entryPoint: 'main',
          shaderStage: 'compute',
          language: 'GLSL',
          glslVersion: 460,
          localSize: glsl.localSize,
          requiredExtensions: glsl.requiredExtensions,
          bufferBindings: glsl.bufferBindings,
          pushConstants: glsl.pushConstants,
          source: glsl.source,
          unsupported: glsl.unsupported,
        },
        spirv: {
          status: 'pending',
          notes: 'Backend SPIR-V será gerado a partir do GLSL/IR neste manifesto.',
        },
      },
    });
  }

  return manifest;
}



function parseTomPerfStressRegister(text) {
  const trimmed = text.trim();
  if (trimmed === '@TomPerf_StressLevel') {
    return '@TomPerf_StressLevel';
  }
  return null;
}

function costToTomCycles(maxMs) {
  return Math.round(maxMs * TOMC_TOMCYCLES_PER_MS);
}

function trackSystemCost(cost) {
  const activeScope = controlState.scopeStack[controlState.scopeStack.length - 1];
  if (!activeScope) return;

  const system = budgetState.systemMap.get(activeScope.scopeName);
  if (!system) return;

  const current = budgetState.staticCostBySystem.get(system.name) || 0;
  budgetState.staticCostBySystem.set(system.name, current + cost);
}

function emitRuntimeBudgetPrelude() {
  if (!budgetState.runtimeInstrumentation) return;
  emitInstruction('%tom_budget_cycle_start = call i64 @llvm.readcyclecounter()');
}

function emitRuntimeBudgetEpilogue() {
  if (!budgetState.runtimeInstrumentation) return;
  emitInstruction('%tom_budget_cycle_end = call i64 @llvm.readcyclecounter()');
  emitInstruction('%tom_budget_cycle_elapsed = sub i64 %tom_budget_cycle_end, %tom_budget_cycle_start');
  emitInstruction('call void @TomBudgetManager_Report(i8* null, i64 %tom_budget_cycle_elapsed)');
}

function emitStaticBudgetWarnings() {
  for (const system of budgetState.systems) {
    const maxTomCycles = costToTomCycles(system.maxMs);
    const estimated = budgetState.staticCostBySystem.get(system.name) || 0;
    if (estimated > maxTomCycles) {
      budgetState.staticWarnings.push(
        `Atenção: O bloco '${system.name}' tem custo teórico de ${estimated} TomCycles, acima do limite de ${maxTomCycles} TomCycles (~${system.maxMs} ms).`,
      );
    }
  }
}

function emitBudgetDirective(line) {
  const frame = line.match(/^DefBudgetFramexyTargetFPSy(\d+)$/);
  if (frame) {
    const fps = Number.parseInt(frame[1], 10);
    if (!Number.isInteger(fps) || fps <= 0) {
      createError(`DefBudgetFrame inválido: ${line}`);
      return true;
    }

    budgetState.frameTargetFps = fps;
    budgetState.runtimeInstrumentation = true;
    emitInstruction(`; TOM_BUDGET_FRAME target_fps=${fps}`);
    return true;
  }

  const system = line.match(/^DefBudgetSistemax([A-Za-z_][A-Za-z0-9_]*)yMaxMsy(-?\d+(?:\.\d+)?)$/);
  if (system) {
    const [, name, maxMsRaw] = system;
    const maxMs = Number.parseFloat(maxMsRaw);
    if (!Number.isFinite(maxMs) || maxMs <= 0) {
      createError(`DefBudgetSistema inválido: ${line}`);
      return true;
    }

    if (budgetState.systemMap.has(name)) {
      createError(`DefBudgetSistema duplicado para '${name}'.`);
      return true;
    }

    const systemData = { name, maxMs };
    budgetState.systems.push(systemData);
    budgetState.systemMap.set(name, systemData);
    emitInstruction(`; TOM_BUDGET_SYSTEM name=${name} max_ms=${maxMs}`);
    return true;
  }

  const priority = line.match(/^DefPrioridadex([A-Za-z_][A-Za-z0-9_]*)y(-?\d+)$/);
  if (priority) {
    const [, name, levelRaw] = priority;
    const level = Number.parseInt(levelRaw, 10);
    if (!Number.isInteger(level) || level < 0) {
      createError(`DefPrioridade inválida: ${line}`);
      return true;
    }

    budgetState.priorities.push({ name, level });
    emitInstruction(`; TOM_BUDGET_PRIORITY name=${name} level=${level}`);
    return true;
  }

  return false;
}

function emitNumericOperation(line) {
  const numberOperand = '([A-Za-z_][A-Za-z0-9_]*@(?:@?[A-Za-z_][A-Za-z0-9_]*|-?\\d+)\\.[A-Za-z_][A-Za-z0-9_]*|@?[A-Za-z_][A-Za-z0-9_]*|-?\\d+(?:\\.\\d+)?)';
  const mathRegex = new RegExp(`^(Somar|Subtr|Multi|Divid)xy(In)(Sd|Ud)(32|64)x${numberOperand}y${numberOperand}$`);
  const floatRegex = new RegExp(`^(Somar|Subtr|Multi|Divid)xy(Fl)(32|64)x${numberOperand}y${numberOperand}$`);
  const sinRegex = /^GpuMathSinFl32x(@?[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?)$/;

  const im = line.match(mathRegex);
  if (im) {
    const [, op, , sign, bits, xRaw, yRaw] = im;
    const llvmType = bits === '32' ? 'i32' : 'i64';
    const x = resolveNumericOperand(xRaw, llvmType, false);
    const y = resolveNumericOperand(yRaw, llvmType, false);

    if (x.error || y.error) {
      createError(x.error || y.error);
      return true;
    }

    const reg = nextReg();
    const signed = sign === 'Sd';
    const opMap = {
      Somar: signed ? 'add nsw' : 'add',
      Subtr: signed ? 'sub nsw' : 'sub',
      Multi: signed ? 'mul nsw' : 'mul',
      Divid: signed ? 'sdiv' : 'udiv',
    };

    emitInstruction(`${reg} = ${opMap[op]} ${llvmType} ${x.value}, ${y.value}`);
    trackSystemCost(OP_COSTS[op] || 1);
    lastNumericValue = { reg, llvmType };
    return true;
  }

  const fm = line.match(floatRegex);
  if (fm) {
    const [, op, , bits, xRaw, yRaw] = fm;
    const llvmType = bits === '32' ? 'float' : 'double';
    const x = resolveNumericOperand(xRaw, llvmType, true);
    const y = resolveNumericOperand(yRaw, llvmType, true);

    if (x.error || y.error) {
      createError(x.error || y.error);
      return true;
    }

    const reg = nextReg();
    const opMap = {
      Somar: 'fadd',
      Subtr: 'fsub',
      Multi: 'fmul',
      Divid: 'fdiv',
    };

    emitInstruction(`${reg} = ${opMap[op]} ${llvmType} ${x.value}, ${y.value}`);
    trackSystemCost(OP_COSTS[op] || 1);
    lastNumericValue = { reg, llvmType };
    return true;
  }

  const sm = line.match(sinRegex);
  if (sm) {
    const [, valueRaw] = sm;
    const value = resolveNumericOperand(valueRaw, 'float', true);
    if (value.error) {
      createError(value.error);
      return true;
    }

    const reg = nextReg();
    hasSinf = true;
    emitInstruction(`${reg} = call float @llvm.sin.f32(float ${value.value})`);
    lastNumericValue = { reg, llvmType: 'float' };
    return true;
  }

  return false;
}

function emitVectorOperation(line) {
  const vm = line.match(/^(Somar|Subtr|Multi|Divid)Vec4In(32|64)x\[([^\]]+)\]y\[([^\]]+)\]$/);
  if (!vm) return false;

  const [, op, bits, left, right] = vm;
  const llvmElemType = bits === '32' ? 'i32' : 'i64';
  const llvmVecType = `<4 x ${llvmElemType}>`;

  const leftValues = left.split(',').map((v) => v.trim());
  const rightValues = right.split(',').map((v) => v.trim());

  if (leftValues.length !== 4 || rightValues.length !== 4) {
    createError(`Vetores Vec4 exigem 4 elementos por lado: ${line}`);
    return true;
  }

  const lhs = [];
  const rhs = [];
  for (let i = 0; i < 4; i += 1) {
    const l = parseNumber(leftValues[i], llvmElemType, false);
    const r = parseNumber(rightValues[i], llvmElemType, false);
    if (l === null || r === null) {
      createError(`Elemento de vetor inválido na posição ${i + 1}: ${line}`);
      return true;
    }
    lhs.push(l);
    rhs.push(r);
  }

  if (op === 'Somar' && llvmElemType === 'i32') {
    const mlirModule = buildVec4AddMlirModule(lhs, rhs, llvmElemType);
    mlirState.vec4AddModules.push(mlirModule);

    const reg = nextReg();
    emitInstruction(`; MLIR lowering (SomarVec4In32) -> output.mlir [${mlirState.vec4AddModules.length - 1}]`);
    emitInstruction(`${reg} = add ${llvmVecType} <${lhs.map((n) => `${llvmElemType} ${n}`).join(', ')}>, <${rhs.map((n) => `${llvmElemType} ${n}`).join(', ')}>`);
    trackSystemCost(OP_COSTS[`${op}Vec4`] || 6);
    return true;
  }

  const reg = nextReg();
  const opMap = {
    Somar: 'add',
    Subtr: 'sub',
    Multi: 'mul',
    Divid: 'sdiv',
  };

  emitInstruction(`${reg} = ${opMap[op]} ${llvmVecType} <${lhs.map((n) => `${llvmElemType} ${n}`).join(', ')}>, <${rhs.map((n) => `${llvmElemType} ${n}`).join(', ')}>`);
  trackSystemCost(OP_COSTS[`${op}Vec4`] || 6);
  return true;
}

function emitControlFlow(line) {
  const deferMatch = line.match(/^Defer(.+)$/);
  if (deferMatch) {
    const [, deferredCommand] = deferMatch;
    const activeScope = controlState.scopeStack[controlState.scopeStack.length - 1];
    if (!activeScope) {
      createError(`Defer precisa estar dentro de um EscopoIni/EscopoFim: ${line}`);
      return true;
    }

    activeScope.deferStack.push(deferredCommand);
    return true;
  }

  const scopeStart = line.match(/^EscopoInix([A-Za-z_][A-Za-z0-9_]*)$/);
  if (scopeStart) {
    const [, scopeName] = scopeStart;
    const safe = sanitizeLabel(scopeName);
    const scopeSystem = budgetState.systemMap.get(scopeName) || null;
    const scope = {
      scopeName,
      system: scopeSystem,
      startLabel: nextLabel(`escopo_${safe}_ini`),
      endLabel: nextLabel(`escopo_${safe}_fim`),
      enterCycleReg: scopeSystem ? nextReg() : null,
      deferStack: [],
    };

    terminateCurrentBlock(`br label %${scope.startLabel}`);
    emitLabel(scope.startLabel);
    if (scope.system) {
      emitInstruction(`${scope.enterCycleReg} = call i64 @llvm.readcyclecounter()`);
      emitInstruction(`; TOM_BUDGET_SCOPE_BEGIN name=${scope.system.name}`);
    }
    controlState.scopeStack.push(scope);
    return true;
  }

  const scopeEnd = line.match(/^EscopoFimx([A-Za-z_][A-Za-z0-9_]*)$/);
  if (scopeEnd) {
    const [, scopeName] = scopeEnd;
    const currentScope = controlState.scopeStack.pop();
    if (!currentScope || currentScope.scopeName !== scopeName) {
      createError(`EscopoFim inválido: esperado '${currentScope ? currentScope.scopeName : 'nenhum'}', recebido '${scopeName}'.`);
      return true;
    }

    while (!firstError && currentScope.deferStack.length > 0) {
      const deferredLine = currentScope.deferStack.pop();
      if (emitControlFlow(deferredLine)) {
        createError(`Defer inválido no escopo '${scopeName}': comando de controle de fluxo não é suportado (${deferredLine}).`);
        return true;
      }
      if (emitGpuOperation(deferredLine)) continue;
      if (emitBudgetDirective(deferredLine)) continue;
      if (emitZoneOperation(deferredLine)) continue;
      if (emitDataOperation(deferredLine)) continue;
      if (emitNumericOperation(deferredLine)) continue;
      if (emitVectorOperation(deferredLine)) continue;
      if (emitStringOperation(deferredLine)) continue;
      if (emitText(deferredLine)) continue;

      createError(`Comando Defer não reconhecido: ${deferredLine}`);
      return true;
    }

    terminateCurrentBlock(`br label %${currentScope.endLabel}`);
    emitLabel(currentScope.endLabel);
    if (currentScope.system) {
      const endCycleReg = nextReg();
      const elapsedCycleReg = nextReg();
      emitInstruction(`${endCycleReg} = call i64 @llvm.readcyclecounter()`);
      emitInstruction(`${elapsedCycleReg} = sub i64 ${endCycleReg}, ${currentScope.enterCycleReg}`);
      const sysInfo = createGlobalString(currentScope.system.name, 'budget_name');
      const sysPtr = pointerToGlobal(sysInfo);
      emitInstruction(`call void @TomBudgetManager_Report(i8* ${sysPtr}, i64 ${elapsedCycleReg})`);
      emitInstruction(`; TOM_BUDGET_SCOPE_END name=${currentScope.system.name}`);
    }
    return true;
  }

  const greater = line.match(/^SeMaiorxyIn(Sd|Ud)(32|64)x([^y]+)y([^y]+)$/);
  if (greater) {
    const [, sign, bits, leftRaw, rightRaw] = greater;
    const activeScope = controlState.scopeStack[controlState.scopeStack.length - 1];
    if (!activeScope) {
      createError(`SeMaior precisa estar dentro de um EscopoIni/EscopoFim: ${line}`);
      return true;
    }

    const llvmType = bits === '32' ? 'i32' : 'i64';
    const left = resolveNumericOperand(leftRaw, llvmType, false);
    const right = resolveNumericOperand(rightRaw, llvmType, false);
    const leftValue = left.error ? parseTomPerfStressRegister(leftRaw) : left.value;
    const rightValue = right.error ? parseTomPerfStressRegister(rightRaw) : right.value;

    if (leftValue === null || rightValue === null || leftValue === undefined || rightValue === undefined) {
      createError(left.error || right.error || `Comparação inválida para ${llvmType}: ${line}`);
      return true;
    }

    const condReg = nextReg();
    const cmp = sign === 'Sd' ? 'sgt' : 'ugt';
    const trueLabel = nextLabel('se_maior_verdadeiro');

    emitInstruction(`${condReg} = icmp ${cmp} ${llvmType} ${leftValue}, ${rightValue}`);
    terminateCurrentBlock(`br i1 ${condReg}, label %${trueLabel}, label %${activeScope.endLabel}`);
    emitLabel(trueLabel);
    return true;
  }

  return false;
}

function emitDataOperation(line) {
  const soaVecAdd = line.match(/^ParaCadaSOAx([A-Za-z_][A-Za-z0-9_]*)xSomar([A-Za-z_][A-Za-z0-9_]*?)(-?\d+)$/);
  if (soaVecAdd) {
    const [, instanceName, propertyName, amountRaw] = soaVecAdd;
    const instance = soaVars.get(instanceName);
    if (!instance) {
      createError(`ParaCadaSOA falhou: instância '${instanceName}' não foi definida.`);
      return true;
    }

    const property = instance.propPointers.get(propertyName);
    if (!property) {
      createError(`ParaCadaSOA falhou: propriedade '${propertyName}' não existe em '${instanceName}'.`);
      return true;
    }

    if (property.llvmType !== 'i32') {
      createError(`ParaCadaSOA vetorizado suporta apenas propriedades i32. '${instanceName}.${propertyName}' está como ${property.llvmType}.`);
      return true;
    }

    const amount = parseNumber(amountRaw, 'i32', false);
    if (amount === null) {
      createError(`ParaCadaSOA inválido: valor '${amountRaw}' fora de i32.`);
      return true;
    }

    const preheaderLabel = controlState.currentBlock;
    const vecCondLabel = nextLabel(`soa_vec4_${instanceName}_${propertyName}_cond`);
    const vecBodyLabel = nextLabel(`soa_vec4_${instanceName}_${propertyName}_body`);
    const tailCondLabel = nextLabel(`soa_vec4_${instanceName}_${propertyName}_tail_cond`);
    const tailBodyLabel = nextLabel(`soa_vec4_${instanceName}_${propertyName}_tail_body`);
    const exitLabel = nextLabel(`soa_vec4_${instanceName}_${propertyName}_fim`);

    const chunkCount = Math.floor(instance.count / 4);
    const vecLimit = chunkCount * 4;
    const vectorAddConst = `<i32 ${amount}, i32 ${amount}, i32 ${amount}, i32 ${amount}>`;

    terminateCurrentBlock(`br label %${vecCondLabel}`);
    emitLabel(vecCondLabel);

    const vecIndexReg = nextReg();
    const vecCmpReg = nextReg();
    const vecNextReg = nextReg();
    emitInstruction(`${vecIndexReg} = phi i64 [0, %${preheaderLabel}], [${vecNextReg}, %${vecBodyLabel}]`);
    emitInstruction(`${vecCmpReg} = icmp ult i64 ${vecIndexReg}, ${vecLimit}`);
    terminateCurrentBlock(`br i1 ${vecCmpReg}, label %${vecBodyLabel}, label %${tailCondLabel}`);

    emitLabel(vecBodyLabel);
    const elemPtrReg = nextReg();
    emitInstruction(
      `${elemPtrReg} = getelementptr inbounds [${instance.count} x i32], [${instance.count} x i32]* ${property.ptr}, i64 0, i64 ${vecIndexReg}`,
    );
    const vecPtrReg = nextReg();
    emitInstruction(`${vecPtrReg} = bitcast i32* ${elemPtrReg} to <4 x i32>*`);
    const vecLoadReg = nextReg();
    emitInstruction(`${vecLoadReg} = load <4 x i32>, <4 x i32>* ${vecPtrReg}, align 16`);
    const vecAddReg = nextReg();
    emitInstruction(`${vecAddReg} = add <4 x i32> ${vecLoadReg}, ${vectorAddConst}`);
    emitInstruction(`store <4 x i32> ${vecAddReg}, <4 x i32>* ${vecPtrReg}, align 16`);
    emitInstruction(`${vecNextReg} = add i64 ${vecIndexReg}, 4`);
    terminateCurrentBlock(`br label %${vecCondLabel}`);

    emitLabel(tailCondLabel);
    const tailIndexReg = nextReg();
    const tailCmpReg = nextReg();
    const tailNextReg = nextReg();
    emitInstruction(`${tailIndexReg} = phi i64 [${vecLimit}, %${vecCondLabel}], [${tailNextReg}, %${tailBodyLabel}]`);
    emitInstruction(`${tailCmpReg} = icmp ult i64 ${tailIndexReg}, ${instance.count}`);
    terminateCurrentBlock(`br i1 ${tailCmpReg}, label %${tailBodyLabel}, label %${exitLabel}`);

    emitLabel(tailBodyLabel);
    const tailElemPtrReg = nextReg();
    emitInstruction(
      `${tailElemPtrReg} = getelementptr inbounds [${instance.count} x i32], [${instance.count} x i32]* ${property.ptr}, i64 0, i64 ${tailIndexReg}`,
    );
    const tailLoadedReg = nextReg();
    emitInstruction(`${tailLoadedReg} = load i32, i32* ${tailElemPtrReg}`);
    const tailAddedReg = nextReg();
    emitInstruction(`${tailAddedReg} = add nsw i32 ${tailLoadedReg}, ${amount}`);
    emitInstruction(`store i32 ${tailAddedReg}, i32* ${tailElemPtrReg}`);
    emitInstruction(`${tailNextReg} = add i64 ${tailIndexReg}, 1`);
    terminateCurrentBlock(`br label %${tailCondLabel}`);

    emitLabel(exitLabel);
    trackSystemCost((chunkCount * (OP_COSTS.SomarVec4 || 6)) + ((instance.count - vecLimit) * (OP_COSTS.Somar || 1)));
    return true;
  }

  const defConst = line.match(/^CompDefConstx([A-Za-z_][A-Za-z0-9_]*)y(.+)$/);
  if (defConst) {
    const [, name, expression] = defConst;
    if (compileTimeConsts.has(name) || numericVars.has(name)) {
      createError(`CompDefConst duplicado para '${name}'.`);
      return true;
    }

    const value = evaluateCompileTimeExpression(expression, line);
    if (value === null) {
      return true;
    }

    compileTimeConsts.set(name, value);
    return true;
  }

  const allocSoa = line.match(/^AlocSOAx([A-Za-z_][A-Za-z0-9_]*)x([A-Za-z_][A-Za-z0-9_]*)xy(\d+)$/)
    || line.match(/^AlocSOAx([A-Za-z_][A-Za-z0-9_]*)x([A-Za-z_][A-Za-z0-9_]*)x(\d+)$/);
  if (allocSoa) {
    const [, structName, instanceName, countRaw] = allocSoa;
    const structDef = structDefinitions.get(structName);
    if (!structDef) {
      createError(`AlocSOA falhou: struct '${structName}' não foi definida.`);
      return true;
    }

    if (soaVars.has(instanceName)) {
      createError(`AlocSOA duplicado para instância '${instanceName}'.`);
      return true;
    }

    const count = Number.parseInt(countRaw, 10);
    if (!Number.isInteger(count) || count <= 0) {
      createError(`AlocSOA inválido: quantidade '${countRaw}' em ${line}`);
      return true;
    }

    const propPointers = new Map();
    for (const prop of structDef.props) {
      const ptrName = `%${instanceName}_${prop.name}`;
      emitInstruction(`${ptrName} = alloca [${count} x ${prop.type}]`);
      propPointers.set(prop.name, {
        ptr: ptrName,
        llvmType: prop.type,
      });
    }

    soaVars.set(instanceName, {
      structName,
      count,
      propPointers,
    });
    return true;
  }

  const decl = line.match(/^DefVar(In)(Sd|Ud)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([^\s]+)$/);
  if (decl) {
    const [, , , bits, name, valueRaw] = decl;
    const llvmType = bits === '32' ? 'i32' : 'i64';
    const value = parseDeclarationValue(valueRaw, llvmType, false);
    if (value === null) {
      createError(`DefVar inválido para ${llvmType}: ${line}`);
      return true;
    }

    const ptr = nextReg();
    emitInstruction(`${ptr} = alloca ${llvmType}`);
    emitInstruction(`store ${llvmType} ${value}, ${llvmType}* ${ptr}`);
    numericVars.set(name, { llvmType, ptr });
    return true;
  }

  const declFloat = line.match(/^DefVar(Fl)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([^\s]+)$/);
  if (declFloat) {
    const [, , bits, name, valueRaw] = declFloat;
    const llvmType = bits === '32' ? 'float' : 'double';
    const value = parseDeclarationValue(valueRaw, llvmType, true);
    if (value === null) {
      createError(`DefVar inválido para ${llvmType}: ${line}`);
      return true;
    }

    const ptr = nextReg();
    emitInstruction(`${ptr} = alloca ${llvmType}`);
    emitInstruction(`store ${llvmType} ${value}, ${llvmType}* ${ptr}`);
    numericVars.set(name, { llvmType, ptr });
    return true;
  }

  const setInt = line.match(/^SetVar(In)(Sd|Ud)(32|64)x(.+?)y([^\s]+)$/);
  if (setInt) {
    const [, , , bits, targetRaw, valueRaw] = setInt;
    const llvmType = bits === '32' ? 'i32' : 'i64';

    const valueRes = resolveNumericOperand(valueRaw, llvmType, false);
    if (valueRes.error) {
      createError(valueRes.error);
      return true;
    }

    const soaTarget = resolveSoaPropertyPointer(targetRaw, llvmType);
    if (soaTarget) {
      if (soaTarget.error) {
        createError(soaTarget.error);
        return true;
      }

      emitInstruction(`store ${llvmType} ${valueRes.value}, ${llvmType}* ${soaTarget.ptr}`);
      lastNumericValue = { reg: valueRes.value, llvmType };
      return true;
    }

    const target = numericVars.get(targetRaw);
    if (!target) {
      createError(`SetVar falhou: variável '${targetRaw}' não foi definida.`);
      return true;
    }
    if (target.llvmType !== llvmType) {
      createError(`SetVar incompatível: '${targetRaw}' é ${target.llvmType}, comando usa ${llvmType}.`);
      return true;
    }

    emitInstruction(`store ${llvmType} ${valueRes.value}, ${llvmType}* ${target.ptr}`);
    lastNumericValue = { reg: valueRes.value, llvmType };
    return true;
  }

  const setFloat = line.match(/^SetVar(Fl)(32|64)x(.+?)y([^\s]+)$/);
  if (setFloat) {
    const [, , bits, targetRaw, valueRaw] = setFloat;
    const llvmType = bits === '32' ? 'float' : 'double';

    const valueRes = resolveNumericOperand(valueRaw, llvmType, true);
    if (valueRes.error) {
      createError(valueRes.error);
      return true;
    }

    const soaTarget = resolveSoaPropertyPointer(targetRaw, llvmType);
    if (soaTarget) {
      if (soaTarget.error) {
        createError(soaTarget.error);
        return true;
      }

      emitInstruction(`store ${llvmType} ${valueRes.value}, ${llvmType}* ${soaTarget.ptr}`);
      lastNumericValue = { reg: valueRes.value, llvmType };
      return true;
    }

    const target = numericVars.get(targetRaw);
    if (!target) {
      createError(`SetVar falhou: variável '${targetRaw}' não foi definida.`);
      return true;
    }
    if (target.llvmType !== llvmType) {
      createError(`SetVar incompatível: '${targetRaw}' é ${target.llvmType}, comando usa ${llvmType}.`);
      return true;
    }

    emitInstruction(`store ${llvmType} ${valueRes.value}, ${llvmType}* ${target.ptr}`);
    lastNumericValue = { reg: valueRes.value, llvmType };
    return true;
  }

  const readInt = line.match(/^LerEntradaIn(Sd|Ud)(32|64)x([A-Za-z_][A-Za-z0-9_]*)$/);
  if (readInt) {
    const [, , bits, name] = readInt;
    const llvmType = bits === '32' ? 'i32' : 'i64';
    const target = numericVars.get(name);
    if (!target) {
      createError(`LerEntrada falhou: variável '${name}' não foi definida.`);
      return true;
    }
    if (target.llvmType !== llvmType) {
      createError(`LerEntrada incompatível: '${name}' é ${target.llvmType}, comando usa ${llvmType}.`);
      return true;
    }

    hasScanf = true;
    const fmtInfo = createGlobalString(bits === '32' ? '%d' : '%lld', 'scanfmt');
    const fmtPtr = pointerToGlobal(fmtInfo);
    emitInstruction(`call i32 (i8*, ...) @scanf(i8* ${fmtPtr}, ${llvmType}* ${target.ptr})`);
    return true;
  }

  const textDef = line.match(/^DefTxtx([A-Za-z_][A-Za-z0-9_]*)yl'([^']*)'$/);
  if (textDef) {
    const [, name, raw] = textDef;
    textVars.set(name, decodeTomString(raw));
    return true;
  }

  const textSet = line.match(/^SetTxtx([A-Za-z_][A-Za-z0-9_]*)yl'([^']*)'$/);
  if (textSet) {
    const [, name, raw] = textSet;
    if (!textVars.has(name)) {
      createError(`SetTxt falhou: texto '${name}' não foi definido.`);
      return true;
    }
    textVars.set(name, decodeTomString(raw));
    return true;
  }

  const textConcat = line.match(/^SomarTxtx([A-Za-z_][A-Za-z0-9_]*)yl'([^']*)'$/);
  if (textConcat) {
    const [, name, raw] = textConcat;
    if (!textVars.has(name)) {
      createError(`SomarTxt falhou: texto '${name}' não foi definido.`);
      return true;
    }
    textVars.set(name, `${textVars.get(name)}${decodeTomString(raw)}`);
    return true;
  }

  return false;
}

function emitZoneOperation(line) {
  const zoneDef = line.match(/^ZonaDefx([A-Za-z_][A-Za-z0-9_]*)y(\d+)$/);
  if (zoneDef) {
    const [, zoneName, sizeRaw] = zoneDef;
    const size = Number.parseInt(sizeRaw, 10);
    if (!Number.isInteger(size) || size <= 0) {
      createError(`ZonaDef inválido: tamanho '${sizeRaw}' em ${line}`);
      return true;
    }

    if (zoneState.has(zoneName)) {
      createError(`ZonaDef duplicado para '${zoneName}'.`);
      return true;
    }

    const llvmGlobal = `@tom_zone_${zoneName}`;
    globals.push(`${llvmGlobal} = global [${size} x i8] zeroinitializer`);
    zoneState.set(zoneName, {
      size,
      offset: 0,
      llvmGlobal,
      allocatedVars: new Set(),
    });
    return true;
  }

  const defZoneInt = line.match(/^DefZnIn(?:Sd|Ud)?32x([A-Za-z_][A-Za-z0-9_]*)y([^\s]+)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (defZoneInt) {
    const [, name, valueRaw, zoneName] = defZoneInt;
    const zone = zoneState.get(zoneName);
    if (!zone) {
      createError(`DefZnIn32 falhou: zona '${zoneName}' não foi definida.`);
      return true;
    }

    if (numericVars.has(name) || compileTimeConsts.has(name)) {
      createError(`DefZnIn32 duplicado para variável '${name}'.`);
      return true;
    }

    const bytesNeeded = 4;
    if ((zone.offset + bytesNeeded) > zone.size) {
      createError(`DefZnIn32 falhou: zona '${zoneName}' sem espaço (offset=${zone.offset}, tamanho=${zone.size}).`);
      return true;
    }

    const valueRes = resolveNumericOperand(valueRaw, 'i32', false);
    if (valueRes.error) {
      createError(valueRes.error);
      return true;
    }

    const bytePtr = nextReg();
    emitInstruction(
      `${bytePtr} = getelementptr inbounds [${zone.size} x i8], [${zone.size} x i8]* ${zone.llvmGlobal}, i64 0, i64 ${zone.offset}`,
    );
    const intPtr = nextReg();
    emitInstruction(`${intPtr} = bitcast i8* ${bytePtr} to i32*`);
    emitInstruction(`store i32 ${valueRes.value}, i32* ${intPtr}`);

    numericVars.set(name, { llvmType: 'i32', ptr: intPtr });
    zone.allocatedVars.add(name);
    zone.offset += bytesNeeded;
    return true;
  }

  const zoneReset = line.match(/^ZonaRstx([A-Za-z_][A-Za-z0-9_]*)$/);
  if (zoneReset) {
    const [, zoneName] = zoneReset;
    const zone = zoneState.get(zoneName);
    if (!zone) {
      createError(`ZonaRst falhou: zona '${zoneName}' não foi definida.`);
      return true;
    }

    for (const varName of zone.allocatedVars) {
      numericVars.delete(varName);
    }
    zone.allocatedVars.clear();
    zone.offset = 0;
    return true;
  }

  return false;
}

function emitStringOperation(line) {
  const defStack = line.match(/^DefStkFB(\d+)(C|U)?x([A-Za-z_][A-Za-z0-9_]*)yl'([^']*)'$/);
  if (defStack) {
    const [, capacityRaw, safetyRaw, name, initialRaw] = defStack;
    const capacity = Number.parseInt(capacityRaw, 10);
    const checked = !safetyRaw || safetyRaw === 'C';
    const initial = decodeTomString(initialRaw);
    const textBytes = Buffer.byteLength(initial, 'utf8') + 1;

    if (checked && textBytes > capacity) {
      createError(`DefStkFB${capacity}C excedeu capacidade de '${name}' (${textBytes - 1} bytes).`);
      return true;
    }

    buffers.set(name, { text: initial, capacity, checked });
    const strInfo = createGlobalString(initial, 'buf');
    lastTextPointer = pointerToGlobal(strInfo);
    lastTextLength = strInfo.len;
    return true;
  }

  const appendStack = line.match(/^SomarlFB(\d+)(C|U)?x([A-Za-z_][A-Za-z0-9_]*)yl'([^']*)'$/);
  if (appendStack) {
    const [, capacityRaw, safetyRaw, name, chunkRaw] = appendStack;
    const capacity = Number.parseInt(capacityRaw, 10);
    const checked = !safetyRaw || safetyRaw === 'C';
    const chunk = decodeTomString(chunkRaw);
    const current = buffers.get(name);

    if (!current) {
      createError(`Buffer '${name}' não foi definido antes de SomarlFB.`);
      return true;
    }

    if (current.capacity !== capacity || current.checked !== checked) {
      createError(`SomarlFB em '${name}' não corresponde à configuração do DefStk (${line}).`);
      return true;
    }

    const merged = `${current.text}${chunk}`;
    const textBytes = Buffer.byteLength(merged, 'utf8') + 1;
    if (checked && textBytes > capacity) {
      createError(`SomarlFB${capacity}C causou overflow em '${name}' (${textBytes - 1} bytes).`);
      return true;
    }

    buffers.set(name, { ...current, text: merged });
    const strInfo = createGlobalString(merged, 'buf');
    lastTextPointer = pointerToGlobal(strInfo);
    lastTextLength = strInfo.len;
    return true;
  }

  const sm = line.match(/^Somarl(I8|UT|FB(\d+)(C|U)?)xyxl'([^']*)'yl'([^']*)'$/);
  if (!sm) return false;

  const [, mode, fbSizeRaw, safetyRaw, left, right] = sm;
  const text = `${decodeTomString(left)}${decodeTomString(right)}`;

  if (mode.startsWith('FB')) {
    const capacity = Number.parseInt(fbSizeRaw, 10);
    const checked = !safetyRaw || safetyRaw === 'C';
    const textBytes = Buffer.byteLength(text, 'utf8') + 1;

    if (checked && textBytes > capacity) {
      hasExit = true;
      const errInfo = createGlobalString(`Erro FB${capacity}C: overflow de buffer (${textBytes - 1} bytes).`, 'err');
      const errPtr = pointerToGlobal(errInfo);
      hasPrintf = true;
      emitInstruction(`call i32 (i8*, ...) @printf(i8* ${errPtr})`);
      emitInstruction('call void @exit(i32 1)');
    }
  }

  const strInfo = createGlobalString(text, 'concat');
  const strPtr = pointerToGlobal(strInfo);

  lastTextPointer = strPtr;
  lastTextLength = strInfo.len;
  return true;
}

function emitText(line) {
  if (line === 'GerarTxtUltimo') {
    hasPrintf = true;
    if (!lastTextPointer) {
      const empty = createGlobalString('', 'empty');
      lastTextPointer = pointerToGlobal(empty);
    }
    emitInstruction(`call i32 (i8*, ...) @printf(i8* ${lastTextPointer})`);
    return true;
  }

  const lm = line.match(/^GerarTxtxl'([^']*)'$/);
  if (lm) {
    const txt = decodeTomString(lm[1]);
    const info = createGlobalString(txt, 'txt');
    const ptr = pointerToGlobal(info);
    hasPrintf = true;
    emitInstruction(`call i32 (i8*, ...) @printf(i8* ${ptr})`);
    return true;
  }

  const vm = line.match(/^GerarTxtx([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!vm) return false;

  const [, name] = vm;
  const bufferText = buffers.get(name)?.text;
  const namedText = textVars.get(name);
  const printable = bufferText ?? namedText;
  if (printable === undefined) {
    createError(`GerarTxtx${name} falhou: texto/buffer não encontrado.`);
    return true;
  }

  const info = createGlobalString(printable, 'txt');
  const ptr = pointerToGlobal(info);
  hasPrintf = true;
  emitInstruction(`call i32 (i8*, ...) @printf(i8* ${ptr})`);
  return true;
}

function emitGpuOperation(line) {
  const createBuffer = line.match(/^GpuBufCriar(Fl|In)(32|64)x(\d+)y([A-Za-z_][A-Za-z0-9_]*)$/);
  if (createBuffer) {
    const [, typePrefix, bits, countRaw, name] = createBuffer;
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isInteger(count) || count <= 0) {
      createError(`GpuBufCriar inválido: quantidade '${countRaw}' em ${line}`);
      return true;
    }

    if (gpuState.buffers.has(name)) {
      createError(`GpuBufCriar duplicado para buffer '${name}'.`);
      return true;
    }

    const scalarType = `${typePrefix}${bits}`;
    const bufferConfig = { scalarType, count, llvmPtr: null };
    if (scalarType === 'In32' || scalarType === 'Fl32') {
      const llvmScalar = scalarType === 'In32' ? 'i32' : 'float';
      const allocaReg = nextReg();
      emitInstruction(`${allocaReg} = alloca [${count} x ${llvmScalar}]`);
      const ptrReg = nextReg();
      emitInstruction(`${ptrReg} = getelementptr inbounds [${count} x ${llvmScalar}], [${count} x ${llvmScalar}]* ${allocaReg}, i64 0, i64 0`);
      bufferConfig.llvmPtr = ptrReg;
    }

    gpuState.buffers.set(name, bufferConfig);
    emitInstruction(`; TOM_GPU_BUFFER_CREATE name=${name} type=${scalarType} count=${count}`);
    return true;
  }


  const loadImage = line.match(/^GpuCarregarImgx([A-Za-z_][A-Za-z0-9_]*)x(l'([^']*)')$/);
  if (loadImage) {
    const [, bufferName, , pathLiteral] = loadImage;
    const target = gpuState.buffers.get(bufferName);
    if (!target) {
      createError(`GpuCarregarImg falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }
    if (target.scalarType !== 'In32') {
      createError(`GpuCarregarImg exige buffer In32. '${bufferName}' está como ${target.scalarType}.`);
      return true;
    }
    if (target.count < 3) {
      createError(`GpuCarregarImg exige buffer com no mínimo 3 inteiros. '${bufferName}' possui ${target.count}.`);
      return true;
    }
    if (!target.llvmPtr) {
      createError(`GpuCarregarImg falhou: ponteiro LLVM do buffer '${bufferName}' indisponível.`);
      return true;
    }

    const imagePath = decodeTomString(pathLiteral);
    const strInfo = createGlobalString(imagePath, 'img_path');
    const strPtr = pointerToGlobal(strInfo);
    hasTomGpuLoadImage = true;
    emitInstruction(`call void @TomGpu_CarregarImagem(i8* ${strPtr}, i32* ${target.llvmPtr}, i32 ${target.count - 2}, i32 1)`);
    return true;
  }

  const readInput = line.match(/^GpuLerInputIn32xBufferDestinox([A-Za-z_][A-Za-z0-9_]*)$/);
  if (readInput) {
    const [, bufferName] = readInput;
    const target = gpuState.buffers.get(bufferName);
    if (!target) {
      createError(`GpuLerInput falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }

    if (target.scalarType !== 'In32') {
      createError(`GpuLerInput exige buffer In32. '${bufferName}' está como ${target.scalarType}.`);
      return true;
    }

    if (target.count < 300) {
      createError(`GpuLerInput exige buffer com no mínimo 300 inteiros. '${bufferName}' possui ${target.count}.`);
      return true;
    }

    if (!target.llvmPtr) {
      createError(`GpuLerInput falhou: ponteiro LLVM do buffer '${bufferName}' indisponível.`);
      return true;
    }

    hasTomGpuReadInput = true;
    emitInstruction(`call void @TomGpu_LerInput(i32* ${target.llvmPtr})`);
    return true;
  }


  const readDelta = line.match(/^GpuLerTempoxVarDt([A-Za-z_][A-Za-z0-9_]*)$/);
  if (readDelta) {
    const [, varName] = readDelta;
    const variable = numericVars.get(varName);
    if (!variable) {
      createError(`GpuLerTempo falhou: variável '${varName}' não foi definida.`);
      return true;
    }
    if (variable.llvmType !== 'float') {
      createError(`GpuLerTempo exige variável Fl32. '${varName}' está como ${variable.llvmType}.`);
      return true;
    }

    const dtReg = nextReg();
    hasTomGpuReadDelta = true;
    emitInstruction(`${dtReg} = call float @TomGpu_ObterDeltaTempo()`);
    emitInstruction(`store float ${dtReg}, float* ${variable.ptr}`);
    lastNumericValue = { reg: dtReg, llvmType: 'float' };
    return true;
  }

  const present = line.match(/^GpuApresentarx([A-Za-z_][A-Za-z0-9_]*)x([^\s]+)x([^\s]+)$/);
  if (present) {
    const [, bufferName, widthRaw, heightRaw] = present;
    const source = gpuState.buffers.get(bufferName);
    if (!source) {
      createError(`GpuApresentar falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }

    if (source.scalarType !== 'In32') {
      createError(`GpuApresentar exige buffer In32. '${bufferName}' está como ${source.scalarType}.`);
      return true;
    }

    if (!source.llvmPtr) {
      createError(`GpuApresentar falhou: ponteiro LLVM do buffer '${bufferName}' indisponível.`);
      return true;
    }

    const width = resolveNumericOperand(widthRaw, 'i32', false);
    const height = resolveNumericOperand(heightRaw, 'i32', false);
    if (width.error || height.error) {
      createError(width.error || height.error);
      return true;
    }

    hasTomGpuPresent = true;
    emitInstruction(`call void @TomGpu_Present(i32* ${source.llvmPtr}, i32 ${width.value}, i32 ${height.value})`);
    trackSystemCost(OP_COSTS.GpuApresentar);
    return true;
  }

  const upload = line.match(/^GpuEnv(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)[xX]([A-Za-z_][A-Za-z0-9_]*)$/);
  if (upload) {
    const [, typePrefix, bits, hostVar, gpuBuffer] = upload;
    const scalarType = `${typePrefix}${bits}`;
    const target = gpuState.buffers.get(gpuBuffer);
    if (!target) {
      createError(`GpuEnv falhou: buffer '${gpuBuffer}' não foi criado.`);
      return true;
    }
    if (target.scalarType !== scalarType) {
      createError(`GpuEnv incompatível: ${scalarType} para '${gpuBuffer}' (${target.scalarType}).`);
      return true;
    }

    gpuState.hostUploads.push({ scalarType, hostVar, gpuBuffer });
    emitInstruction(`; TOM_GPU_UPLOAD type=${scalarType} host=${hostVar} device=${gpuBuffer}`);
    trackSystemCost(OP_COSTS.GpuEnv);
    return true;
  }

  const queueAudio = line.match(/^GpuEnfileirarAudioFl32x([A-Za-z_][A-Za-z0-9_]*)x([^\s]+)$/);
  if (queueAudio) {
    const [, bufferName, countRaw] = queueAudio;
    const source = gpuState.buffers.get(bufferName);
    if (!source) {
      createError(`GpuEnfileirarAudio falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }
    if (source.scalarType !== 'Fl32') {
      createError(`GpuEnfileirarAudio exige buffer Fl32. '${bufferName}' está como ${source.scalarType}.`);
      return true;
    }
    if (!source.llvmPtr) {
      createError(`GpuEnfileirarAudio falhou: ponteiro LLVM do buffer '${bufferName}' indisponível.`);
      return true;
    }

    const count = resolveNumericOperand(countRaw, 'i32', false);
    if (count.error) {
      createError(count.error);
      return true;
    }

    hasTomGpuQueueAudio = true;
    emitInstruction(`call void @TomGpu_EnfileirarAudio(float* ${source.llvmPtr}, i32 ${count.value})`);
    return true;
  }

  const download = line.match(/^GpuRec(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)$/);
  if (download) {
    const [, typePrefix, bits, gpuBuffer, hostVar] = download;
    const scalarType = `${typePrefix}${bits}`;
    const source = gpuState.buffers.get(gpuBuffer);
    if (!source) {
      createError(`GpuRec falhou: buffer '${gpuBuffer}' não foi criado.`);
      return true;
    }
    if (source.scalarType !== scalarType) {
      createError(`GpuRec incompatível: ${scalarType} para '${gpuBuffer}' (${source.scalarType}).`);
      return true;
    }

    gpuState.hostDownloads.push({ scalarType, gpuBuffer, hostVar });
    emitInstruction(`; TOM_GPU_DOWNLOAD type=${scalarType} device=${gpuBuffer} host=${hostVar}`);
    trackSystemCost(OP_COSTS.GpuRec);
    return true;
  }

  const kernelStart = line.match(/^DefKernelx([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelStart) {
    const [, kernelName] = kernelStart;
    if (gpuState.currentKernel) {
      createError(`DefKernel aninhado não suportado: '${kernelName}' dentro de '${gpuState.currentKernel.name}'.`);
      return true;
    }

    const kernel = { name: kernelName, ops: [], branchDepth: 0 };
    gpuState.currentKernel = kernel;
    gpuState.kernels.set(kernelName, kernel);
    gpuState.kernelOrder.push(kernelName);
    emitInstruction(`; TOM_GPU_KERNEL_BEGIN name=${kernelName}`);
    return true;
  }

  if (line === 'FimDef') {
    if (!gpuState.currentKernel) {
      createError('FimDef encontrado sem DefKernel ativo.');
      return true;
    }

    if (gpuState.currentKernel.branchDepth > 0) {
      createError(`Kernel '${gpuState.currentKernel.name}' finalizado com ${gpuState.currentKernel.branchDepth} bloco(s) GpuSeMaior sem GpuFimSe.`);
      return true;
    }

    emitInstruction(`; TOM_GPU_KERNEL_END name=${gpuState.currentKernel.name}`);
    gpuState.currentKernel = null;
    return true;
  }

  const dispatchAsync = line.match(/^GpuDispAsyncx([A-Za-z_][A-Za-z0-9_]*)x(\d+)y(\d+)z(\d+)$/);
  if (dispatchAsync) {
    const [, kernelName, xRaw, yRaw, zRaw] = dispatchAsync;
    const dims = [xRaw, yRaw, zRaw].map((value) => Number.parseInt(value, 10));
    if (dims.some((value) => !Number.isInteger(value) || value <= 0)) {
      createError(`GpuDispAsync inválido: dimensões devem ser inteiros positivos (${line}).`);
      return true;
    }

    if (!gpuState.kernels.has(kernelName)) {
      createError(`GpuDispAsync falhou: kernel '${kernelName}' não foi definido.`);
      return true;
    }

    gpuState.dispatches.push({ kernelName, x: dims[0], y: dims[1], z: dims[2], async: true });
    emitInstruction(`; TOM_GPU_DISPATCH_ASYNC kernel=${kernelName} x=${dims[0]} y=${dims[1]} z=${dims[2]}`);
    return true;
  }

  const dispatch = line.match(/^GpuDispx([A-Za-z_][A-Za-z0-9_]*)x(\d+)y(\d+)z(\d+)$/);
  if (dispatch) {
    const [, kernelName, xRaw, yRaw, zRaw] = dispatch;
    const dims = [xRaw, yRaw, zRaw].map((value) => Number.parseInt(value, 10));
    if (dims.some((value) => !Number.isInteger(value) || value <= 0)) {
      createError(`GpuDisp inválido: dimensões devem ser inteiros positivos (${line}).`);
      return true;
    }

    if (!gpuState.kernels.has(kernelName)) {
      createError(`GpuDisp falhou: kernel '${kernelName}' não foi definido.`);
      return true;
    }

    gpuState.dispatches.push({ kernelName, x: dims[0], y: dims[1], z: dims[2], async: false });
    emitInstruction(`; TOM_GPU_DISPATCH kernel=${kernelName} x=${dims[0]} y=${dims[1]} z=${dims[2]}`);
    return true;
  }

  if (line === 'GpuFence' || line === 'AguardarGpu') {
    gpuState.fences.push({ kind: 'wait', command: line });
    emitInstruction('; TOM_GPU_FENCE_WAIT');
    return true;
  }

  if (!gpuState.currentKernel) return false;

  const kernelId = line.match(/^GpuIdObtIn32x([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelId) {
    const [, idVar] = kernelId;
    gpuState.currentKernel.ops.push({ kind: 'id', idVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=id var=${idVar}`);
    return true;
  }

  const kernelBranchStart = line.match(/^GpuSeMaiorxVarAyVarBx([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelBranchStart) {
    const [, leftVar, rightVar] = kernelBranchStart;
    gpuState.currentKernel.ops.push({ kind: 'branch_start', leftVar, rightVar });
    gpuState.currentKernel.branchDepth += 1;
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=branch_start left=${leftVar} right=${rightVar}`);
    return true;
  }

  if (line === 'GpuFimSe') {
    if (gpuState.currentKernel.branchDepth <= 0) {
      createError(`GpuFimSe sem GpuSeMaior correspondente no kernel '${gpuState.currentKernel.name}'.`);
      return true;
    }
    gpuState.currentKernel.ops.push({ kind: 'branch_end' });
    gpuState.currentKernel.branchDepth -= 1;
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=branch_end`);
    return true;
  }

  const kernelLoad = line.match(/^GpuLerVec4(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelLoad) {
    const [, typePrefix, bits, bufferName, indexVar, outVar] = kernelLoad;
    if (!gpuState.buffers.has(bufferName)) {
      createError(`GpuLer falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }

    const scalarType = `${typePrefix}${bits}`;
    gpuState.currentKernel.ops.push({ kind: 'load_vec4', scalarType, bufferName, indexVar, outVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=load_vec4 type=${scalarType} buffer=${bufferName} index=${indexVar} out=${outVar}`);
    return true;
  }

  const kernelStore = line.match(/^GpuEscrVec4(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelStore) {
    const [, typePrefix, bits, bufferName, indexVar, inVar] = kernelStore;
    if (!gpuState.buffers.has(bufferName)) {
      createError(`GpuEscr falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }

    const scalarType = `${typePrefix}${bits}`;
    gpuState.currentKernel.ops.push({ kind: 'store_vec4', scalarType, bufferName, indexVar, inVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=store_vec4 type=${scalarType} buffer=${bufferName} index=${indexVar} in=${inVar}`);
    return true;
  }

  const kernelLoadScalar = line.match(/^GpuLer(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelLoadScalar) {
    const [, typePrefix, bits, bufferName, indexVar, outVar] = kernelLoadScalar;
    const buffer = gpuState.buffers.get(bufferName);
    const scalarType = `${typePrefix}${bits}`;
    if (!buffer) {
      createError(`GpuLer${scalarType} falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }
    if (buffer.scalarType !== scalarType) {
      createError(`GpuLer${scalarType} exige buffer ${scalarType}. '${bufferName}' está como ${buffer.scalarType}.`);
      return true;
    }

    gpuState.currentKernel.ops.push({ kind: 'load_scalar', scalarType, bufferName, indexVar, outVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=load_scalar type=${scalarType} buffer=${bufferName} index=${indexVar} out=${outVar}`);
    return true;
  }

  const kernelStoreScalar = line.match(/^GpuEscr(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelStoreScalar) {
    const [, typePrefix, bits, bufferName, indexVar, inVar] = kernelStoreScalar;
    const buffer = gpuState.buffers.get(bufferName);
    const scalarType = `${typePrefix}${bits}`;
    if (!buffer) {
      createError(`GpuEscr${scalarType} falhou: buffer '${bufferName}' não foi criado.`);
      return true;
    }
    if (buffer.scalarType !== scalarType) {
      createError(`GpuEscr${scalarType} exige buffer ${scalarType}. '${bufferName}' está como ${buffer.scalarType}.`);
      return true;
    }

    gpuState.currentKernel.ops.push({ kind: 'store_scalar', scalarType, bufferName, indexVar, inVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=store_scalar type=${scalarType} buffer=${bufferName} index=${indexVar} in=${inVar}`);
    return true;
  }

  const kernelMathScalar = line.match(/^(Somar|Subtr|Multi|Divid)(Fl|In)(32|64)x(@?[A-Za-z_][A-Za-z0-9_]*)y(@?[A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelMathScalar) {
    const [, op, typePrefix, bits, leftRaw, rightRaw, outVar] = kernelMathScalar;
    const leftVar = leftRaw.startsWith('@') ? leftRaw.slice(1) : leftRaw;
    const rightVar = rightRaw.startsWith('@') ? rightRaw.slice(1) : rightRaw;
    const scalarType = `${typePrefix}${bits}`;
    gpuState.currentKernel.ops.push({ kind: 'math_scalar', op, scalarType, leftVar, rightVar, outVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=${op.toLowerCase()}_scalar type=${scalarType} left=${leftVar} right=${rightVar} out=${outVar}`);
    return true;
  }

  const kernelSinFl32 = line.match(/^GpuMathSinFl32x(@?[A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelSinFl32) {
    const [, inRaw, outVar] = kernelSinFl32;
    const inVar = inRaw.startsWith('@') ? inRaw.slice(1) : inRaw;
    gpuState.currentKernel.ops.push({ kind: 'sin_scalar', scalarType: 'Fl32', inVar, outVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=sin_scalar type=Fl32 in=${inVar} out=${outVar}`);
    return true;
  }

  const kernelMath = line.match(/^(Somar|Subtr|Multi|Divid)Vec4(Fl|In)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([A-Za-z_][A-Za-z0-9_]*)z([A-Za-z_][A-Za-z0-9_]*)$/);
  if (kernelMath) {
    const [, op, typePrefix, bits, leftVar, rightVar, outVar] = kernelMath;
    const scalarType = `${typePrefix}${bits}`;
    gpuState.currentKernel.ops.push({ kind: 'math_vec4', op, scalarType, leftVar, rightVar, outVar });
    emitInstruction(`; TOM_GPU_KERNEL_OP kernel=${gpuState.currentKernel.name} op=${op.toLowerCase()}_vec4 type=${scalarType} left=${leftVar} right=${rightVar} out=${outVar}`);
    return true;
  }

  createError(`Comando de kernel não reconhecido: ${line}`);
  return true;
}

emitRuntimeBudgetPrelude();

for (const line of lines) {
  if (emitStructDefinition(line)) continue;
  if (emitControlFlow(line)) continue;
  if (emitGpuOperation(line)) continue;
  if (emitBudgetDirective(line)) continue;
  if (emitZoneOperation(line)) continue;
  if (emitDataOperation(line)) continue;
  if (emitNumericOperation(line)) continue;
  if (emitVectorOperation(line)) continue;
  if (emitStringOperation(line)) continue;
  if (emitText(line)) continue;

  createError(`Comando não reconhecido: ${line}`);
}

emitRuntimeBudgetEpilogue();
emitStaticBudgetWarnings();

if (!firstError && structState.currentDefinition) {
  createError(`DefStructSOA '${structState.currentDefinition.name}' não foi finalizado com FimDef.`);
}

if (!firstError && gpuState.currentKernel) {
  createError(`Kernel '${gpuState.currentKernel.name}' não foi finalizado com FimDef.`);
}

if (!firstError && controlState.scopeStack.length > 0) {
  const openScopes = controlState.scopeStack.map((scope) => scope.scopeName).join(', ');
  createError(`Escopos não finalizados: ${openScopes}`);
}

if (firstError) {
  const errInfo = createGlobalString(`Erro de compilação: ${firstError}\n`, 'fatal');
  const errPtr = pointerToGlobal(errInfo);
  hasPrintf = true;
  emitInstruction(`call i32 (i8*, ...) @printf(i8* ${errPtr})`);
  terminateCurrentBlock('ret i32 1');
}

const output = [];
if (globals.length > 0) {
  output.push(...globals);
}
if (hasPrintf) {
  output.push('declare i32 @printf(i8*, ...)');
}
if (hasScanf) {
  output.push('declare i32 @scanf(i8*, ...)');
}
if (hasSqrtf) {
  output.push('declare float @llvm.sqrt.f32(float)');
}
if (hasSqrt) {
  output.push('declare double @llvm.sqrt.f64(double)');
}
if (hasSinf) {
  output.push('declare float @llvm.sin.f32(float)');
}
if (hasExit) {
  output.push('declare void @exit(i32)');
}
if (hasTomGpuPresent) {
  output.push('declare void @TomGpu_Present(i32*, i32, i32)');
}
if (hasTomGpuReadInput) {
  output.push('declare void @TomGpu_LerInput(i32*)');
}
if (hasTomGpuQueueAudio) {
  output.push('declare void @TomGpu_EnfileirarAudio(float*, i32)');
}
if (hasTomGpuLoadImage) {
  output.push('declare void @TomGpu_CarregarImagem(i8*, i32*, i32, i32)');
}
if (hasTomGpuReadDelta) {
  output.push('declare float @TomGpu_ObterDeltaTempo()');
}
if (budgetState.runtimeInstrumentation || budgetState.systems.length > 0) {
  output.push('declare i64 @llvm.readcyclecounter()');
  output.push('declare void @TomBudgetManager_Report(i8*, i64)');
  output.push('@TomPerf_StressLevel = external global i32');
}

output.push('', 'define i32 @main() {', 'entry:');
output.push(...irLines);

if (!firstError && lastNumericValue && lastNumericValue.llvmType.startsWith('i')) {
  if (!controlState.blockTerminated) {
    output.push(`  ret ${lastNumericValue.llvmType} ${lastNumericValue.reg}`);
  }
} else if (!firstError) {
  if (!controlState.blockTerminated) {
    output.push('  ret i32 0');
  }
}

output.push('}');

const llvmOutput = `${output.join('\n')}\n`;
const outputPath = path.join(path.dirname(inputFile), 'output.ll');
fs.writeFileSync(outputPath, llvmOutput);

const mlirOutputPath = path.join(path.dirname(inputFile), 'output.mlir');
const mlirOutput = mlirState.vec4AddModules.length
  ? `${mlirState.vec4AddModules.map((moduleNode) => renderMlirModule(moduleNode)).join('\n\n')}\n`
  : 'module {\n  // Nenhuma operação Vec4In32 foi promovida para MLIR nesta compilação.\n}\n';
fs.writeFileSync(mlirOutputPath, mlirOutput);

const gpuManifest = buildGpuBackendManifest(inputFile);
const gpuManifestPath = path.join(path.dirname(inputFile), 'output.gpu.json');
if (gpuManifest) {
  fs.writeFileSync(gpuManifestPath, `${JSON.stringify(gpuManifest, null, 2)}\n`);
}

console.log(`Compilação concluída para '${inputFile}'. Arquivo '${outputPath}' gerado.`);
console.log(`Saída MLIR gerada em '${mlirOutputPath}'.`);
if (gpuManifest) {
  console.log(`Manifesto backend GPU gerado em '${gpuManifestPath}'.`);
}

if (budgetState.frameTargetFps || budgetState.systems.length || budgetState.priorities.length) {
  console.log('\nTom Live Budget (base híbrida):');
  if (budgetState.frameTargetFps) {
    console.log(`- Target FPS: ${budgetState.frameTargetFps}`);
  }
  if (budgetState.systems.length) {
    for (const system of budgetState.systems) {
      const estimated = budgetState.staticCostBySystem.get(system.name) || 0;
      const maxTomCycles = costToTomCycles(system.maxMs);
      console.log(`- Sistema ${system.name}: máx ${system.maxMs} ms/frame (~${maxTomCycles} TomCycles), estimado=${estimated} TomCycles`);
    }
  }
  if (budgetState.priorities.length) {
    for (const item of budgetState.priorities) {
      console.log(`- Prioridade ${item.name}: ${item.level}`);
    }
  }
  if (budgetState.staticWarnings.length) {
    for (const warning of budgetState.staticWarnings) {
      console.log(`- Warning WCET: ${warning}`);
    }
  }
}

if (gpuState.buffers.size || gpuState.kernelOrder.length || gpuState.dispatches.length || gpuState.fences.length) {
  console.log('\nTomGPU (base inicial):');
  if (gpuState.buffers.size) {
    for (const [name, cfg] of gpuState.buffers.entries()) {
      console.log(`- Buffer ${name}: ${cfg.scalarType} x ${cfg.count}`);
    }
  }
  if (gpuState.hostUploads.length) {
    for (const upload of gpuState.hostUploads) {
      console.log(`- Upload ${upload.hostVar} -> ${upload.gpuBuffer} (${upload.scalarType})`);
    }
  }
  if (gpuState.kernelOrder.length) {
    for (const kernelName of gpuState.kernelOrder) {
      const kernel = gpuState.kernels.get(kernelName);
      console.log(`- Kernel ${kernelName}: ${kernel.ops.length} operações`);
    }
  }
  if (gpuState.dispatches.length) {
    for (const dispatch of gpuState.dispatches) {
      const mode = dispatch.async ? 'async' : 'sync';
      console.log(`- Dispatch ${dispatch.kernelName}: (${dispatch.x}, ${dispatch.y}, ${dispatch.z}) [${mode}]`);
    }
  }

  if (gpuState.fences.length) {
    for (const fence of gpuState.fences) {
      console.log(`- Fence GPU: ${fence.command}`);
    }
  }
  if (gpuState.hostDownloads.length) {
    for (const download of gpuState.hostDownloads) {
      console.log(`- Download ${download.gpuBuffer} -> ${download.hostVar} (${download.scalarType})`);
    }
  }
}

if (firstError) {
  console.log(`Aviso: ${firstError}`);
}
console.log('\nConteúdo LLVM gerado:\n');
console.log(llvmOutput);
console.log('\nConteúdo MLIR gerado:\n');
console.log(mlirOutput);
