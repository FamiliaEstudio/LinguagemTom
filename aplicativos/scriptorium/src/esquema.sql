-- Schema owned by the Tom application. Each marker starts one prepared statement.
CREATE TABLE scriptorium_meta(versao INTEGER NOT NULL CHECK(versao=1), criado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')))
-- @statement
INSERT INTO scriptorium_meta(versao) VALUES(1)
-- @statement
CREATE TABLE corpora(nome TEXT PRIMARY KEY)
-- @statement
INSERT INTO corpora VALUES('Opera'),('Fragmenta'),('Bibliotheca'),('Excerpta'),('Commentaria')
-- @statement
CREATE TABLE autores(id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE)
-- @statement
CREATE TABLE personas(id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE)
-- @statement
INSERT INTO personas(nome) VALUES('Eric Lacques'),('Teodoro'),('Leonardo'),('Felipe')
-- @statement
CREATE TABLE textos(id INTEGER PRIMARY KEY AUTOINCREMENT, atual_id INTEGER REFERENCES versoes(id), criado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')))
-- @statement
CREATE TABLE fontes(hash TEXT PRIMARY KEY CHECK(length(hash)=64 AND hash NOT GLOB '*[^0-9a-f]*'), caminho TEXT NOT NULL, origem TEXT NOT NULL, importado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')))
-- @statement
CREATE TABLE versoes(
 id INTEGER PRIMARY KEY AUTOINCREMENT, texto_id INTEGER NOT NULL REFERENCES textos(id),
 pai_id INTEGER REFERENCES versoes(id), criado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 documento TEXT NOT NULL CHECK(json_valid(documento)), conteudo TEXT NOT NULL,
 ficha TEXT NOT NULL CHECK(json_valid(ficha)), motivo TEXT NOT NULL DEFAULT '',
 titulo TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.titulo'),'')) STORED,
 corpus TEXT GENERATED ALWAYS AS (json_extract(ficha,'$.corpus')) STORED REFERENCES corpora(nome),
 genero TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.genero'),'')) STORED,
 estado TEXT GENERATED ALWAYS AS (json_extract(ficha,'$.estado')) STORED,
 autor TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.autor'),'')) STORED,
 persona TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.persona'),'')) STORED,
 certeza TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.certeza'),'Indeterminado')) STORED,
 composicao TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.composicao'),'')) STORED,
 data_inicio TEXT GENERATED ALWAYS AS (CASE length(composicao) WHEN 0 THEN NULL WHEN 4 THEN composicao||'-01-01' WHEN 7 THEN composicao||'-01' ELSE substr(composicao,1,10) END) STORED,
 data_fim TEXT GENERATED ALWAYS AS (CASE length(composicao) WHEN 0 THEN NULL WHEN 4 THEN composicao||'-12-31' WHEN 7 THEN date(composicao||'-01','+1 month','-1 day') WHEN 21 THEN substr(composicao,12,10) ELSE composicao END) STORED,
 publicacao TEXT GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.publicacao'),'')) STORED,
 publicacao_inicio TEXT GENERATED ALWAYS AS (CASE length(publicacao) WHEN 0 THEN NULL WHEN 4 THEN publicacao||'-01-01' WHEN 7 THEN publicacao||'-01' ELSE substr(publicacao,1,10) END) STORED,
 publicacao_fim TEXT GENERATED ALWAYS AS (CASE length(publicacao) WHEN 0 THEN NULL WHEN 4 THEN publicacao||'-12-31' WHEN 7 THEN date(publicacao||'-01','+1 month','-1 day') WHEN 21 THEN substr(publicacao,12,10) ELSE publicacao END) STORED,
 arquivado INTEGER GENERATED ALWAYS AS (coalesce(json_extract(ficha,'$.arquivado'),0)) STORED,
 CHECK(corpus IS NOT NULL), CHECK(estado IS NOT NULL AND estado IN ('Fragmento','Rascunho','Concluído','Abandonado','Publicado')),
 CHECK(certeza IN ('Confirmado','Provável','Possível','Indeterminado')), CHECK(arquivado IN(0,1)),
 CHECK(json_type(ficha,'$.tags') IS 'array' AND json_type(ficha,'$.colecoes') IS 'array'),
 CHECK(length(composicao) IN(0,4,7,10,21)),
 CHECK(composicao='' OR (date(data_inicio,'+0 days') IS NOT NULL AND date(data_inicio,'+0 days')=data_inicio AND date(data_fim,'+0 days') IS NOT NULL AND date(data_fim,'+0 days')=data_fim AND data_inicio<=data_fim AND substr(data_inicio,1,4)>='0001' AND (length(composicao)<>21 OR substr(composicao,11,1)='/'))),
 CHECK(length(publicacao) IN(0,4,7,10,21)),
 CHECK(publicacao='' OR (date(publicacao_inicio,'+0 days') IS NOT NULL AND date(publicacao_inicio,'+0 days')=publicacao_inicio AND date(publicacao_fim,'+0 days') IS NOT NULL AND date(publicacao_fim,'+0 days')=publicacao_fim AND publicacao_inicio<=publicacao_fim AND substr(publicacao_inicio,1,4)>='0001' AND (length(publicacao)<>21 OR substr(publicacao,11,1)='/')))
)
-- @statement
CREATE INDEX versoes_texto ON versoes(texto_id,id)
-- @statement
CREATE INDEX versoes_filtros ON versoes(persona,corpus,genero,data_inicio,data_fim)
-- @statement
CREATE TABLE tags(id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE)
-- @statement
CREATE TABLE colecoes(id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE)
-- @statement
CREATE TABLE versao_tags(versao_id INTEGER NOT NULL REFERENCES versoes(id), tag_id INTEGER NOT NULL REFERENCES tags(id), PRIMARY KEY(versao_id,tag_id))
-- @statement
CREATE TABLE versao_colecoes(versao_id INTEGER NOT NULL REFERENCES versoes(id), colecao_id INTEGER NOT NULL REFERENCES colecoes(id), PRIMARY KEY(versao_id,colecao_id))
-- @statement
CREATE TABLE versao_fontes(versao_id INTEGER NOT NULL REFERENCES versoes(id), fonte_hash TEXT NOT NULL REFERENCES fontes(hash), inicio INTEGER NOT NULL CHECK(inicio>=0), fim INTEGER NOT NULL CHECK(fim>=inicio), PRIMARY KEY(versao_id,fonte_hash,inicio,fim))
-- @statement
CREATE TABLE historico_fichas(id INTEGER PRIMARY KEY, texto_id INTEGER NOT NULL REFERENCES textos(id), versao_id INTEGER NOT NULL REFERENCES versoes(id), anterior TEXT, nova TEXT NOT NULL, quando TEXT NOT NULL, responsavel TEXT NOT NULL DEFAULT 'local')
-- @statement
CREATE TABLE atribuicoes(id INTEGER PRIMARY KEY, texto_id INTEGER NOT NULL REFERENCES textos(id), versao_id INTEGER NOT NULL REFERENCES versoes(id), anterior TEXT, persona TEXT NOT NULL, certeza TEXT NOT NULL, justificativa TEXT NOT NULL, quando TEXT NOT NULL)
-- @statement
CREATE VIRTUAL TABLE pesquisa USING fts5(titulo,conteudo,content='versoes',content_rowid='id',tokenize='unicode61 remove_diacritics 2')
-- @statement
CREATE VIEW acervo AS SELECT v.* FROM textos t JOIN versoes v ON v.id=t.atual_id
-- @statement
CREATE TRIGGER versoes_imutaveis BEFORE UPDATE ON versoes BEGIN SELECT raise(ABORT,'Versões são imutáveis; crie uma nova revisão.'); END
-- @statement
CREATE TRIGGER versoes_preservadas BEFORE DELETE ON versoes BEGIN SELECT raise(ABORT,'Versões não podem ser apagadas.'); END
-- @statement
CREATE TRIGGER versoes_inseridas AFTER INSERT ON versoes BEGIN
 SELECT CASE WHEN new.pai_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM versoes p WHERE p.id=new.pai_id AND p.texto_id=new.texto_id) THEN raise(ABORT,'Versão de origem pertence a outro texto.') END;
 INSERT INTO pesquisa(rowid,titulo,conteudo) VALUES(new.id,new.titulo,new.conteudo);
 INSERT OR IGNORE INTO autores(nome) SELECT new.autor WHERE new.autor<>'';
 INSERT OR IGNORE INTO personas(nome) SELECT new.persona WHERE new.persona<>'';
 INSERT OR IGNORE INTO tags(nome) SELECT trim(value) FROM json_each(new.ficha,'$.tags') WHERE type='text' AND trim(value)<>'';
 INSERT OR IGNORE INTO colecoes(nome) SELECT trim(value) FROM json_each(new.ficha,'$.colecoes') WHERE type='text' AND trim(value)<>'';
 INSERT INTO versao_tags SELECT new.id,id FROM tags WHERE nome IN(SELECT trim(value) FROM json_each(new.ficha,'$.tags'));
 INSERT INTO versao_colecoes SELECT new.id,id FROM colecoes WHERE nome IN(SELECT trim(value) FROM json_each(new.ficha,'$.colecoes'));
 INSERT INTO historico_fichas(texto_id,versao_id,anterior,nova,quando) SELECT new.texto_id,new.id,v.ficha,new.ficha,new.criado FROM textos t LEFT JOIN versoes v ON v.id=t.atual_id WHERE t.id=new.texto_id AND (v.id IS NULL OR v.ficha<>new.ficha);
 INSERT INTO atribuicoes(texto_id,versao_id,anterior,persona,certeza,justificativa,quando) SELECT new.texto_id,new.id,v.persona,new.persona,new.certeza,coalesce(json_extract(new.ficha,'$.justificativa'),''),new.criado FROM textos t LEFT JOIN versoes v ON v.id=t.atual_id WHERE t.id=new.texto_id AND (v.id IS NULL OR v.persona<>new.persona OR v.certeza<>new.certeza OR coalesce(json_extract(v.ficha,'$.justificativa'),'')<>coalesce(json_extract(new.ficha,'$.justificativa'),''));
 UPDATE textos SET atual_id=new.id WHERE id=new.texto_id;
END
-- @statement
CREATE TRIGGER confirmar_versao AFTER UPDATE OF documento,contexto ON tom_editor_documentos
 WHEN json_type(new.contexto,'$.ficha')='object' AND (old.documento<>new.documento OR old.contexto<>new.contexto)
BEGIN
 INSERT INTO versoes(texto_id,pai_id,documento,conteudo,ficha,motivo)
 SELECT new.id,CASE WHEN json_extract(new.contexto,'$.operacao') IS NOT json_extract(old.contexto,'$.operacao') OR json_extract(new.contexto,'$.origem') IS NOT json_extract(old.contexto,'$.origem') THEN coalesce(nullif(json_extract(new.contexto,'$.origem'),0),atual_id) ELSE atual_id END,new.documento,new.texto,json_extract(new.contexto,'$.ficha'),coalesce(json_extract(new.contexto,'$.motivo'),'') FROM textos WHERE id=new.id;
 INSERT OR IGNORE INTO versao_fontes SELECT t.atual_id,json_extract(f.value,'$.hash'),json_extract(f.value,'$.inicio'),json_extract(f.value,'$.fim') FROM textos t,json_each(new.contexto,'$.fontes') f WHERE t.id=new.id;
END
-- @statement
CREATE TABLE configuracao(chave TEXT PRIMARY KEY, valor TEXT NOT NULL)
-- @statement
PRAGMA application_id=1396920912
