'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {toolchain,command,linkArguments,copyAssets}=require('../../../tom-lang/core/native-build');
for(const optimize of ['-O0','-O2'])test(`context captured per request, metadata recovery, migration and rollback ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scriptorium-context-'));
 try{
  const file=path.join(dir,'v1.sqlite'),db=new DatabaseSync(file);
  db.exec(`CREATE TABLE tom_editor_meta(versao INTEGER NOT NULL);INSERT INTO tom_editor_meta VALUES(1);CREATE TABLE tom_editor_documentos(id INTEGER PRIMARY KEY,revisao INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL);CREATE TABLE tom_editor_recuperacoes(id INTEGER PRIMARY KEY,revisao_base INTEGER NOT NULL,sequencia INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL);CREATE TABLE tom_editor_revisoes(id INTEGER PRIMARY KEY,sequencia INTEGER NOT NULL);`);
  db.prepare('INSERT INTO tom_editor_documentos VALUES(1,1,?,?)').run('antigo',JSON.stringify({formato:'TomDocumento',versao:1,texto:'antigo',estilos:[[6,3072]],paragrafos:[[0,0]]}));db.exec('INSERT INTO tom_editor_revisoes VALUES(1,0)');db.close();
  const binary=path.join(dir,process.platform==='win32'?'context.exe':'context');command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-I',path.resolve(__dirname,'../../../tom-lang/runtime/stable'),path.join(__dirname,'fixtures/context-runtime.c'),...linkArguments(['editor_sqlite']),'-o',binary]);copyAssets(dir,['editor_sqlite']);assert.match(command(binary,[file]).stdout,/context-ok/);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
