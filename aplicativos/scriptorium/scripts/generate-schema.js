'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const literal = s => "l'" + s.replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\n','\\n') + "'";
function generated() {
 const sql = fs.readFileSync(path.join(root,'src/esquema.sql'),'utf8').split('\n-- @statement\n').map(x=>x.trim());
 return '// Gerado por scripts/generate-schema.js a partir de esquema.sql.\nImportar[l\'tom/sqlite\']\nDefFuncaoxScriptoriumCriarEsquema[RefBancoSQLitexBanco]yVazio\nDefRecursoxTransacaoySQLiteTransacaoIniciar[@Banco]\n' + sql.map(s=>`ChamarxSQLiteExecutar[@Banco,${literal(s)}]`).join('\n') + '\nSQLiteTransacaoConfirmar[@Transacao]\nFimFuncao\n';
}
if(require.main===module){const file=path.join(root,'src/esquema.tom');if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==generated())throw Error('esquema.tom desatualizado');}else fs.writeFileSync(file,generated());}
function searchGenerated() { return "// Gerado a partir de pesquisa.sql.\nImportar[l'tom/sqlite']\nDefFuncaoxAcervoPesquisar[RefBancoSQLitexBanco,TxtxFiltros,RefTextoxSaida]yVazio\nDefRecursoxConsultaySQLitePreparar[@Banco,"+literal(fs.readFileSync(path.join(root,'src/pesquisa.sql'),'utf8'))+"]\nSQLiteVincularTexto[@Consulta,1,@Filtros]\nSQLiteAvancar[@Consulta]\nSQLiteColunaTexto[@Consulta,0,@Saida]\nFimFuncao\n"; }
if(require.main===module){const file=path.join(root,'src/pesquisa.tom');if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==searchGenerated())throw Error('pesquisa.tom desatualizado');}else fs.writeFileSync(file,searchGenerated());}
module.exports={generated,searchGenerated};
