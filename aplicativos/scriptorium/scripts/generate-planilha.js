'use strict';
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'../src/planilha.sql'),destination=path.resolve(__dirname,'../src/planilha-sql.tom');
const statements=()=>fs.readFileSync(source,'utf8').trim().split('\n-- @statement\n');
const literal=s=>"l'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\n','\\n').replaceAll('\r','\\r')+"'";
function generated(){return '// Gerado por scripts/generate-planilha.js a partir de planilha.sql e planilha-sugestoes.sql.\nImportar[l\'tom/sqlite\']\nDefFuncaoxPlanilhaCarregarSQL[RefBancoSQLitexBanco,TxtxEntrada]yVazio\nDefRecursoxTransacaoySQLiteTransacaoIniciar[@Banco]\n'+statements().map((s,i)=>`DefRecursoxQ${i}ySQLitePreparar[@Banco,${literal(s)}]\n${s.includes('?1')?`SQLiteVincularTexto[@Q${i},1,@Entrada]\n`:''}SQLiteAvancar[@Q${i}]`).join('\n')+'\nSQLiteTransacaoConfirmar[@Transacao]\nFimFuncao\n\nDefFuncaoxPlanilhaAplicarSugestoes[RefBancoSQLitexBanco,InSd64xLinha]yVazio\nDefRecursoxQySQLitePreparar[@Banco,'+literal(fs.readFileSync(path.join(path.dirname(source),'planilha-sugestoes.sql'),'utf8'))+']\nSQLiteVincularInSd64[@Q,1,@Linha]\nSQLiteAvancar[@Q]\nFimFuncao\n';}
if(require.main===module){const text=generated();if(process.argv.includes('--check')){if(fs.readFileSync(destination,'utf8')!==text)throw Error('planilha-sql.tom desatualizado');}else fs.writeFileSync(destination,text);}
module.exports={statements,generated};
