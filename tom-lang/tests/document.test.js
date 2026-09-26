'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {command,execute}=require('./helpers');
const {root,toolchain,linkArguments}=require('../core/native-build');
for(const optimize of ['-O0','-O2']) {
 test(`document: Unicode 17, patches, styles, atomic undo and allocation failures ${optimize}`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-document-'));
  try {
   const exe=path.join(dir,process.platform==='win32'?'document.exe':'document');
   command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-DTOM_DOCUMENT_TEST','-I',path.join(__dirname,'../runtime/stable'),path.join(__dirname,'fixtures/document-runtime.c'),...linkArguments(['document']),'-o',exe]);
   const r=command(exe,[path.join(root,'.tools/downloads/GraphemeBreakTest-17.0.0.txt')]);assert.match(r.stdout,/document-ok/);
  }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 test(`document: Tom lexical resources and save state ${optimize}`,()=>{
  const r=execute(`DefRecursoxDyDocumentoCriar[l'Olá',67108864,134217728]
DocumentoSelecionar[@D,3,3]
DocumentoInserir[@D,l', mundo!']
DocumentoDesfazer[@D]
DefRecursoxTyTextoCriar[l'',67108864]
DocumentoObterTexto[@D,@T]
GerarTxtxT
DocumentoRefazer[@D]
DocumentoObterTexto[@D,@T]
GerarTxtxT
DocumentoCampo[@D,5]
DocumentoMarcarSalvo[@D,@ULTIMO]
DocumentoAlterado[@D]
NaoBlx@ULTIMO
Exigir[@ULTIMO]`,{optimize});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stdout,'OláOlá, mundo!');
 });
}

test('document resource access is checked by compilation and analysis',()=>{
 const {rejection}=require('./helpers');const {analyze}=require('../core/compiler');
 const source="DefFuncaoxAlterar[DocumentoTextoxDoc]yVazio\nDocumentoInserir[@Doc,l'x']\nFimFuncao";
 rejection(source,'E_BORROW');assert.equal(analyze(source).diagnostics[0].code,'E_BORROW');
 const result=analyze("DefFuncaoxAlterar[RefDocumentoTextoxDoc]yVazio\nDocumentoInserir[@Doc,l'x']\nFimFuncao\nDefRecursoxDocyDocumentoCriar[l'',1024,4096]\nChamarxAlterar[@Doc]");
 assert.ok(result.success,JSON.stringify(result.diagnostics));assert.ok(result.symbols.some(s=>s.type==='DocumentoTexto'));
});
