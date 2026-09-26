'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execute,rejection}=require('./helpers');
const modules={'tom/sqlite':fs.readFileSync(path.join(__dirname,'../stdlib/sqlite.tom'),'utf8')};
const literal=s=>"l'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
const exec=(source,options={})=>execute("Importar[l'tom/sqlite']\n"+source,{modules,...options});
const ok=result=>{assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.stdout,'OK');};
for(const optimize of ['-O0','-O2']) {
  test(`SQLite typed binding, copying and query state ${optimize}`,()=>{
    ok(exec(String.raw`DefRecursoxBySQLiteAbrir[l':memory:']
DefRecursoxQySQLitePreparar[@B,l'SELECT ?1,?2,?3,?4,?5,?6']
DefRecursoxTyTextoCriar[l'O\'Brien\n ação 🐈 %s %n',4096]
SQLiteVincularTexto[@Q,1,@T]
SQLiteVincularInSd64[@Q,2,9223372036854775807]
SQLiteVincularFl64[@Q,3,1.25]
SQLiteVincularBl[@Q,4,Verdadeiro]
SQLiteVincularNulo[@Q,5]
SQLiteVincularTexto[@Q,6,l'']
CopiarTxt[@T,l'alterado depois do bind']
SQLiteAvancar[@Q]
Exigir[@ULTIMO]
SQLiteColunaTexto[@Q,0,@T]
TextosIguais[@T,l'O\'Brien\n ação 🐈 %s %n']
Exigir[@ULTIMO]
SQLiteColunaInSd64[@Q,1]
CompararIgualxyInSd64x@ULTIMOy9223372036854775807
Exigir[@ULTIMO]
SQLiteColunaFl64[@Q,2]
CompararIgualxyFl64x@ULTIMOy1.25
Exigir[@ULTIMO]
SQLiteColunaBl[@Q,3]
Exigir[@ULTIMO]
ChamarxSQLiteColunaNula[@Q,4]
Exigir[@ULTIMO]
DefStkFB1CxVazioyl''
SQLiteColunaTexto[@Q,5,@Vazio]
SQLiteAvancar[@Q]
NaoBlx@ULTIMO
Exigir[@ULTIMO]
TextosIguais[@T,l'O\'Brien\n ação 🐈 %s %n']
Exigir[@ULTIMO]
SQLiteReiniciar[@Q]
SQLiteAvancar[@Q]
Exigir[@ULTIMO]
ChamarxSQLiteColunaNula[@Q,0]
Exigir[@ULTIMO]
GerarTxtxl'OK'`,{optimize}));
  });
  test(`SQLite lexical rollback, commit, constraints and backup ${optimize}`,()=>{
    ok(exec(String.raw`DefRecursoxBySQLiteAbrir[l':memory:']
ChamarxSQLiteExecutar[@B,l'CREATE TABLE textos(id INTEGER PRIMARY KEY, corpo TEXT NOT NULL)']
EscopoInixConfirmada
DefRecursoxTySQLiteTransacaoIniciar[@B]
ChamarxSQLiteExecutar[@B,l'INSERT INTO textos VALUES(1,\'ação\')']
SQLiteTransacaoConfirmar[@T]
EscopoFimxConfirmada
Tentar
DefRecursoxTySQLiteTransacaoIniciar[@B]
ChamarxSQLiteExecutar[@B,l'UPDATE textos SET corpo=\'perdido\' WHERE id=1']
ChamarxSQLiteExecutar[@B,l'INSERT INTO textos VALUES(1,\'duplicado\')']
CapturarxE
ErroCodigoxE
CompararIgualxyInSd32x@ULTIMOy@SQLITE_INTEGRIDADE
Exigir[@ULTIMO]
FimTentar
EscopoInixAbandonada
DefRecursoxTySQLiteTransacaoIniciar[@B]
ChamarxSQLiteExecutar[@B,l'DELETE FROM textos']
EscopoFimxAbandonada
DefRecursoxCopiaySQLiteAbrir[l':memory:']
SQLiteBackup[@B,@Copia]
DefRecursoxQySQLitePreparar[@Copia,l'SELECT corpo FROM textos WHERE id=1']
SQLiteAvancar[@Q]
Exigir[@ULTIMO]
DefRecursoxTextoyTextoCriar[l'',1024]
SQLiteColunaTexto[@Q,0,@Texto]
TextosIguais[@Texto,l'ação']
Exigir[@ULTIMO]
GerarTxtxl'OK'`,{optimize}));
  });
  test(`SQLite errors preserve outputs and reject unowned transactions ${optimize}`,()=>{
    const invalid=["DefRecursoxQySQLitePreparar[@B,l'SELECT 1; SELECT 2']","DefRecursoxQySQLitePreparar[@B,l'BEGIN']","DefRecursoxQySQLitePreparar[@B,l'SAVEPOINT x']","DefRecursoxQySQLitePreparar[@B,l'COMMIT']","DefRecursoxQySQLitePreparar[@B,l'não é SQL']"];
    let source="DefRecursoxBySQLiteAbrir[l':memory:']\n";
    for(const line of invalid) source+=`Tentar\n${line}\nGerarTxtxl'BAD'\nCapturarxE\nFimTentar\n`;
    source+=String.raw`DefRecursoxQySQLitePreparar[@B,l'SELECT 42, NULL, x\'ff\', \'texto longo\', char(0), 2']
DefStkFB8CxSaidayl'antes'
SQLiteAvancar[@Q]
Exigir[@ULTIMO]
`;
    for(const line of ['SQLiteColunaTexto[@Q,0,@Saida]','SQLiteColunaTexto[@Q,1,@Saida]','SQLiteColunaTexto[@Q,2,@Saida]','SQLiteColunaTexto[@Q,3,@Saida]','SQLiteColunaTexto[@Q,4,@Saida]','SQLiteColunaTexto[@Q,9,@Saida]','SQLiteColunaBl[@Q,5]','SQLiteColunaFl64[@Q,0]']) {
      source+=`Tentar\n${line}\nGerarTxtxl'BAD'\nCapturarxE\nFimTentar\n`;
    }
    source+="TextosIguais[@Saida,l'antes']\nExigir[@ULTIMO]\nGerarTxtxl'OK'";ok(exec(source,{optimize}));
  });
}
test('SQLite persists Unicode paths and readonly/busy errors are catchable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tom-sqlite-'));
  const file=literal(path.join(dir,'ação.sqlite'));
  try {
    ok(exec(String.raw`DefRecursoxBySQLiteAbrir[${file}]
ChamarxSQLiteExecutar[@B,l'CREATE TABLE textos(id INTEGER PRIMARY KEY, texto TEXT)']
ChamarxSQLiteExecutar[@B,l'INSERT INTO textos VALUES(1,\'Olá\')']
GerarTxtxl'OK'`));
    ok(exec(String.raw`DefRecursoxBySQLiteAbrir[${file}]
DefRecursoxCySQLiteAbrir[${file}]
DefRecursoxRySQLiteAbrirLeitura[${file}]
Tentar
ChamarxSQLiteExecutar[@R,l'DELETE FROM textos']
GerarTxtxl'BAD'
CapturarxE
ErroCodigoxE
CompararIgualxyInSd32x@ULTIMOy@SQLITE_SOMENTE_LEITURA
Exigir[@ULTIMO]
FimTentar
DefRecursoxTySQLiteTransacaoIniciar[@B]
Tentar
DefRecursoxUySQLiteTransacaoIniciar[@C]
GerarTxtxl'BAD'
CapturarxE
ErroCodigoxE
CompararIgualxyInSd32x@ULTIMOy@SQLITE_OCUPADO
Exigir[@ULTIMO]
FimTentar
SQLiteTransacaoReverter[@T]
DefRecursoxQySQLitePreparar[@R,l'SELECT texto FROM textos']
SQLiteAvancar[@Q]
Exigir[@ULTIMO]
DefRecursoxTextoyTextoCriar[l'',1024]
SQLiteColunaTexto[@Q,0,@Texto]
TextosIguais[@Texto,l'Olá']
Exigir[@ULTIMO]
GerarTxtxl'OK'`));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('SQLite mutations require explicit mutable borrowing',()=>{
  rejection("DefFuncaoxF[BancoSQLitexB]yVazio\nDefRecursoxQySQLitePreparar[@B,l'SELECT 1']\nFimFuncao",'E_BORROW');
  rejection("DefFuncaoxF[ConsultaSQLitexQ]yVazio\nSQLiteAvancar[@Q]\nFimFuncao",'E_BORROW');
});

test('SQLite tail validation has no second-PRAGMA side effects and version is pinned',()=>{
  ok(exec(String.raw`DefRecursoxBySQLiteAbrir[l':memory:']
Tentar
DefRecursoxQySQLitePreparar[@B,l'SELECT 1; PRAGMA user_version=99']
GerarTxtxl'BAD'
CapturarxE
FimTentar
DefRecursoxQySQLitePreparar[@B,l'PRAGMA user_version']
SQLiteAvancar[@Q]
Exigir[@ULTIMO]
SQLiteColunaInSd64[@Q,0]
CompararIgualxyInSd64x@ULTIMOy0
Exigir[@ULTIMO]
DefRecursoxVySQLitePreparar[@B,l'SELECT sqlite_version(); -- comentário\n /* final */ ;']
SQLiteAvancar[@V]
Exigir[@ULTIMO]
DefRecursoxTyTextoCriar[l'',128]
SQLiteColunaTexto[@V,0,@T]
TextosIguais[@T,l'3.53.4']
Exigir[@ULTIMO]
GerarTxtxl'OK'`));
});
