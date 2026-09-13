'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { compile } = require('../../tom-lang/core/compiler');
const { parse } = require('../../tom-lang/core/parser');
const { toolchain, linkArguments, copyAssets, command, root } = require('../../tom-lang/core/native-build');
const directory = __dirname;
const sourcePath = path.join(root, 'tom-lang/exemplos/calculadora.tom');
const runtime = path.join(root, 'tom-lang/runtime/stable');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));

function headlessSource(original) {
  const fn = parse(original, 'calculadora.tom').body.find(n => n.kind === 'function' && n.name === 'Desenhar');
  if (!fn) throw new Error('Desenhar not found');
  const lines = original.split(/\r?\n/), start = fn.location.line - 1;
  const end = lines.indexOf('FimFuncao', start);
  const replacement = fs.readFileSync(path.join(directory, 'headless-draw.tom'),'utf8').trim();
  if (!replacement.split('\n').includes(lines[start]) || end < start) throw new Error('Desenhar signature changed; review benchmark adapter');
  lines.splice(start, end - start + 1, replacement);
  return lines.join('\n');
}
function build(optimize = '-O2') {
  if (!['-O0','-O2'].includes(optimize)) throw new Error('Use -O0 or -O2');
  const tools = toolchain();
  const target = command(tools.clang,['-dumpmachine']).stdout.trim();
  if (!/x86_64/.test(target) || (process.platform === 'win32' && !/(?:mingw|windows-gnu)/.test(target))) throw new Error('Benchmark reference supports Linux x64 GNU and Windows x64 MinGW');
  const platform = `${process.platform}-${process.arch}-${process.platform === 'win32' ? 'mingw' : 'gnu'}`;
  const base = path.join(directory, 'build', platform, optimize.slice(1));
  const source = fs.readFileSync(sourcePath, 'utf8');
  const raw = linkArguments(['text','decimal','ui'],tools.clang);
  const cFiles = raw.filter(a=>a.endsWith('.c'));
  const other = raw.filter(a=>!a.endsWith('.c'));
  // Compile arguments and link libraries are split so identical runtime .o files
  // are reused by Tom/C; neither link enables LTO or recompiles the runtime.
  const includes = [];
  for (let i=0;i<other.length;i++) {
    if (other[i]==='-I') includes.push(other[i],other[++i]);
    else if (other[i].startsWith('-D') || other[i].startsWith('-std=')) includes.push(other[i]);
  }
  includes.push('-I',runtime);
  const libraries=[];
  for(let i=0;i<other.length;i++) {
    if(other[i]==='-I') { i++; continue; }
    if(other[i].startsWith('-D') || other[i].startsWith('-std=')) continue;
    libraries.push(other[i]);
  }
  if(process.platform==='win32') libraries.push('-lpsapi');
  const suffix=process.platform==='win32'?'.exe':'';
  const artifacts={};
  for(const mode of ['headless','render','desktop']) {
    const out=path.join(base,mode);fs.mkdirSync(out,{recursive:true});
    const defines=mode==='headless'?['-DTOM_BENCH_HEADLESS']:[];
    const object=(file,name,extra=[])=> {
      const output=path.join(out,name+'.o');
      command(tools.clang,[optimize,...includes,...defines,...extra,'-c',file,'-o',output]);
      return output;
    };
    const common=cFiles.filter(f=>!['ui.c','common.c'].includes(path.basename(f))).map(f=>object(f,path.basename(f,'.c')));
    if(mode==='desktop') {
      common.push(object(path.join(runtime,'common.c'),'common'),object(path.join(runtime,'ui.c'),'ui'));
      const app=object(path.join(directory,'calculadora.c'),'calculator');
      const executable=path.join(out,'calculadora-c'+suffix);
      const guiFlags=process.platform==='win32'?['-mwindows','-Wl,-e,mainCRTStartup']:[];
      command(tools.clang,[app,...common,...libraries,...guiFlags,'-o',executable]);
      copyAssets(out,['text','decimal','ui']);artifacts.desktop=executable;
      continue;
    }
    common.push(object(path.join(directory,'bench_support.c'),'bench_support'),object(path.join(directory,'ui_adapter.c'),'ui_adapter'));
    const tomSource=mode==='headless'?headlessSource(source):source;
    fs.writeFileSync(path.join(out,'calculadora.tom'),tomSource);
    const compiled=compile(tomSource,{file:sourcePath});
    if(!compiled.success) throw new Error(JSON.stringify(compiled.diagnostics));
    if(!compiled.artifacts.llvm.includes('define i32 @main()')) throw new Error('LLVM entry point changed');
    const ir=path.join(out,'calculadora.ll');
    fs.writeFileSync(ir,compiled.artifacts.llvm.replace('define i32 @main()','define i32 @tom_bench_program_main()'));
    command(tools.opt,['-passes=verify','-disable-output',ir]);
    const tomObject=path.join(out,'calculator-tom.o');
    command(tools.clang,[optimize,'-c',ir,'-o',tomObject]);
    const cObject=object(path.join(directory,'calculadora.c'),'calculator-c',['-Dmain=tom_bench_program_main','-Wall','-Wextra','-Werror']);
    artifacts[mode]={};
    for(const [language,obj] of [['tom',tomObject],['c',cObject]]) {
      const executable=path.join(out,`calculator-${language}${suffix}`);
      command(tools.clang,[obj,...common,...libraries,'-o',executable]);
      artifacts[mode][language]=executable;
    }
    artifacts[mode].sharedObjects=Object.fromEntries(common.map(f=>[path.basename(f),hashFile(f)]));
    artifacts[mode].tomSourceSHA256=sha(tomSource);
    copyAssets(out,['text','decimal','ui']);
  }
  const hashDirectory=dir=>Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(c|h|js|tom)$/.test(n)).sort().map(n=>[n,hashFile(path.join(dir,n))]));
  const nativeLibraries=Object.fromEntries(libraries.filter(f=>/\.(a|lib)$/.test(f)&&fs.existsSync(f)).map(f=>[path.basename(f),hashFile(f)]));
  for(const name of fs.readdirSync(path.join(base,'render')).filter(n=>/\.dll$|\.so(?:\.|$)/.test(n))) nativeLibraries[name]=hashFile(path.join(base,'render',name));
  const manifest={schema:1,target,platform,optimize,clang:command(tools.clang,['--version']).stdout.trim(),llvm:command(tools.opt,['--version']).stdout.trim(),node:process.version,
    sourceSHA256:hashFile(sourcePath),benchmarkSources:hashDirectory(directory),compilerSources:hashDirectory(path.join(root,'tom-lang/core')),
    runtimeSources:hashDirectory(runtime),nativeLibraries,fontSHA256:hashFile(path.join(base,'render','DejaVuSans.ttf')),toolchain:require('../../scripts/toolchain.json'),artifacts};
  fs.writeFileSync(path.join(base,'build.json'),JSON.stringify(manifest,null,2)+'\n');
  return {base,manifest,...artifacts};
}
module.exports={build,headlessSource,hashFile};
