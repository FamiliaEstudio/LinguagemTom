'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {statements,generated}=require('../scripts/generate-planilha');
const source=path.resolve(__dirname,'../src');
function fixture(){const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE tom_editor_documentos(id INTEGER PRIMARY KEY,revisao INTEGER NOT NULL,texto TEXT NOT NULL,documento TEXT NOT NULL,contexto TEXT NOT NULL DEFAULT '{}');");for(const sql of fs.readFileSync(path.join(source,'esquema.sql'),'utf8').split('\n-- @statement\n'))db.exec(sql);return db;}
function entrada(rows){return {hash:'a'.repeat(64),origem:'origem.xlsx',aba:'Textos',linhas:rows.map((values,i)=>({linha:i+1,celulas:values.map((value,j)=>({coluna:j+1,referencia:`${j+1}:${i+1}`,tipo:typeof value==='object'?value.tipo:'texto',valor:typeof value==='object'?value.valor:value,unidades_utf16:(typeof value==='object'?value.valor:value).length}))}))};}
function load(db,rows){const value=JSON.stringify(Array.isArray(rows)?entrada(rows):rows);for(const sql of statements()){const s=db.prepare(sql);sql.includes('?1')?s.run(value):s.run();}return db.prepare('SELECT * FROM sc_planilha_itens ORDER BY linha').all();}
function apply(db,row=0){db.prepare(fs.readFileSync(path.join(source,'planilha-sugestoes.sql'),'utf8')).run(row);}
test('spreadsheet staging and suggestions are generated from the reviewed SQL',()=>{assert.equal(fs.readFileSync(path.join(source,'planilha-sql.tom'),'utf8'),generated());});
test('headers, exact concatenation, neutral defaults, dates and provenance',()=>{const db=fixture();try{
 const text='  coração é 👩🏽‍💻\t\n\n';const [r]=load(db,[['texto_10','titulo','texto','texto_2','composicao','publicacao','arquivo_origem','localizacao_origem'],['fim','',text,' meio\n','25/03/2011','01/01/2020/31/12/2020','poemas.pdf','p. 12']]);assert.equal(r.texto,text+' meio\nfim');assert.equal(r.erro,'');assert.equal(r.selecionada,1);
 const f=JSON.parse(r.contexto).ficha;assert.equal(f.titulo,'Sem título');assert.equal(f.corpus,'Fragmenta');assert.equal(f.estado,'Rascunho');assert.equal(f.certeza,'Indeterminado');assert.equal(f.autor,'');assert.equal(f.genero,'');assert.equal(f.persona,'');assert.equal(f.idioma,'');assert.equal(f.composicao,'2011-03-25');assert.equal(f.publicacao,'2020-01-01/2020-12-31');assert.equal(f.importacao_planilha.linha,2);assert.equal(f.importacao_planilha.arquivo_origem,'poemas.pdf');assert.deepEqual(JSON.parse(r.contexto).fontes,[]);
 }finally{db.close();}});
test('suggestions require acceptance, fill missing classifications and deduplicate tags',()=>{const db=fixture();try{
 const rows=[['texto','corpus','genero','tags','corpus_sugerido','genero_sugerido','tags_sugeridas'],['verso','','','luz','Opera','Poema','luz; manhã;manhã'],['outro','Bibliotheca','Prosa','pedra','Fragmenta','Poema','noite']];
 load(db,rows);let f=JSON.parse(db.prepare('SELECT contexto FROM sc_planilha_itens WHERE linha=2').get().contexto).ficha;assert.equal(f.corpus,'Fragmenta');assert.equal(f.importacao_planilha.sugestoes_aplicadas,false);
 apply(db,2);apply(db,2);f=JSON.parse(db.prepare('SELECT contexto FROM sc_planilha_itens WHERE linha=2').get().contexto).ficha;assert.equal(f.corpus,'Opera');assert.equal(f.genero,'Poema');assert.deepEqual(f.tags,['luz','manhã']);assert.equal(f.importacao_planilha.sugestoes_aplicadas,true);
 apply(db);f=JSON.parse(db.prepare('SELECT contexto FROM sc_planilha_itens WHERE linha=3').get().contexto).ficha;assert.equal(f.corpus,'Bibliotheca');assert.equal(f.genero,'Prosa');assert.deepEqual(f.tags,['pedra','noite']);
 }finally{db.close();}});
test('invalid headers block selection; cell failures stay on their own rows',()=>{const db=fixture();try{
 for(const headers of [['titulo'],['texto','texto'],['texto','inexistente'],['texto','texto_02']]){const rows=load(db,[headers,headers.map(()=> 'valor')]);assert.notEqual(db.prepare('SELECT erro FROM sc_planilha_meta').get().erro,'');assert.equal(rows[0].selecionada,0);}
 const r=load(db,[['texto','composicao'],['certo','2012-02'],['errado','31/02/2026'],[{tipo:'formula',valor:'1+1'},''],['data numérica',{tipo:'numero',valor:'2011'}],['',''],['','2020'],['coluna extra','','extra']]);
 assert.equal(r.length,6);assert.equal(r[0].erro,'');for(const row of r.slice(1)){assert.notEqual(row.erro,'');assert.match(row.erro,/Linha .*coluna/);assert.equal(row.selecionada,0);}
 assert.equal(load(db,[['texto'],['=literal']])[0].erro,'');assert.match(load(db,[['texto'],['a'.repeat(32768)]])[0].erro,/32.767/);assert.match(load(db,[['texto'],['\n'.repeat(254)]])[0].erro,/253/);
 assert.equal(load(db,[['texto'],['😀'.repeat(16383)]])[0].erro,'');assert.match(load(db,[['texto'],['😀'.repeat(16384)]])[0].erro,/32.767/);
 for(const value of ['0000','2020-13','2021-02-29','2021-01-01/2020-01-01','abcd','2011.03.25'])assert.notEqual(load(db,[['texto','composicao'],['a',value]])[0].erro,'',value);
 }finally{db.close();}});
test('same workbook row is detected through immutable versions after later edits',()=>{const db=fixture();try{
 const rows=[['texto'],['uma obra']];const [r]=load(db,rows);const id=Number(db.prepare('INSERT INTO textos DEFAULT VALUES').run().lastInsertRowid);db.prepare('INSERT INTO versoes(texto_id,documento,conteudo,ficha) VALUES(?,?,?,?)').run(id,'{}',r.texto,JSON.stringify(JSON.parse(r.contexto).ficha));
 assert.equal(load(db,rows)[0].anterior,1);assert.equal(load(db,rows)[0].selecionada,0);const other=entrada(rows);other.hash='b'.repeat(64);assert.equal(load(db,other)[0].selecionada,1);
 }finally{db.close();}});
module.exports={fixture,entrada,load};
