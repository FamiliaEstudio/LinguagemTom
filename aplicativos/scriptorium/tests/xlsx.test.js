'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {toolchain,command,linkArguments,copyAssets}=require('../../../tom-lang/core/native-build');
const {workbook,template,exampleRows}=require('../scripts/generate-import-template');
const {zip,unzip}=require('./zip');
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
for(const optimize of ['-O0','-O2'])test(`XLSX reader: exact text, cells, relationships, failures and originals ${optimize}`,()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scriptorium-xlsx-')).replaceAll('\\','/');
 try{
  const binary=path.join(dir,process.platform==='win32'?'job.exe':'job');
  command(toolchain().clang,[optimize,'-Wall','-Wextra','-Werror','-I',path.resolve(__dirname,'../../../tom-lang/runtime/stable'),path.join(__dirname,'fixtures/job-runner.c'),...linkArguments(['file_jobs']),'-o',binary]);copyAssets(dir,['file_jobs']);
  const source=path.join(dir,'poemas com acentuação.xlsx'),sources=path.join(dir,'fontes');
  const job=(bytes,options={},cancel=false)=>{fs.writeFileSync(source,bytes);const file=path.join(dir,'request.json');fs.writeFileSync(file,JSON.stringify({operacao:'ler_planilha',origem:source,aba:'Textos',fontes:sources,...options}));const run=command(binary,[file,...(cancel?['cancel']:[])]);const [status,...json]=run.stdout.trim().split('\n');return {state:Number(status.split(' ')[0]),result:JSON.parse(json.join('\n')),message:run.stderr};};
  const text='  coração é 👩🏽‍💻\t\n\n  verso  \n=literal\r\n_x000A_';
  const bytes=workbook({Instrucoes:[['ignorar']],Textos:[['titulo','texto','texto_10','texto_2'],['Poema',text,'fim','\nmeio\n'],[null,'outro']]});
  const r=job(bytes);assert.equal(r.state,1,r.message);assert.equal(r.result.aba,'Textos');assert.equal(r.result.linhas[1].celulas[1].valor,text);assert.equal(r.result.linhas[2].celulas[0].referencia,'B3');assert.equal(r.result.linhas[2].celulas[0].coluna,2);assert.equal(r.result.hash,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(fs.readFileSync(path.join(sources,r.result.hash)),bytes);
  assert.equal(r.result.linhas[1].celulas[1].unidades_utf16,text.length);
  const model=job(template());assert.equal(model.state,1,model.message);assert.equal(model.result.linhas.length,1);
  assert.equal(job(workbook({Textos:exampleRows()})).result.linhas.length,4);
  const parts=unzip(workbook({Textos:[['texto'],['placeholder']]}));
  parts['xl/_rels/workbook.xml.rels']=parts['xl/_rels/workbook.xml.rels'].toString().replace('</Relationships>',`<Relationship Id="strings" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
  parts['xl/sharedStrings.xml']='<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><rPr><b/></rPr><t xml:space="preserve">  a</t></r><r><t>_x0009_b_x000A_</t></r><rPh sb="0" eb="1"><t>annotation</t></rPh></si></sst>';
  parts['xl/worksheets/sheet1.xml']=parts['xl/worksheets/sheet1.xml'].toString().replace(/<c r="A2".*?<\/c>/,'<c r="A2" t="s"><v>0</v></c>');
  assert.equal(job(zip(parts)).result.linhas[1].celulas[0].valor,'  a\tb\n');
  const mutate=(name,fn)=>{const changed={...parts,[name]:fn(parts[name].toString())};return job(zip(changed));};
  const formula=mutate('xl/worksheets/sheet1.xml',s=>s.replace('<c r="A2" t="s"><v>0</v></c>','<c r="A2"><f>1+1</f><v>2</v></c>'));assert.equal(formula.result.linhas[1].celulas[0].tipo,'formula');
  assert.equal(mutate('xl/worksheets/sheet1.xml',s=>s.replace('<v>0</v>','<v>99</v>')).state,2);
  assert.equal(mutate('xl/worksheets/sheet1.xml',s=>s.replace('r="A2"','r="A3"')).state,2);
  assert.equal(mutate('xl/worksheets/sheet1.xml',s=>s.replace('</worksheet>','<mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>')).state,2);
  assert.equal(mutate('xl/_rels/workbook.xml.rels',s=>s.replace('Target="worksheets/sheet1.xml"','TargetMode="External" Target="https://example.invalid/data"')).state,2);
  assert.equal(mutate('xl/_rels/workbook.xml.rels',s=>s.replace('Target="worksheets/sheet1.xml"','Target="../../outside.xml"')).state,2);
  assert.equal(mutate('xl/sharedStrings.xml',s=>'<!DOCTYPE sst [<!ENTITY outside SYSTEM "file:///missing-secret">]>'+s).state,2);
  assert.equal(job(Buffer.from('not a zip')).state,2);assert.equal(job(bytes,{aba:'Ausente'}).state,2);assert.equal(job(bytes,{},true).state,3);
  const renamed={...parts,'xl/sheets/moved.xml':parts['xl/worksheets/sheet1.xml']};delete renamed['xl/worksheets/sheet1.xml'];renamed['xl/_rels/workbook.xml.rels']=parts['xl/_rels/workbook.xml.rels'].toString().replace('worksheets/sheet1.xml','worksheets/../sheets/moved.xml');assert.equal(job(zip(renamed)).state,1);
  const long='a'.repeat(32767),lines='verso\n'.repeat(253);const chunks=job(workbook({Textos:[['texto','texto_2','texto_3'],[long,lines,' fim']]}));assert.equal(chunks.state,1,chunks.message);assert.equal(chunks.result.linhas[1].celulas.map(c=>c.valor).join(''),long+lines+' fim');
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('distributed XLSX matches its generator',()=>{assert.deepEqual(fs.readFileSync(path.resolve(__dirname,'../modelo-importacao.xlsx')),template());});
