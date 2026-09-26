'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {toolchain,command,linkArguments,copyAssets}=require('../../../tom-lang/core/native-build');
const {zip,unzip}=require('./zip');
const word='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
for(const optimize of ['-O0','-O2'])test(`DOCX, binary originals, hashes, slicing and background import ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scriptorium-native-'));
 try{
  fs.writeFileSync(path.join(dir,'source.docx'),zip({'word/document.xml':`<w:document xmlns:w="${word}"><w:body><w:p><w:pPr><w:pStyle w:val="Poem"/></w:pPr><w:r><w:t xml:space="preserve">  coração é 👩🏽‍💻</w:t></w:r></w:p><w:p><w:r><w:t>rocha</w:t></w:r></w:p><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>rochas</w:t></w:r></w:p></w:body></w:document>`,'word/styles.xml':`<w:styles xmlns:w="${word}"><w:style w:styleId="Poem"><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`}));
  const binary=path.join(dir,process.platform==='win32'?'native.exe':'native');
  command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-I',path.resolve(__dirname,'../../../tom-lang/runtime/stable'),path.join(__dirname,'fixtures/files-runtime.c'),...linkArguments(['file_jobs']),'-o',binary]);copyAssets(dir,['file_jobs']);
  const run=command(binary,[dir.replaceAll('\\','/')]);assert.match(run.stdout,/files-ok/);
  const files=unzip(fs.readFileSync(path.join(dir,'export.docx')));assert.ok(files['[Content_Types].xml']);assert.match(files['word/document.xml'].toString(),/xml:space="preserve"/);assert.match(files['word/document.xml'].toString(),/coração/);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
