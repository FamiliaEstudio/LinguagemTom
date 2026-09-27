-- Staging is temporary and belongs to this application connection, never to the corpus schema.
CREATE TEMP TABLE IF NOT EXISTS sc_planilha_meta(hash TEXT, origem TEXT, aba TEXT, erro TEXT DEFAULT '')
-- @statement
CREATE TEMP TABLE IF NOT EXISTS sc_planilha_celulas(linha INTEGER, coluna INTEGER, referencia TEXT, tipo TEXT, valor TEXT, unidades_utf16 INTEGER, PRIMARY KEY(linha,coluna))
-- @statement
CREATE TEMP TABLE IF NOT EXISTS sc_planilha_campos(coluna INTEGER PRIMARY KEY, nome TEXT, parte INTEGER)
-- @statement
CREATE TEMP TABLE IF NOT EXISTS sc_planilha_itens(linha INTEGER PRIMARY KEY, texto TEXT, dados TEXT, contexto TEXT DEFAULT '', erro TEXT DEFAULT '', selecionada INTEGER DEFAULT 0, confirmada INTEGER DEFAULT 0, anterior INTEGER DEFAULT 0, sugestoes INTEGER DEFAULT 0)
-- @statement
CREATE TEMP TABLE IF NOT EXISTS sc_planilha_falhas(linha INTEGER, coluna INTEGER, mensagem TEXT)
-- @statement
CREATE TEMP TABLE IF NOT EXISTS sc_planilha_listas(linha INTEGER, campo TEXT, valor TEXT)
-- @statement
DELETE FROM sc_planilha_meta
-- @statement
DELETE FROM sc_planilha_celulas
-- @statement
DELETE FROM sc_planilha_campos
-- @statement
DELETE FROM sc_planilha_itens
-- @statement
DELETE FROM sc_planilha_falhas
-- @statement
DELETE FROM sc_planilha_listas
-- @statement
INSERT INTO sc_planilha_meta(hash,origem,aba) SELECT json_extract(?1,'$.hash'),json_extract(?1,'$.origem'),json_extract(?1,'$.aba')
-- @statement
INSERT INTO sc_planilha_celulas SELECT json_extract(r.value,'$.linha'),json_extract(c.value,'$.coluna'),json_extract(c.value,'$.referencia'),json_extract(c.value,'$.tipo'),json_extract(c.value,'$.valor'),json_extract(c.value,'$.unidades_utf16') FROM json_each(?1,'$.linhas') r,json_each(r.value,'$.celulas') c
-- @statement
INSERT INTO sc_planilha_campos
SELECT coluna,valor,CASE WHEN valor='texto' THEN 1 WHEN substr(valor,1,6)='texto_' AND CAST(substr(valor,7) AS INTEGER) BETWEEN 2 AND 16384 AND valor='texto_'||CAST(substr(valor,7) AS INTEGER) THEN CAST(substr(valor,7) AS INTEGER) ELSE 0 END
FROM sc_planilha_celulas WHERE linha=1 AND valor<>''
-- @statement
INSERT INTO sc_planilha_falhas SELECT 1,c.coluna,'Cabeçalho deve ser texto.' FROM sc_planilha_celulas c WHERE linha=1 AND tipo NOT IN('texto','vazio')
-- @statement
INSERT INTO sc_planilha_falhas SELECT 1,coluna,'Cabeçalho desconhecido: '||nome FROM sc_planilha_campos WHERE parte=0 AND nome NOT IN('titulo','incipit','corpus','genero','subgenero','estado','idioma','autor','persona','certeza','composicao','publicacao','tags','colecoes','justificativa','notas','arquivo_origem','localizacao_origem','corpus_sugerido','genero_sugerido','tags_sugeridas','justificativa_ia')
-- @statement
INSERT INTO sc_planilha_falhas SELECT 1,coluna,'Cabeçalho repetido: '||nome FROM sc_planilha_campos WHERE nome IN(SELECT nome FROM sc_planilha_campos GROUP BY nome HAVING count(*)>1)
-- @statement
INSERT INTO sc_planilha_falhas SELECT 1,0,'Falta o cabeçalho obrigatório texto na linha 1.' WHERE NOT EXISTS(SELECT 1 FROM sc_planilha_campos WHERE nome='texto')
-- @statement
UPDATE sc_planilha_meta SET erro=coalesce((SELECT group_concat('Linha 1, coluna '||coalesce(c.referencia,'?')||': '||f.mensagem,char(10)) FROM sc_planilha_falhas f LEFT JOIN sc_planilha_celulas c ON c.linha=1 AND c.coluna=f.coluna WHERE f.linha=1),'')
-- @statement
INSERT INTO sc_planilha_itens(linha,texto,dados)
SELECT c.linha,coalesce(group_concat(c.valor,'' ORDER BY h.parte) FILTER(WHERE h.parte>0),''),
 coalesce(json_group_object(h.nome,c.valor) FILTER(WHERE h.parte=0),'{}')
