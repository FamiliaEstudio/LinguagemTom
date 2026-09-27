'use strict';
const fs = require('node:fs'), path = require('node:path');
const {zip} = require('./zip');
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const headers = ['titulo','texto','texto_2','texto_3','incipit','corpus','genero','subgenero','estado','idioma','autor','persona','certeza','composicao','publicacao','tags','colecoes','justificativa','notas','arquivo_origem','localizacao_origem','corpus_sugerido','genero_sugerido','tags_sugeridas','justificativa_ia'];
const xml = s => String(s).replace(/_x[\da-fA-F]{4}_/g, s => '_x005F_' + s.slice(1)).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\r','&#13;');
function column(index) { let name=''; for(index++;index;index=Math.floor((index-1)/26)) name=String.fromCharCode(65+(index-1)%26)+name; return name; }
function worksheet(rows) {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols><col min="1" max="1" width="28" customWidth="1" style="1"/><col min="2" max="4" width="65" customWidth="1" style="1"/><col min="5" max="16384" width="25" customWidth="1" style="1"/></cols><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((value,j)=>value==null?'':`<c r="${column(j)}${i+1}" s="${i?1:2}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
}
function workbook(sheets) {
  const entries = Object.entries(sheets);
  return zip({
    '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${entries.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${entries.map(([name],i)=>`<sheet name="${xml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ...Object.fromEntries(entries.map(([,rows],i)=>[`xl/worksheets/sheet${i+1}.xml`,worksheet(rows)]))
  });
}
function exampleRows() {
  const items = [
    {titulo:'Exemplo fictício: poema',texto:'  Primeira luz\n\n\tOutro verso.  \n',arquivo_origem:'exemplo.docx',localizacao_origem:'p. 2',genero_sugerido:'Poema',tags_sugeridas:'luz; manhã',justificativa_ia:'Sugestões baseadas na disposição em versos e no vocabulário.'},
    {texto:'Fragmento sem título…',estado:'Fragmento',arquivo_origem:'exemplo.pdf',localizacao_origem:'p. 8',notas:'Exemplo fictício; autoria e data desconhecidas.'},
    {titulo:'Exemplo fictício: continuação',texto:'Primeira parte.\n\n',texto_2:'  Segunda parte,',texto_3:' ainda na mesma obra.\n',notas:'A separação curta ilustra o mecanismo; não adicionamos separadores entre células.'}
  ];
  return [headers,...items.map(item=>headers.map(key=>item[key]||''))];
}
function template() {
  return workbook({Textos:[headers],Instrucoes:[['Scriptorium — modelo de importação v1'],['Preencha a aba Textos. Uma linha por obra. Exemplos não são importados.'],['Leia GUIA_IA_IMPORTACAO.md e envie-o à IA junto dos documentos e deste modelo.'],['Texto é literal: mantenha espaços, tabulações, versos, linhas em branco e a escrita original.'],['Continue na mesma linha em texto_2, texto_3…; não adicione nem remova separadores.'],['Cada célula: até 32.767 caracteres e 253 quebras de linha. Nunca corte o restante da obra.'],['Use valores do tipo texto; datas como 2011, 2011-03, 2011-03-25 ou 25/03/2011.'],['Tags e coleções: separe itens com ponto e vírgula. Sem fórmulas ou células mescladas.'],['Autoria, persona e datas exigem evidência. Classificações inferidas ficam nas colunas de sugestão.'],['O XLSX será revisado no Scriptorium antes da criação das obras.']],Exemplos:exampleRows()});
}
const destination = path.resolve(__dirname,'../modelo-importacao.xlsx');
if(require.main===module){const bytes=template();if(process.argv.includes('--check')){if(!fs.existsSync(destination)||!fs.readFileSync(destination).equals(bytes))throw Error('Modelo XLSX desatualizado. Execute generate-import-template.js.');}else fs.writeFileSync(destination,bytes);}
module.exports={headers,xml,column,worksheet,workbook,template,exampleRows};
