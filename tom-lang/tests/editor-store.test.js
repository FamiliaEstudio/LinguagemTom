'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {spawnSync}=require('node:child_process');
const {command}=require('./helpers');const {toolchain,linkArguments,copyAssets}=require('../core/native-build');
for(const optimize of ['-O0','-O2'])test(`editor store: snapshots, recovery, revisions, queue, locks and readonly ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-editor-store-'));
 try{
  const binary=path.join(dir,process.platform==='win32'?'store.exe':'store');command(toolchain().clang,[optimize,'-DTOM_EDITOR_STORE_TEST','-Wall','-Wextra','-Werror','-I',path.join(__dirname,'../runtime/stable'),path.join(__dirname,'fixtures/editor-store-runtime.c'),...linkArguments(['editor_sqlite']),'-o',binary],{timeout:120000});copyAssets(dir,['editor_sqlite']);
  for(const [mode,name,status] of [['scale','scale.sqlite',0],['basic','basic.sqlite',0],['crash','crash.sqlite',42],['recover','crash.sqlite',0],['crash-writing','writing.sqlite',43],['recover','writing.sqlite',0]]){
   const r=spawnSync(binary,[mode,path.join(dir,name)],{encoding:'utf8',timeout:30000});assert.ifError(r.error);assert.equal(r.status,status,r.stdout+r.stderr);if(!status)assert.match(r.stdout,/store-ok/);if(mode==='scale'){console.log(r.stdout.trim());require('./editor-metrics')('sqlite',optimize,r.stdout);}
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
