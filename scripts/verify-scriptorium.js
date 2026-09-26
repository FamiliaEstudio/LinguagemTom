'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {compileResolved}=require('../tom-lang/core/module-loader');
const {buildApplication,root,platform}=require('../tom-lang/core/native-build');
const output=path.join(platform,'validation-scriptorium');
const literal=s=>"l'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
function build(source,file,optimize) {
  const result=compileResolved(source,{file});assert.equal(result.success,true,JSON.stringify(result.diagnostics));
  assert.ok(result.artifacts.runtimeRequirements.every(x=>['text','math','sqlite'].includes(x)),JSON.stringify(result.artifacts.runtimeRequirements));
  return buildApplication(result,file,path.join(output,'packages',optimize.slice(1)),{optimize});
}
function run(binary,directory,expected) {
  const env={...process.env};
  for(const key of Object.keys(env))if(/^(TOM_|SDL_|LD_|DYLD_)/.test(key)||['CLANG','LLVM_OPT','NODE_PATH','NODE_OPTIONS'].includes(key))delete env[key];
  env.PATH=process.platform==='win32'?`${process.env.SystemRoot}/System32;${process.env.SystemRoot}`:'/usr/bin:/bin';
  const before=performance.now(),r=spawnSync(binary,[],{cwd:directory,env,encoding:'utf8',timeout:120000});
  const ms=performance.now()-before;
  assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(r.stdout.replaceAll('\r\n','\n'),expected);return Number(ms.toFixed(3));
}
function main() {
  fs.mkdirSync(output,{recursive:true});const results=[];
  const file=path.join(root,'tom-lang/exemplos/scriptorium/acervo.tom'),source=fs.readFileSync(file,'utf8');
  const expected='Scriptorium: cadastro, edição, filtros, FTS5, rollback e backup verificados.\nTexto recuperado: 1024000 caracteres.\n';
  for(const optimize of ['-O0','-O2']) {
    const dir=fs.mkdtempSync(path.join(output,'acervo-'));
    const binary=build(source,file,optimize);
    const firstMs=run(binary,dir,expected),reopenMs=run(binary,dir,expected);
    results.push({name:'acervo',optimize,characters:1024000,firstMs,reopenMs,directory:dir,binary});
    console.log(`Acervo ${optimize}: texto longo, índice FTS5, rollback, backup e reabertura OK`);
  }
  const dir=fs.mkdtempSync(path.join(output,'escala-'));
  const insert=`Importar[l'tom/sqlite']
DefRecursoxBancoySQLiteAbrir[l'escala.sqlite']
ChamarxSQLiteExecutar[@Banco,l'CREATE TABLE textos(id INTEGER PRIMARY KEY, titulo TEXT, conteudo TEXT)']
ChamarxSQLiteExecutar[@Banco,${literal("CREATE VIRTUAL TABLE pesquisa USING fts5(titulo,conteudo,content='textos',content_rowid='id',tokenize='unicode61 remove_diacritics 2')")}]
ChamarxSQLiteExecutar[@Banco,l'CREATE TRIGGER inserir AFTER INSERT ON textos BEGIN INSERT INTO pesquisa(rowid,titulo,conteudo) VALUES(new.id,new.titulo,new.conteudo); END']
DefRecursoxTransacaoySQLiteTransacaoIniciar[@Banco]
DefRecursoxConsultaySQLitePreparar[@Banco,l'INSERT INTO textos VALUES(?1,?2,?3)']
DefRecursoxTituloyTextoCriar[l'',1024]
ParaxI[1,10001,1]
InSd64ParaTexto[@I,@Titulo]
SQLiteVincularInSd64[@Consulta,1,@I]
SQLiteVincularTexto[@Consulta,2,@Titulo]
SQLiteVincularTexto[@Consulta,3,l'A memória da biblioteca: ação, criação e coração.']
SQLiteAvancar[@Consulta]
NaoBlx@ULTIMO
Exigir[@ULTIMO]
SQLiteReiniciar[@Consulta]
FimPara
SQLiteTransacaoConfirmar[@Transacao]
GerarTxtxl'10000 textos salvos.\\n'`;
  const search=`Importar[l'tom/sqlite']
DefRecursoxBancoySQLiteAbrirLeitura[l'escala.sqlite']
DefRecursoxConsultaySQLitePreparar[@Banco,l'SELECT count(*) FROM pesquisa WHERE pesquisa MATCH ?1']
ParaxI[0,100,1]
SQLiteVincularTexto[@Consulta,1,l'memoria AND coracao']
SQLiteAvancar[@Consulta]
Exigir[@ULTIMO]
SQLiteColunaInSd64[@Consulta,0]
CompararIgualxyInSd64x@ULTIMOy10000
Exigir[@ULTIMO]
SQLiteReiniciar[@Consulta]
FimPara
GerarTxtxl'100 pesquisas verificadas.\\n'`;
  const insertBinary=build(insert,path.join(output,'escala-gravar.tom'),'-O2');
  const searchBinary=build(search,path.join(output,'escala-pesquisar.tom'),'-O2');
  const writeMs=run(insertBinary,dir,'10000 textos salvos.\n');
  const searchMs=run(searchBinary,dir,'100 pesquisas verificadas.\n');
  results.push({name:'escala',optimize:'-O2',documents:10000,queries:100,writeMs,searchMs,includesProcessStartup:true,directory:dir});
  console.log(`Escala: 10000 textos em ${writeMs} ms; 100 pesquisas em ${searchMs} ms (inclui início do processo).`);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({platform:process.platform,arch:process.arch,sqlite:'3.53.4',date:new Date().toISOString(),results},null,2)+'\n');
}
if(require.main===module)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
module.exports={main};
