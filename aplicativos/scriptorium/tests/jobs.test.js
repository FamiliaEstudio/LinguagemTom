'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {toolchain,command,linkArguments,copyAssets}=require('../../../tom-lang/core/native-build');
const {zip}=require('./zip');
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const optimize of ['-O0','-O2'])test(`20-file pilot, export, verified backup/restore, retention and cancellation ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scriptorium-jobs-')).replaceAll('\\','/');
 try{
  const binary=path.join(dir,process.platform==='win32'?'job.exe':'job');
  command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-I',path.resolve(__dirname,'../../../tom-lang/runtime/stable'),path.join(__dirname,'fixtures/job-runner.c'),...linkArguments(['file_jobs']),'-o',binary]);copyAssets(dir,['file_jobs']);
  const job=(request,cancel=false)=>{const file=path.join(dir,'request.json');fs.writeFileSync(file,JSON.stringify(request));const r=command(binary,[file,...(cancel?['cancel']:[])]);const [status,...json]=r.stdout.trim().split('\n');const [state,error]=status.split(' ').map(Number);return {state,error,result:JSON.parse(json.join('\n')),message:r.stderr};};
  const okay=request=>{const r=job(request);assert.equal(r.state,1,r.message);return r.result;};
  const corpus=path.join(dir,'corpus'),sources=path.join(corpus,'fontes'),backups=path.join(dir,'backups');fs.mkdirSync(sources,{recursive:true});
  const database=path.join(corpus,'dados.sqlite'),db=new DatabaseSync(database);db.exec('CREATE TABLE fontes(caminho TEXT,hash TEXT); CREATE TABLE obras(id INTEGER PRIMARY KEY,documento TEXT);');
  const docs=[];for(let i=0;i<20;i++){
   const ext=i<12?'docx':i<16?'txt':'md',file=path.join(dir,`poema-${i}.${ext}`);
   const text=i===19?'a'.repeat(1000000):`  Poema ${i}: coração é 👩🏽‍💻\nrocha\nrochas\n`;
   let bytes;if(ext==='docx'){
    const paras=text.split('\n').map(t=>`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:i/><w:u w:val="single"/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('');
    bytes=zip({'word/document.xml':`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}${i===0?'<w:p><w:r><w:drawing/></w:r></w:p>':''}</w:body></w:document>`});
   }else bytes=Buffer.from(text);
   fs.writeFileSync(file,bytes);const imported=okay({operacao:'importar',origem:file,fontes:sources});assert.equal(imported.hash,sha(bytes));assert.deepEqual(fs.readFileSync(path.join(sources,imported.hash)),bytes);assert.equal(imported.documento.texto,text+(i===0?'\n':''));if(i===0)assert.ok(imported.avisos.length);
   docs.push(imported.documento);db.prepare('INSERT INTO fontes VALUES(?,?)').run(`fontes/${imported.hash}`,imported.hash);db.prepare('INSERT INTO obras(documento) VALUES(?)').run(JSON.stringify(imported.documento));
   const twice=okay({operacao:'importar',origem:file,fontes:sources});assert.equal(twice.hash,imported.hash);
  }
  assert.equal(fs.readdirSync(sources).length,20);db.close();
  const exported=path.join(dir,'selection.docx');okay({operacao:'exportar',destino:exported,documentos:[docs[2],docs[1]],formato:'docx'});
  assert.equal(okay({operacao:'importar',origem:exported}).documento.texto,docs[2].texto+'\n\n'+docs[1].texto);
  const fromDb=path.join(dir,'from-db.txt');okay({operacao:'exportar',banco:database,consulta:'SELECT documento FROM obras WHERE id<=?1 ORDER BY id DESC',parametro:'2',destino:fromDb,formato:'txt'});assert.equal(fs.readFileSync(fromDb,'utf8'),docs[1].texto+'\n\n'+docs[0].texto);
  const hostile=path.join(dir,'entities.docx');fs.writeFileSync(hostile,zip({'word/document.xml':'<!DOCTYPE x [<!ENTITY outside SYSTEM "file:///missing-secret">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&outside;</w:t></w:r></w:p></w:body></w:document>'}));assert.equal(job({operacao:'importar',origem:hostile}).state,2);
  const request={operacao:'backup',banco:database,raiz:corpus,destino:backups,consulta:'SELECT caminho,hash FROM fontes ORDER BY hash',classe:'manual'};
  const snapshot=okay(request).destino,manifest=JSON.parse(fs.readFileSync(path.join(snapshot,'manifesto.json')));assert.equal(manifest.arquivos.length,20);assert.equal(manifest.banco_hash,sha(fs.readFileSync(path.join(snapshot,'dados.sqlite'))));
  const restored=okay({operacao:'restaurar',origem:snapshot,destino:path.join(dir,'restored')}).destino;assert.deepEqual(fs.readFileSync(path.join(restored,'dados.sqlite')),fs.readFileSync(path.join(snapshot,'dados.sqlite')));assert.ok(fs.existsSync(database));
  const item=manifest.arquivos[0],original=fs.readFileSync(path.join(snapshot,item.caminho));fs.writeFileSync(path.join(snapshot,item.caminho),'corrupt');assert.equal(job({operacao:'restaurar',origem:snapshot,destino:path.join(dir,'bad')}).state,2);assert.equal(fs.readdirSync(path.join(dir,'bad')).length,0);fs.writeFileSync(path.join(snapshot,item.caminho),original);
  fs.writeFileSync(path.join(corpus,item.caminho),'corrupt');assert.equal(job(request).state,2);fs.writeFileSync(path.join(corpus,item.caminho),original);assert.equal(fs.readdirSync(backups).filter(x=>x.endsWith('.partial')).length,0);
  assert.equal(job(request,true).state,3);assert.equal(fs.readdirSync(backups).length,1);
  const epoch=Math.floor(Date.now()/1000);for(let i=1;i<=40;i++){const folder=path.join(backups,`snapshot-fixture-${i}`);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'manifesto.json'),JSON.stringify({...manifest,classe:'diario',epoch:epoch-i*86400}));}
  okay({...request,classe:'diario'});assert.ok(fs.existsSync(snapshot));const retained=fs.readdirSync(backups);assert.ok(retained.length>=8&&retained.length<=12,retained.join(','));
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
