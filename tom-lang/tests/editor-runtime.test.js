'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {command}=require('./helpers');const {toolchain,linkArguments,copyAssets}=require('../core/native-build');
for(const optimize of ['-O0','-O2'])test(`editor: native input, composition, clipboard, layout and million characters ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-editor-'));
 try{
  const binary=path.join(dir,process.platform==='win32'?'editor.exe':'editor');
  command(toolchain().clang,[optimize,'-DTOM_EDITOR_TEST','-Wall','-Wextra','-Werror','-I',path.join(__dirname,'../runtime/stable'),path.join(__dirname,'fixtures/editor-runtime.c'),...linkArguments(['editor_ui']),'-o',binary],{timeout:120000});copyAssets(dir,['editor_ui']);
  const r=command(binary,[],{env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_RENDER_DRIVER:'software'},timeout:120000});assert.match(r.stdout,/editor-ok/);console.log(r.stdout.trim());require('./editor-metrics')('visual',optimize,r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
