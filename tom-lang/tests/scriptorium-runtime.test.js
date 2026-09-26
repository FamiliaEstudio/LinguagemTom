'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {command}=require('./helpers'),{toolchain,linkArguments}=require('../core/native-build');
for(const optimize of ['-O0','-O2'])test(`text allocation failures and SQLite abrupt termination ${optimize}`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-scriptorium-runtime-'));
  try {
    const exe=path.join(dir,process.platform==='win32'?'runtime.exe':'runtime');
    command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-DTOM_TEXT_TEST','-I',path.join(__dirname,'../runtime/stable'),path.join(__dirname,'fixtures/scriptorium-runtime.c'),...linkArguments(['sqlite']),'-o',exe]);
    const file=path.join(dir,'crash.sqlite');
    for(const [mode,status,stdout] of [['text',0,'runtime-ok\n'],['crash',42,''],['recover',0,'recovered\n']]) {
      const r=spawnSync(exe,[mode,file],{encoding:'utf8',timeout:15000});assert.ifError(r.error);assert.equal(r.status,status,r.stdout+r.stderr);assert.equal(r.stdout.replaceAll('\r\n','\n'),stdout);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