FROM sc_planilha_celulas c LEFT JOIN sc_planilha_campos h USING(coluna)
WHERE c.linha>1 GROUP BY c.linha HAVING sum(c.valor<>'' OR c.tipo='formula')>0
-- @statement
INSERT INTO sc_planilha_falhas
SELECT c.linha,c.coluna,CASE WHEN h.nome IS NULL THEN 'Célula preenchida sem cabeçalho.' WHEN c.tipo='formula' THEN 'Fórmula não é aceita; substitua por texto literal.' ELSE 'Valor deve ser do tipo texto; configure a célula como Texto e digite novamente.' END
FROM sc_planilha_celulas c LEFT JOIN sc_planilha_campos h USING(coluna)
WHERE c.linha>1 AND (c.valor<>'' OR c.tipo='formula') AND (h.nome IS NULL OR c.tipo NOT IN('texto','vazio'))
-- @statement
INSERT INTO sc_planilha_falhas SELECT linha,coluna,'Célula excede 32.767 caracteres ou 253 quebras de linha; use colunas de continuação.' FROM sc_planilha_celulas WHERE linha>1 AND (unidades_utf16>32767 OR length(replace(replace(valor,char(13)||char(10),char(10)),char(13),char(10)))-length(replace(replace(valor,char(13),''),char(10),''))>253)
-- @statement
INSERT INTO sc_planilha_falhas SELECT linha,(SELECT coluna FROM sc_planilha_campos WHERE nome='texto' LIMIT 1),'O texto da obra está vazio.' FROM sc_planilha_itens WHERE texto=''
-- @statement
INSERT INTO sc_planilha_falhas
SELECT c.linha,c.coluna,'Valor inválido para '||h.nome||': '||c.valor FROM sc_planilha_celulas c JOIN sc_planilha_campos h USING(coluna)
WHERE c.linha>1 AND c.valor<>'' AND (
 (h.nome IN('corpus','corpus_sugerido') AND c.valor NOT IN(SELECT nome FROM corpora)) OR
 (h.nome='estado' AND c.valor NOT IN('Fragmento','Rascunho','Concluído','Abandonado','Publicado')) OR
 (h.nome='certeza' AND c.valor NOT IN('Confirmado','Provável','Possível','Indeterminado')))
