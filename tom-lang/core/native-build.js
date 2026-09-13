'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const windows = process.platform === 'win32';
const platform = path.join(root, '.tools', windows ? 'windows' : 'linux');
function executable(variable, local, fallback) { return process.env[variable] || (fs.existsSync(local) ? local : fallback); }
function toolchain() {
  return {
    clang: executable('CLANG', path.join(platform, windows ? 'llvm-mingw/bin/clang.exe' : 'llvm/usr/lib/llvm-21/bin/clang'), 'clang'),
    opt: executable('LLVM_OPT', path.join(platform, windows ? 'llvm/bin/opt.exe' : 'llvm/usr/lib/llvm-21/bin/opt'), 'opt'),
  };
}
function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 120000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(bin)} falhou (${result.status}):\n${result.stderr || result.stdout}`);
  return result;
}
const targets = new Map();
function targetOf(clang) {
  if (!targets.has(clang)) targets.set(clang, command(clang, ['-dumpmachine']).stdout.trim());
  return targets.get(clang);
}
function linkArguments(requirements, clang = toolchain().clang, { testUI = false } = {}) {
  const msvc = targetOf(clang).includes('windows-msvc');
  const args = msvc ? ['-Xlinker', 'legacy_stdio_definitions.lib'] : [];
  if (!requirements.length) return args;
  const native = process.env.TOM_NATIVE_ROOT || path.join(platform, msvc ? 'native-msvc' : 'native');
  const source = path.join(root, 'tom-lang/runtime/stable');
  args.push(path.join(source, 'common.c'), path.join(source, 'text.c'), '-std=c17', '-D_CRT_SECURE_NO_WARNINGS');
  if (testUI) args.push('-DTOM_UI_TEST');
  if (requirements.includes('math')) args.push(path.join(source, 'math.c'));
  if (requirements.includes('audio')) args.push(path.join(source, 'audio.c'));
  const hasSDL = requirements.some(x => ['ui', 'time', 'audio', 'data'].includes(x));
  if (hasSDL) args.push(path.join(source, 'platform.c'), '-I', path.join(native, 'include'));
  if (requirements.includes('data')) args.push(path.join(source, 'data.c'));
  if (requirements.includes('json')) args.push(path.join(source, 'json.c'), '-I', path.join(native, 'include'), path.join(native, 'lib', msvc ? 'yyjson.lib' : 'libyyjson.a'));
  if (requirements.some(x => ['decimal', 'json'].includes(x))) {
    const library = path.join(native, 'lib', msvc ? 'mpdec.lib' : 'libmpdec.a');
    if (!fs.existsSync(library)) throw new Error('Runtime decimal ausente. Execute os instaladores de scripts/setup-native.');
    args.push(path.join(source, 'decimal.c'), '-I', path.join(native, 'include'), library);
  }
  if (requirements.includes('ui')) {
    args.push(path.join(source, 'ui.c'), '-I', path.join(native, 'include'));
    args.push(...(msvc ? [path.join(native, 'lib/SDL3_ttf.lib')] : ['-L', path.join(native, 'lib'), '-lSDL3_ttf']));
  }
  if (hasSDL) args.push(...(msvc ? [path.join(native, 'lib/SDL3.lib')] : ['-L', path.join(native, 'lib'), '-lSDL3']));
  if (hasSDL && !windows) args.push('-Wl,--disable-new-dtags,-rpath,$ORIGIN');
  if (!windows) args.push('-lm');
  return args;
}
function copyAssets(directory, requirements, assetRequirements = []) {
  for (const asset of assetRequirements) {
    if (!['tom/Bravura.otf','tom/Bravura.LICENSE'].includes(asset)) throw new Error('Asset padrão desconhecido: ' + asset);
    const specification = require('../../scripts/toolchain.json')[asset.endsWith('.otf') ? 'bravura' : 'bravuraLicense'];
    const source = fs.readFileSync(path.join(root, 'tom-lang/runtime/stable/assets', asset));
    if (createHash('sha256').update(source).digest('hex') !== specification.sha256) throw new Error('SHA256 inválido para asset padrão: ' + asset);
    const destination = path.join(directory, 'assets', asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
  }
  const native = process.env.TOM_NATIVE_ROOT || path.join(platform, 'native');
  if (requirements.some(x => ['decimal','ui','time','audio','json','data'].includes(x))) for (const name of fs.readdirSync(native)) if (/license|copying/i.test(name)) fs.copyFileSync(path.join(native, name), path.join(directory, name));
  if (!requirements.some(x => ['ui','time','audio','data'].includes(x))) return;
  const libs = path.join(native, windows ? 'bin' : 'lib');
  for (const name of fs.readdirSync(libs)) if (windows ? /\.dll$/i.test(name) : /\.so(?:\.|$)/.test(name)) fs.copyFileSync(path.join(libs, name), path.join(directory, name));
  if (!windows && requirements.includes('audio')) fs.cpSync(path.join(native,'share/alsa'),path.join(directory,'alsa'),{recursive:true});
  if (requirements.includes('ui')) for (const name of ['DejaVuSans.ttf', 'DejaVuSans.LICENSE']) fs.copyFileSync(path.join(root, 'tom-lang/runtime/stable/assets', name), path.join(directory, name));
  fs.cpSync(path.join(root, 'tom-lang/runtime/stable/assets/licenses'), path.join(directory, 'third-party-licenses'), { recursive: true });
}
function copyProjectAssets(source, target) {
  const directory = fs.realpathSync(source), destination = path.resolve(target);
  if (destination === directory || destination.startsWith(directory + path.sep)) throw new Error('A saída do build não pode ficar dentro dos assets.');
  function copy(from, to) {
    const info = fs.lstatSync(from);
    if (info.isSymbolicLink()) throw new Error('Assets não podem conter links simbólicos: ' + from);
    if (info.isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const name of fs.readdirSync(from)) copy(path.join(from,name),path.join(to,name)); }
    else if (info.isFile()) {
      if (fs.existsSync(to)) throw new Error('Asset colide com arquivo padrão: ' + to);
      fs.copyFileSync(from,to);
    } else throw new Error('Asset não é arquivo regular: ' + from);
  }
  if (!fs.statSync(directory).isDirectory()) throw new Error('--assets exige diretório.');
  copy(directory,destination);
}
function renamePackage(from, to) {
  // Windows scanners may briefly keep new EXEs/DLLs open after linking/copying.
  // Retry only sharing/permission failures; never remove the existing package.
  for (let attempt=0;;attempt++) {
    try { fs.renameSync(from,to); return; }
    catch (error) {
      if (!windows || !['EPERM','EACCES','EBUSY'].includes(error.code) || attempt>=20) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
    }
  }
}
function buildApplication(compilation, source, outDir, { testUI = false, optimize = '-O2', assets } = {}) {
  const tools = toolchain();
  const target = targetOf(tools.clang);
  const platformName = `${windows ? 'windows' : 'linux'}-${process.arch}-${target.includes('windows-msvc') ? 'msvc' : windows ? 'mingw' : 'gnu'}`;
  const name = path.basename(source, path.extname(source));
  const parent = path.resolve(outDir || path.join(path.dirname(source), 'build', platformName));
  fs.mkdirSync(parent, { recursive: true });
  const destination = path.join(parent, name), staging = fs.mkdtempSync(path.join(parent, name + '.tmp-'));
  let backup;
  try {
    const ir = path.join(staging, name + '.ll');
    const executable = path.join(staging, name + (windows ? '.exe' : ''));
    fs.writeFileSync(ir, compilation.artifacts.llvm);
    command(tools.opt, ['-passes=verify', '-disable-output', ir]);
    const args = linkArguments(compilation.artifacts.runtimeRequirements, tools.clang, { testUI });
    if (windows && compilation.artifacts.runtimeRequirements.includes('ui') && !testUI) {
      args.push(...(targets.get(tools.clang).includes('windows-msvc') ? ['-Xlinker', '/SUBSYSTEM:WINDOWS', '-Xlinker', '/ENTRY:mainCRTStartup'] : ['-mwindows', '-Wl,-e,mainCRTStartup']));
    }
    command(tools.clang, [optimize, ir, '-o', executable, ...args]);
    copyAssets(staging, compilation.artifacts.runtimeRequirements, compilation.artifacts.assetRequirements);
    if (assets) copyProjectAssets(assets, path.join(staging,'assets'));
    fs.writeFileSync(path.join(staging, 'tom-build.json'), JSON.stringify({ version: require('../package.json').version, source: path.basename(source), target, optimize, runtime: compilation.artifacts.runtimeRequirements, assets: compilation.artifacts.assetRequirements || [] }, null, 2));
    if (fs.existsSync(destination)) {
      if (!fs.existsSync(path.join(destination, 'tom-build.json'))) throw new Error('Diretório de destino não pertence ao build Tom: ' + destination);
      backup = destination + '.previous-' + process.pid;
      renamePackage(destination, backup);
    }
    try { renamePackage(staging, destination); }
    catch (error) { if (backup) renamePackage(backup, destination); backup = null; throw error; }
    if (backup) fs.rmSync(backup, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return path.join(destination, name + (windows ? '.exe' : ''));
  } finally { fs.rmSync(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}
module.exports = { toolchain, linkArguments, command, copyAssets, copyProjectAssets, buildApplication, root, platform };
