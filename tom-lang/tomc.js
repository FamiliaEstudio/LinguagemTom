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
let lastNumericValue = null;
let lastTextPointer = null;
let lastTextLength = 0;
let firstError = null;
const buffers = new Map();
const budgetState = {
  frameTargetFps: null,
  systems: [],
  priorities: [],
};

function nextReg() {
  regCount += 1;
  return `%r${regCount}`;
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
  irLines.push(
    `  ${reg} = getelementptr inbounds [${globalInfo.len} x i8], [${globalInfo.len} x i8]* ${globalInfo.name}, i64 0, i64 0`,
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


function emitBudgetDirective(line) {
  const frame = line.match(/^DefBudgetFramexyTargetFPSy(\d+)$/);
  if (frame) {
    const fps = Number.parseInt(frame[1], 10);
    if (!Number.isInteger(fps) || fps <= 0) {
      createError(`DefBudgetFrame inválido: ${line}`);
      return true;
    }

    budgetState.frameTargetFps = fps;
    irLines.push(`  ; TOM_BUDGET_FRAME target_fps=${fps}`);
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

    budgetState.systems.push({ name, maxMs });
    irLines.push(`  ; TOM_BUDGET_SYSTEM name=${name} max_ms=${maxMs}`);
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
    irLines.push(`  ; TOM_BUDGET_PRIORITY name=${name} level=${level}`);
    return true;
  }

  return false;
}

function emitNumericOperation(line) {
  const mathRegex = /^(Somar|Subtr|Multi|Divid)xy(In)(Sd|Ud)(32|64)x(-?\d+)y(-?\d+)$/;
  const floatRegex = /^(Somar|Subtr|Multi|Divid)xy(Fl)(32|64)x(-?\d+(?:\.\d+)?)y(-?\d+(?:\.\d+)?)$/;

  const im = line.match(mathRegex);
  if (im) {
    const [, op, , sign, bits, xRaw, yRaw] = im;
    const llvmType = bits === '32' ? 'i32' : 'i64';
    const x = parseNumber(xRaw, llvmType, false);
    const y = parseNumber(yRaw, llvmType, false);

    if (x === null || y === null) {
      createError(`Valor fora do intervalo para ${llvmType}: ${line}`);
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

    irLines.push(`  ${reg} = ${opMap[op]} ${llvmType} ${x}, ${y}`);
    lastNumericValue = { reg, llvmType };
    return true;
  }

  const fm = line.match(floatRegex);
  if (fm) {
    const [, op, , bits, xRaw, yRaw] = fm;
    const llvmType = bits === '32' ? 'float' : 'double';
    const x = parseNumber(xRaw, llvmType, true);
    const y = parseNumber(yRaw, llvmType, true);

    if (x === null || y === null) {
      createError(`Valor de ponto flutuante inválido: ${line}`);
      return true;
    }

    const reg = nextReg();
    const opMap = {
      Somar: 'fadd',
      Subtr: 'fsub',
      Multi: 'fmul',
      Divid: 'fdiv',
    };

    irLines.push(`  ${reg} = ${opMap[op]} ${llvmType} ${x}, ${y}`);
    lastNumericValue = { reg, llvmType };
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

  irLines.push(`  ${reg} = ${opMap[op]} ${llvmVecType} <${lhs.map((n) => `${llvmElemType} ${n}`).join(', ')}>, <${rhs.map((n) => `${llvmElemType} ${n}`).join(', ')}>`);
  return true;
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
      irLines.push(`  call i32 (i8*, ...) @printf(i8* ${errPtr})`);
      irLines.push('  call void @exit(i32 1)');
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
    irLines.push(`  call i32 (i8*, ...) @printf(i8* ${lastTextPointer})`);
    return true;
  }

  const lm = line.match(/^GerarTxtxl'([^']*)'$/);
  if (lm) {
    const txt = decodeTomString(lm[1]);
    const info = createGlobalString(txt, 'txt');
    const ptr = pointerToGlobal(info);
    hasPrintf = true;
    irLines.push(`  call i32 (i8*, ...) @printf(i8* ${ptr})`);
    return true;
  }

  const vm = line.match(/^GerarTxtx([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!vm) return false;

  const [, name] = vm;
  const current = buffers.get(name);
  if (!current) {
    createError(`GerarTxtx${name} falhou: buffer não encontrado.`);
    return true;
  }

  const info = createGlobalString(current.text, 'txt');
  const ptr = pointerToGlobal(info);
  hasPrintf = true;
  irLines.push(`  call i32 (i8*, ...) @printf(i8* ${ptr})`);
  return true;
}

for (const line of lines) {
  if (emitBudgetDirective(line)) continue;
  if (emitNumericOperation(line)) continue;
  if (emitVectorOperation(line)) continue;
  if (emitStringOperation(line)) continue;
  if (emitText(line)) continue;

  createError(`Comando não reconhecido: ${line}`);
}

if (firstError) {
  const errInfo = createGlobalString(`Erro de compilação: ${firstError}\n`, 'fatal');
  const errPtr = pointerToGlobal(errInfo);
  hasPrintf = true;
  irLines.push(`  call i32 (i8*, ...) @printf(i8* ${errPtr})`);
  irLines.push('  ret i32 1');
}

const output = [];
if (globals.length > 0) {
  output.push(...globals);
}
if (hasPrintf) {
  output.push('declare i32 @printf(i8*, ...)');
}
if (hasSqrtf) {
  output.push('declare float @llvm.sqrt.f32(float)');
}
if (hasSqrt) {
  output.push('declare double @llvm.sqrt.f64(double)');
}
if (hasExit) {
  output.push('declare void @exit(i32)');
}

output.push('', 'define i32 @main() {', 'entry:');
output.push(...irLines);

if (!firstError && lastNumericValue && lastNumericValue.llvmType.startsWith('i')) {
  output.push(`  ret ${lastNumericValue.llvmType} ${lastNumericValue.reg}`);
} else if (!firstError) {
  output.push('  ret i32 0');
}

output.push('}');

const llvmOutput = `${output.join('\n')}\n`;
const outputPath = path.join(path.dirname(inputFile), 'output.ll');
fs.writeFileSync(outputPath, llvmOutput);

console.log(`Compilação concluída para '${inputFile}'. Arquivo '${outputPath}' gerado.`);

if (budgetState.frameTargetFps || budgetState.systems.length || budgetState.priorities.length) {
  console.log('\nTom Live Budget (base inicial):');
  if (budgetState.frameTargetFps) {
    console.log(`- Target FPS: ${budgetState.frameTargetFps}`);
  }
  if (budgetState.systems.length) {
    for (const system of budgetState.systems) {
      console.log(`- Sistema ${system.name}: máx ${system.maxMs} ms/frame`);
    }
  }
  if (budgetState.priorities.length) {
    for (const item of budgetState.priorities) {
      console.log(`- Prioridade ${item.name}: ${item.level}`);
    }
  }
}

if (firstError) {
  console.log(`Aviso: ${firstError}`);
}
console.log('\nConteúdo gerado:\n');
console.log(llvmOutput);
