const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || 'teste.tom';
const sourceCode = fs.readFileSync(inputFile, 'utf-8');

const lines = sourceCode
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const irLines = [];
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
const textVars = new Map();
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
  currentKernel: null,
  backendManifestVersion: 1,
};
const controlState = {
  scopeStack: [],
  nextLabelId: 0,
  currentBlock: 'entry',
  blockTerminated: false,
};

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

function resolveNumericOperand(raw, llvmType, isFloat) {
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
  const source = numericVars.get(raw.slice(1));
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
  const pushConstants = new Set();
  const intExtRequired = Array.from(buffersByName.values()).some((buffer) => buffer.scalarType === 'In64');
  const float64ExtRequired = Array.from(buffersByName.values()).some((buffer) => buffer.scalarType === 'Fl64');

  function markExternalSymbol(symbol) {
    if (!symbol || declaredBuffers.has(symbol) || varTypes.has(symbol)) return;
    pushConstants.add(symbol);
  }

  glsl.push('#version 460');
  if (intExtRequired) glsl.push('#extension GL_EXT_shader_explicit_arithmetic_types_int64 : require');
  if (float64ExtRequired) glsl.push('#extension GL_ARB_gpu_shader_fp64 : require');
  glsl.push('');
  glsl.push('layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;');
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
    bindingIndex += 1;
  }

  glsl.push('');
  glsl.push('layout(push_constant) uniform TomPushConstants {');
  glsl.push('  int _placeholder;');
  glsl.push('} pc;');
  glsl.push('');
  glsl.push('void main() {');

  for (const op of kernel.ops) {
    if (op.kind === 'id') {
      varTypes.set(op.idVar, 'uint');
      glsl.push(`  uint ${op.idVar} = gl_GlobalInvocationID.x;`);
      continue;
    }

    if (op.kind === 'load_scalar') {
      const glslType = scalarToGlslType(op.scalarType);
      if (!glslType || !declaredBuffers.has(op.bufferName)) {
        unsupported.push(`load_scalar não suportado: ${op.scalarType} em ${op.bufferName}`);
        continue;
      }
      markExternalSymbol(op.indexVar);
      varTypes.set(op.outVar, glslType);
      glsl.push(`  ${glslType} ${op.outVar} = ${op.bufferName}.data[uint(${op.indexVar})];`);
      continue;
    }

    if (op.kind === 'store_scalar') {
      if (!declaredBuffers.has(op.bufferName)) {
        unsupported.push(`store_scalar sem buffer declarado: ${op.bufferName}`);
        continue;
      }
      markExternalSymbol(op.indexVar);
      markExternalSymbol(op.inVar);
      glsl.push(`  ${op.bufferName}.data[uint(${op.indexVar})] = ${op.inVar};`);
      continue;
    }

    if (op.kind === 'math_scalar') {
      const leftType = scalarToGlslType(op.scalarType) || varTypes.get(op.leftVar) || 'int';
      const operator = { Somar: '+', Subtr: '-', Multi: '*', Divid: '/' }[op.op];
      if (!operator) {
        unsupported.push(`math_scalar op não suportada: ${op.op}`);
        continue;
      }
      markExternalSymbol(op.leftVar);
      markExternalSymbol(op.rightVar);
      varTypes.set(op.outVar, leftType);
      glsl.push(`  ${leftType} ${op.outVar} = ${op.leftVar} ${operator} ${op.rightVar};`);
      continue;
    }


    if (op.kind === 'sin_scalar') {
      if (op.scalarType !== 'Fl32') {
        unsupported.push(`sin_scalar não suportado para ${op.scalarType}`);
        continue;
      }
      markExternalSymbol(op.inVar);
      varTypes.set(op.outVar, 'float');
      glsl.push(`  float ${op.outVar} = sin(${op.inVar});`);
      continue;
    }

    if (op.kind === 'load_vec4' || op.kind === 'store_vec4' || op.kind === 'math_vec4') {
      unsupported.push(`Operação vetorial ainda não traduzida para GLSL: ${op.kind}`);
      continue;
    }

    unsupported.push(`Operação de kernel desconhecida: ${op.kind}`);
  }

  glsl.push('}');

  if (pushConstants.size > 0) {
    const pcFields = Array.from(pushConstants).sort().map((name) => `  int ${name.replace(/^pc\./, '')};`).join('\n');
    const pcBlock = ['layout(push_constant) uniform TomPushConstants {', pcFields, '} pc;'].join('\n');
    for (let i = 0; i < glsl.length; i += 1) {
      if (glsl[i] === 'layout(push_constant) uniform TomPushConstants {') {
        glsl.splice(i, 3, ...pcBlock.split('\n'));
        break;
      }
    }
    for (let i = 0; i < glsl.length; i += 1) {
      if (!glsl[i].startsWith('  ')) continue;
      for (const name of pushConstants) {
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
      glsl[i] = glsl[i].replace(/^\s*int\s+pc\./, '  int ');
    }
  }

  return {
    source: glsl.join('\n'),
    unsupported,
  };
}


