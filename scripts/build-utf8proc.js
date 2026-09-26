'use strict';
const fs=require('node:fs'),path=require('node:path');
const {root,platform,toolchain,command}=require('../tom-lang/core/native-build');
function buildUtf8proc() {
  const spec=require('./toolchain.json').utf8proc;
  const source=path.join(root,'.tools/sources',spec.file.replace(/\.tar\.gz$/,''));
  const clang=toolchain().clang,target=command(clang,['-dumpmachine']).stdout.trim(),msvc=target.includes('windows-msvc');
  const native=path.join(platform,msvc?'native-msvc':'native'),build=path.join(native,'build/utf8proc');
  for(const dir of [build,path.join(native,'lib'),path.join(native,'include')])fs.mkdirSync(dir,{recursive:true});
  const object=path.join(build,'utf8proc.o');
  const flags=['-O2','-std=c17','-D_CRT_SECURE_NO_WARNINGS','-DUTF8PROC_STATIC'];
  command(clang,[...flags,'-c',path.join(source,'utf8proc.c'),'-o',object],{timeout:600000});
  const ar=path.join(path.dirname(clang),process.platform==='win32'?'llvm-ar.exe':'llvm-ar');
  command(fs.existsSync(ar)?ar:'ar',['rcs',path.join(native,'lib',msvc?'utf8proc.lib':'libutf8proc.a'),object]);
  fs.copyFileSync(path.join(source,'utf8proc.h'),path.join(native,'include/utf8proc.h'));
  fs.copyFileSync(path.join(source,'LICENSE.md'),path.join(native,'utf8proc.LICENSE'));
  fs.writeFileSync(path.join(build,'receipt.json'),JSON.stringify({...spec,version:spec.version,compiler:clang,target,flags},null,2)+'\n');
  process.stdout.write('utf8proc 2.11.3 / Unicode 17: '+native+'\n');
}
if(require.main===module)buildUtf8proc();
module.exports={buildUtf8proc};