-- @statement
WITH RECURSIVE partes(linha,campo,resto,item) AS (
 SELECT c.linha,h.nome,c.valor||';','' FROM sc_planilha_celulas c JOIN sc_planilha_campos h USING(coluna) WHERE c.linha>1 AND h.nome IN('tags','colecoes','tags_sugeridas')
 UNION ALL SELECT linha,campo,substr(resto,instr(resto,';')+1),trim(substr(resto,1,instr(resto,';')-1)) FROM partes WHERE resto<>''
)
INSERT INTO sc_planilha_listas SELECT DISTINCT linha,campo,item FROM partes WHERE item<>''
-- @statement
WITH datas AS (
 SELECT c.linha,h.nome,c.valor FROM sc_planilha_celulas c JOIN sc_planilha_campos h USING(coluna) WHERE c.linha>1 AND h.nome IN('composicao','publicacao')
), extremos AS (
 SELECT *,substr(valor,1,10) AS a,substr(valor,12,10) AS b FROM datas
), normal AS (
 SELECT linha,nome,CASE WHEN length(a)=10 AND substr(a,3,1)='/' AND substr(a,6,1)='/' THEN substr(a,7,4)||'-'||substr(a,4,2)||'-'||substr(a,1,2) ELSE a END||
 CASE WHEN length(valor)=21 AND substr(valor,11,1)='/' THEN '/'||CASE WHEN substr(b,3,1)='/' AND substr(b,6,1)='/' THEN substr(b,7,4)||'-'||substr(b,4,2)||'-'||substr(b,1,2) ELSE b END WHEN length(valor)>10 THEN substr(valor,11) ELSE '' END AS valor FROM extremos
)
UPDATE sc_planilha_itens AS i SET dados=json_set(dados,'$.composicao',coalesce((SELECT valor FROM normal WHERE linha=i.linha AND nome='composicao'),''),'$.publicacao',coalesce((SELECT valor FROM normal WHERE linha=i.linha AND nome='publicacao'),''))
-- @statement
WITH datas AS (
 SELECT i.linha,c.coluna,json_extract(i.dados,'$.'||c.nome) AS valor FROM sc_planilha_itens i,sc_planilha_campos c WHERE c.nome IN('composicao','publicacao')
), limites AS (
 SELECT *,CASE length(valor) WHEN 4 THEN valor||'-01-01' WHEN 7 THEN valor||'-01' ELSE substr(valor,1,10) END AS inicio,
 CASE length(valor) WHEN 4 THEN valor||'-12-31' WHEN 7 THEN date(valor||'-01','+1 month','-1 day') WHEN 21 THEN substr(valor,12,10) ELSE valor END AS fim FROM datas
)
INSERT INTO sc_planilha_falhas SELECT linha,coluna,'Data inválida: '||valor FROM limites WHERE valor<>'' AND NOT coalesce(length(valor) IN(4,7,10,21) AND date(inicio,'+0 days')=inicio AND date(fim,'+0 days')=fim AND inicio<=fim AND substr(inicio,1,4)>='0001' AND (length(valor)<>21 OR substr(valor,11,1)='/'),0)
-- @statement
UPDATE sc_planilha_itens AS i SET contexto=json_object(
 'ficha',json_object('titulo',coalesce(nullif(json_extract(dados,'$.titulo'),''),'Sem título'),'incipit',coalesce(json_extract(dados,'$.incipit'),''),
 'corpus',coalesce(nullif(json_extract(dados,'$.corpus'),''),'Fragmenta'),'genero',coalesce(json_extract(dados,'$.genero'),''),'subgenero',coalesce(json_extract(dados,'$.subgenero'),''),
 'estado',coalesce(nullif(json_extract(dados,'$.estado'),''),'Rascunho'),'idioma',coalesce(json_extract(dados,'$.idioma'),''),'autor',coalesce(json_extract(dados,'$.autor'),''),
 'persona',coalesce(json_extract(dados,'$.persona'),''),'certeza',coalesce(nullif(json_extract(dados,'$.certeza'),''),'Indeterminado'),
 'composicao',json_extract(dados,'$.composicao'),'publicacao',json_extract(dados,'$.publicacao'),
 'tags',json((SELECT json_group_array(valor) FROM sc_planilha_listas WHERE linha=i.linha AND campo='tags')),
 'colecoes',json((SELECT json_group_array(valor) FROM sc_planilha_listas WHERE linha=i.linha AND campo='colecoes')),
 'justificativa',coalesce(json_extract(dados,'$.justificativa'),''),'notas',coalesce(json_extract(dados,'$.notas'),''),'arquivado',json('false'),
 'importacao_planilha',json_object('hash',(SELECT hash FROM sc_planilha_meta),'aba',(SELECT aba FROM sc_planilha_meta),'linha',linha,
 'arquivo_origem',coalesce(json_extract(dados,'$.arquivo_origem'),''),'localizacao_origem',coalesce(json_extract(dados,'$.localizacao_origem'),''),
 'corpus_sugerido',coalesce(json_extract(dados,'$.corpus_sugerido'),''),'genero_sugerido',coalesce(json_extract(dados,'$.genero_sugerido'),''),
 'tags_sugeridas',coalesce(json_extract(dados,'$.tags_sugeridas'),''),'justificativa_ia',coalesce(json_extract(dados,'$.justificativa_ia'),''),'sugestoes_aplicadas',json('false'))),
 'fontes',json('[]'),'origem',0,'motivo','Importação de planilha revisada')
-- @statement
UPDATE sc_planilha_itens AS i SET erro=coalesce((SELECT group_concat('Linha '||f.linha||', coluna '||coalesce(c.referencia,'?')||': '||f.mensagem,char(10)) FROM sc_planilha_falhas f LEFT JOIN sc_planilha_celulas c ON c.linha=f.linha AND c.coluna=f.coluna WHERE f.linha=i.linha),'')
-- @statement
UPDATE sc_planilha_itens SET anterior=linha IN(SELECT json_extract(v.ficha,'$.importacao_planilha.linha') FROM versoes v,sc_planilha_meta m WHERE json_extract(v.ficha,'$.importacao_planilha.hash')=m.hash AND json_extract(v.ficha,'$.importacao_planilha.aba')=m.aba)
-- @statement
UPDATE sc_planilha_itens SET selecionada=(erro='' AND anterior=0 AND (SELECT erro FROM sc_planilha_meta)='')