function buildGpuBackendManifest(inputPath) {
  if (!gpuState.buffers.size && !gpuState.kernelOrder.length && !gpuState.dispatches.length) {
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
  const numberOperand = '(@?[A-Za-z_][A-Za-z0-9_]*|-?\\d+(?:\\.\\d+)?)';
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

  const setInt = line.match(/^SetVar(In)(Sd|Ud)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([^\s]+)$/);
  if (setInt) {
    const [, , , bits, name, valueRaw] = setInt;
    const llvmType = bits === '32' ? 'i32' : 'i64';
    const target = numericVars.get(name);
    if (!target) {
      createError(`SetVar falhou: variável '${name}' não foi definida.`);
      return true;
    }
    if (target.llvmType !== llvmType) {
      createError(`SetVar incompatível: '${name}' é ${target.llvmType}, comando usa ${llvmType}.`);
      return true;
    }

    const valueRes = resolveNumericOperand(valueRaw, llvmType, false);
    if (valueRes.error) {
      createError(valueRes.error);
      return true;
    }

    emitInstruction(`store ${llvmType} ${valueRes.value}, ${llvmType}* ${target.ptr}`);
    lastNumericValue = { reg: valueRes.value, llvmType };
    return true;
  }

  const setFloat = line.match(/^SetVar(Fl)(32|64)x([A-Za-z_][A-Za-z0-9_]*)y([^\s]+)$/);
  if (setFloat) {
    const [, , bits, name, valueRaw] = setFloat;
    const llvmType = bits === '32' ? 'float' : 'double';
    const target = numericVars.get(name);
    if (!target) {
      createError(`SetVar falhou: variável '${name}' não foi definida.`);
      return true;
    }
    if (target.llvmType !== llvmType) {
      createError(`SetVar incompatível: '${name}' é ${target.llvmType}, comando usa ${llvmType}.`);
      return true;
    }

    const valueRes = resolveNumericOperand(valueRaw, llvmType, true);
    if (valueRes.error) {
      createError(valueRes.error);
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

    const kernel = { name: kernelName, ops: [] };
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

    emitInstruction(`; TOM_GPU_KERNEL_END name=${gpuState.currentKernel.name}`);
    gpuState.currentKernel = null;
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

    gpuState.dispatches.push({ kernelName, x: dims[0], y: dims[1], z: dims[2] });
    emitInstruction(`; TOM_GPU_DISPATCH kernel=${kernelName} x=${dims[0]} y=${dims[1]} z=${dims[2]}`);
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
  if (emitControlFlow(line)) continue;
  if (emitGpuOperation(line)) continue;
  if (emitBudgetDirective(line)) continue;
  if (emitDataOperation(line)) continue;
  if (emitNumericOperation(line)) continue;
  if (emitVectorOperation(line)) continue;
  if (emitStringOperation(line)) continue;
  if (emitText(line)) continue;

  createError(`Comando não reconhecido: ${line}`);
}

emitRuntimeBudgetEpilogue();
emitStaticBudgetWarnings();

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

const gpuManifest = buildGpuBackendManifest(inputFile);
const gpuManifestPath = path.join(path.dirname(inputFile), 'output.gpu.json');
if (gpuManifest) {
  fs.writeFileSync(gpuManifestPath, `${JSON.stringify(gpuManifest, null, 2)}\n`);
}

console.log(`Compilação concluída para '${inputFile}'. Arquivo '${outputPath}' gerado.`);
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

if (gpuState.buffers.size || gpuState.kernelOrder.length || gpuState.dispatches.length) {
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
      console.log(`- Dispatch ${dispatch.kernelName}: (${dispatch.x}, ${dispatch.y}, ${dispatch.z})`);
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
console.log('\nConteúdo gerado:\n');
console.log(llvmOutput);
