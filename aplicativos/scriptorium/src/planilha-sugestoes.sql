UPDATE sc_planilha_itens AS i SET contexto=json_set(contexto,
 '$.ficha.corpus',CASE WHEN coalesce(json_extract(dados,'$.corpus'),'')='' THEN coalesce(nullif(json_extract(dados,'$.corpus_sugerido'),''),json_extract(contexto,'$.ficha.corpus')) ELSE json_extract(contexto,'$.ficha.corpus') END,
 '$.ficha.genero',CASE WHEN coalesce(json_extract(dados,'$.genero'),'')='' THEN coalesce(nullif(json_extract(dados,'$.genero_sugerido'),''),json_extract(contexto,'$.ficha.genero')) ELSE json_extract(contexto,'$.ficha.genero') END,
 '$.ficha.tags',json((SELECT json_group_array(valor) FROM (SELECT DISTINCT valor FROM sc_planilha_listas WHERE linha=i.linha AND campo IN('tags','tags_sugeridas')))),
 '$.ficha.importacao_planilha.sugestoes_aplicadas',json('true')),sugestoes=1
WHERE erro='' AND confirmada=0 AND sugestoes=0 AND ((?1=0 AND selecionada=1) OR linha=?1)
