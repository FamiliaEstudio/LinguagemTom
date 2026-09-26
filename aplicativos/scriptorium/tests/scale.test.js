'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
const {execute}=require('../../../tom-lang/tests/helpers');
const {loadModules}=require('../../../tom-lang/core/module-loader');
const {platform}=require('../../../tom-lang/core/native-build');
for(const optimize of ['-O0','-O2'])test(`Tom application: 10000 texts, million-character save and exact word search ${optimize}`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scriptorium-scale-')),database=path.join(dir,'dados.sqlite');
 try{
  const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;PRAGMA cache_size=-131072;CREATE TABLE tom_editor_meta(versao INTEGER);INSERT INTO tom_editor_meta VALUES(2);CREATE TABLE tom_editor_documentos(id INTEGER PRIMARY KEY,revisao INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL,contexto TEXT NOT NULL DEFAULT '{}');CREATE TABLE tom_editor_recuperacoes(id INTEGER PRIMARY KEY,revisao_base INTEGER NOT NULL,sequencia INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL,contexto TEXT NOT NULL DEFAULT '{}');CREATE TABLE tom_editor_revisoes(id INTEGER PRIMARY KEY,sequencia INTEGER NOT NULL);");
  for(const sql of fs.readFileSync(path.join(__dirname,'../src/esquema.sql'),'utf8').split('\n-- @statement\n'))db.exec(sql);
  const newText=db.prepare('INSERT INTO textos(id) VALUES(?)'),initial=db.prepare('INSERT INTO tom_editor_documentos VALUES(?,1,\'\',\'{}\',\'{}\')'),save=db.prepare('UPDATE tom_editor_documentos SET texto=?,documento=?,contexto=? WHERE id=?');
  db.exec('BEGIN');for(let i=1;i<=10000;i++){const text=i===1?'a'.repeat(1000000):i===10000?'sinalraríssimo coração':'rocha rochas '+i;const doc={formato:'TomDocumento',versao:1,texto:text,estilos:[[Array.from(text).length,3072]],paragrafos:[[0,0]]};const ficha={titulo:`Texto ${i}`,corpus:'Fragmenta',estado:'Rascunho',certeza:'Indeterminado',composicao:'2011',publicacao:'',tags:['pedra'],colecoes:['Ciclo']};newText.run(i);initial.run(i);save.run(text,JSON.stringify(doc),JSON.stringify({ficha,origem:0,motivo:'',fontes:[]}),i);}db.exec('COMMIT');await backup(db,database);db.close();
  const file=path.join(__dirname,'scale.tom'),literal=p=>p.replaceAll('\\','/').replaceAll("'","\\'");
  const source=`Importar[l'../src/acervo.tom']
DefFuncaoxMedida[TxtxNome,InSd64xInicio]yVazio
TempoAgoraNs[]
SubtrxyInSd64x@ULTIMOy@Inicio
DefStkFB64CxNumeroyl''
InSd64ParaTexto[@ULTIMO,@Numero]
GerarTxtxNome
GerarTxtxNumero
GerarTxtxl'\\n'
FimFuncao
TempoAgoraNs[]
DefVarInSd64xInicioy@ULTIMO
DefRecursoxDocumentoyDocumentoCriar[l'',67108864,134217728]
DefRecursoxStoreyPersistenciaDocumentoAbrir[l'${literal(database)}',1,@Documento]
ChamarxMedida[l'abertura_ns=',@Inicio]
DocumentoCampo[@Documento,0]
DocumentoSelecionar[@Documento,1000000,1000000]
DocumentoInserir[@Documento,l' coração']
TempoAgoraNs[]
SetVarInSd64xInicioy@ULTIMO
PersistenciaSolicitar[@Store,1]
ChamarxMedida[l'captura_ns=',@Inicio]
DefVarBlxEsperaryVerdadeiro
Enquantox@Esperar
PersistenciaConsultar[@Store]
PersistenciaVerificar[@Store]
PersistenciaCampo[@Store,0]
CompararIgualxyInSd64x@ULTIMOy1
SetVarBlxEsperary@ULTIMO
FimEnquanto
ChamarxMedida[l'salvamento_ns=',@Inicio]
DefRecursoxBancoySQLiteAbrir[l'${literal(database)}']
DefRecursoxResultyTextoCriar[l'',16777216]
TempoAgoraNs[]
SetVarInSd64xInicioy@ULTIMO
ChamarxAcervoPesquisar[@Banco,l'{"busca":"sinalrarissimo","tag":"pedra","colecao":"Ciclo","inicio":"2010-01-01","fim":"2012-12-31"}',@Result]
ChamarxMedida[l'busca_ns=',@Inicio]
DefRecursoxJsonyJsonLer[@Result,16777216]
JsonObterInSd64[@Json,l'/total']
CompararIgualxyInSd64x@ULTIMOy1
Exigir[@ULTIMO]
TempoAgoraNs[]
SetVarInSd64xInicioy@ULTIMO
ChamarxAcervoPesquisar[@Banco,l'{"pagina":199}',@Result]
ChamarxMedida[l'lista_ns=',@Inicio]
DefRecursoxPaginayJsonLer[@Result,16777216]
JsonObterInSd64[@Pagina,l'/total']
CompararIgualxyInSd64x@ULTIMOy10000
Exigir[@ULTIMO]
JsonComprimento[@Pagina,l'/itens']
CompararIgualxyInSd64x@ULTIMOy50
Exigir[@ULTIMO]
DefRecursoxQySQLitePreparar[@Banco,l'SELECT tom_palavra_exata(\\'rocha rochas Rócha coração coracao\\',\\'rocha\\'),tom_palavra_exata(\\'coração coracao\\',\\'coração\\'),tom_palavra_exata(\\'rochas\\',\\'rocha\\')']
SQLiteAvancar[@Q]
SQLiteColunaInSd64[@Q,0]
CompararIgualxyInSd64x@ULTIMOy1
Exigir[@ULTIMO]
SQLiteColunaInSd64[@Q,1]
CompararIgualxyInSd64x@ULTIMOy1
Exigir[@ULTIMO]
SQLiteColunaInSd64[@Q,2]
CompararIgualxyInSd64x@ULTIMOy0
Exigir[@ULTIMO]
GerarTxtxl'scale-ok\\n'
`;
  const result=execute(source,{file,modules:loadModules(source,file),optimize});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/scale-ok/);console.log(result.stdout.trim());
  const metrics=Object.fromEntries([...result.stdout.matchAll(/(\w+)_ns=(\d+)/g)].map(([,k,v])=>[k+'_ms',Number(v)/1e6]));const output=path.join(platform,'scriptorium/validation');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`scale-${optimize.slice(1)}.json`),JSON.stringify({platform:process.platform,optimize,texts:10000,characters:1000000,...metrics},null,2)+'\n');
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
