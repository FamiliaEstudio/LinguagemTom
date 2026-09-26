'use strict';
const fs=require('node:fs'),path=require('node:path');
const {root,platform,toolchain,command}=require('../tom-lang/core/native-build');
function buildSqlite() {
  const spec=require('./toolchain.json').sqlite;
  const source=path.join(root,'.tools/sources',spec.file.replace(/\.zip$/,''));
  const clang=toolchain().clang,target=command(clang,['-dumpmachine']).stdout.trim(),msvc=target.includes('windows-msvc');
  const native=path.join(platform,msvc?'native-msvc':'native'),build=path.join(native,'build/sqlite');
  for(const dir of [build,path.join(native,'lib'),path.join(native,'include')])fs.mkdirSync(dir,{recursive:true});
  const object=path.join(build,'sqlite3.o');
  const flags=['-O2','-std=c17','-D_CRT_SECURE_NO_WARNINGS','-DSQLITE_ENABLE_FTS5','-DSQLITE_THREADSAFE=1','-DSQLITE_OMIT_LOAD_EXTENSION',...(!target.includes('windows')?['-D_POSIX_C_SOURCE=200809L','-pthread']:[])];
  command(clang,[...flags,'-c',path.join(source,'sqlite3.c'),'-o',object],{timeout:600000});
  const ar=path.join(path.dirname(clang),process.platform==='win32'?'llvm-ar.exe':'llvm-ar');
  command(fs.existsSync(ar)?ar:'ar',['rcs',path.join(native,'lib',msvc?'sqlite3.lib':'libsqlite3.a'),object]);
  fs.copyFileSync(path.join(source,'sqlite3.h'),path.join(native,'include/sqlite3.h'));
  fs.writeFileSync(path.join(native,'sqlite3.LICENSE'),'SQLite 3.53.4 — public domain.\nhttps://www.sqlite.org/copyright.html\n\n'+fs.readFileSync(path.join(source,'sqlite3.c'),'utf8').split('*/')[0]+'*/\n');
  fs.writeFileSync(path.join(build,'receipt.json'),JSON.stringify({...spec,version:'3.53.4',compiler:clang,target,flags},null,2)+'\n');
  process.stdout.write('SQLite 3.53.4 with FTS5: '+native+'\n');
}
if(require.main===module)buildSqlite();
module.exports={buildSqlite};
