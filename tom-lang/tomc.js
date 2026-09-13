#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('./core/compiler');
const { compileResolved } = require('./core/module-loader');
const { buildApplication } = require('./core/native-build');
const { spawnSync } = require('node:child_process');

const HELP = `Uso: node tomc.js [--check] [--out-dir DIRETORIO | -o ARQUIVO] programa.tom

Sem opções, gera <diretorio-do-fonte>/build/<nome-do-fonte>.ll.
--check valida sem gravar arquivos. O backend estável é LLVM.
--build verifica e compila uma aplicação em build/<plataforma-arquitetura-abi>/<nome>/.
--run compila e executa a aplicação. --out-dir altera a pasta build.
--assets DIRETORIO copia fontes e WAV para assets/ ao lado da aplicação.
GPU, MLIR, Comptime JavaScript e garantias de ciclos são experimentais.
`;

function parseArgs(argv) {
  const options = { target: 'llvm', check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--check') { options.check = true; continue; }
    if (arg === '--build') { options.build = true; continue; }
    if (arg === '--run') { options.build = true; options.run = true; continue; }
    if (arg === '--emit-mlir') { options.target = 'mlir'; continue; }
    if (arg === '--out-dir' || arg === '-o' || arg === '--assets') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`Falta valor para ${arg}.`);
      const key = arg === '-o' ? 'output' : arg === '--assets' ? 'assets' : 'outDir';
      if (options[key]) throw new Error(`Opção repetida: ${arg}.`);
      options[key] = value;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Opção desconhecida: ${arg}.`);
    if (options.file) throw new Error('Forneça exatamente um arquivo .tom.');
    options.file = arg;
  }
  if (!options.file) throw new Error('Falta o arquivo .tom.');
  if (options.output && options.outDir) throw new Error('Use -o ou --out-dir, não ambos.');
  if (options.build && (options.output || options.check)) throw new Error('--build/--run não podem ser combinados com -o ou --check.');
  if (options.assets && !options.build) throw new Error('--assets exige --build ou --run.');
  return options;
}

function run(argv) {
  let temporary;
  try {
    const options = parseArgs(argv);
    if (options.help) { process.stdout.write(HELP); return 0; }
    const file = path.resolve(options.file);
    const bytes = fs.readFileSync(file);
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch {
      process.stderr.write(`${file}:1:1: error E_ENCODING: O fonte não é UTF-8 válido.\n`);
      return 1;
    }
    const result = compileResolved(source, { file, target: options.target });
    if (!result.success) {
      for (const d of result.diagnostics) process.stderr.write(`${d.file}:${d.line}:${d.column}: ${d.severity} ${d.code}: ${d.message}\n`);
      return 1;
    }
    if (options.check) { process.stdout.write(`Validação concluída: ${options.file}\n`); return 0; }
    if (options.build) {
      const executable = buildApplication(result, file, options.outDir, { assets: options.assets });
      process.stdout.write(`Compilação concluída: ${executable}\n`);
      if (!options.run) return 0;
      const child = spawnSync(executable, [], { stdio: 'inherit' });
      if (child.error) throw child.error;
      return child.status === null ? 1 : child.status;
    }
    const directory = options.outDir || path.join(path.dirname(file), 'build');
    const output = path.resolve(options.output || path.join(directory, `${path.basename(file, path.extname(file))}.ll`));
    if (output === file || (fs.existsSync(output) && fs.realpathSync(output) === fs.realpathSync(file))) {
      throw new Error('O arquivo de saída não pode substituir o fonte.');
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, result.artifacts.llvm, { flag: 'wx' });
    fs.renameSync(temporary, output);
    temporary = null;
    process.stdout.write(`Compilação concluída: ${output}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`tomc: ${error.message}\n`);
    return 1;
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
  }
}

if (require.main === module) process.exitCode = run(process.argv.slice(2));
module.exports = { compile, parseArgs, run };
