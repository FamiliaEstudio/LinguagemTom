# Contratos do MVP

## Domínio e persistência

`esquema.sql` e `pesquisa.sql` são as fontes canônicas. `generate-schema.js` gera os módulos Tom; `--check` detecta divergências. O esquema do aplicativo está na versão 1; o adaptador do editor, na versão 2. Bancos de versão desconhecida são recusados. A migração do adaptador 1→2 acrescenta contexto JSON aos documentos e às recuperações sem modificar seu conteúdo; o aplicativo faz backup antes dessa migração.

IDs inteiros AUTOINCREMENT de textos e versões são estáveis dentro do acervo, inclusive após backup/restauração. Não constituem identificadores globais para mesclar acervos. Uma versão contém TomDocumento, texto simples derivado, ficha completa, data UTC, pai e motivo. O contexto do editor inclui `ficha`, `fontes`, `origem`, `motivo` e, em restaurações, um identificador da operação. Uma revisão posterior à restauração descende da revisão restaurada recém-confirmada.

O adaptador captura documento e contexto no momento da solicitação, antes de colocá-los na fila. O reconhecimento de uma gravação não limpa alterações posteriores em memória. O UPDATE confirmado dispara, na mesma transação, a criação da versão, o histórico de ficha e atribuição, os vínculos, a atualização da versão atual e o índice FTS5. Triggers impedem alteração ou exclusão de versões. Solicitar salvamento sem mudanças não cria versão adicional. Recuperações não passam por esse trigger.

Datas parciais preservam a string original e geram limites auxiliares para os filtros. A ficha da versão anterior preserva todos os valores anteriores, inclusive certeza e justificativa. `atribuicoes.quando` registra a decisão, nunca substitui a composição.

Um original pode originar vários textos; cada versão pode referenciar vários originais e trechos. Os limites dos trechos importados são posições em pontos de código na prévia, com fronteiras de grafemas validadas. Esses vínculos são proveniência de importação, não a futura identificação crítica de versos.

## Capacidades reutilizáveis

- `PersistenciaEsquemaPreparar`, `PersistenciaDefinirContexto`, `PersistenciaObterContexto` e `PersistenciaAlterada` ampliam o adaptador sem mudar assinaturas antigas. O contexto é objeto JSON UTF-8 de até 16 MiB.
- `DocumentoRecortar` copia texto e estilos por intervalo sem alterar a origem. `EditorSomenteLeitura` preserva navegação, seleção e cópia.
- `Formulario` oferece campos textuais, seleção de opções, foco e rolagem. Seu dono é a janela; os valores são copiados. `FormularioDados` retorna um objeto JSON de strings.
- `Arquivo*` separa leitura textual UTF-8 e operações binárias. Gravações usam arquivo temporário, sincronização e publicação por rename. `DialogoArquivo` possui estados 0 em andamento, 1 concluído, 2 erro e 3 cancelado; o resultado é uma lista JSON de caminhos. Sua criação exige a thread principal.
- `TrabalhoArquivo` copia um pedido JSON e executa em thread própria. Campos 0/1/2 informam estado/progresso/erro. Resultado e mensagem só ficam disponíveis após conclusão. Destruir o handle solicita cancelamento e espera a thread terminar.
- `DocxImportar` e `DocxExportar` convertem DocumentoTexto. ZIP usa miniz 3.1.2; XML usa libxml2 2.15.4, com rede e entidades externas desativadas e DTD recusado. Partes XML são limitadas a 64 MiB; o ZIP, a 512 MiB. Limites de texto e histórico continuam os do documento de destino.
- A função SQL `tom_palavra_exata(texto,termo)` usa correspondência literal e fronteiras Unicode, sem normalizar caixa ou acentos. A pesquisa tolerante usa FTS5 `unicode61 remove_diacritics 2`.

## Pedidos dos trabalhos de arquivo

| Operação | Campos |
|---|---|
| `importar` | `origem`, `fontes` opcional; retorna hash, origem, avisos e documento |
| `exportar` | `destino`, `formato`, `documentos` em ordem; ou `banco`, `consulta` somente leitura e `parametro`, produzindo uma coluna de TomDocumento por linha |
| `backup` | `banco`, `raiz`, `destino`, `classe`, `consulta` somente leitura com caminho relativo e hash esperado opcional |
| `restaurar` | `origem` da cópia concluída e `destino` como pasta que receberá o acervo recuperado |

Exportação, ZIP/XML, cópia, hash, SQLite Backup API e conferência dos arquivos executam fora da thread gráfica. Cancelamento ocorre entre documentos, arquivos e lotes de páginas do banco; não interrompe uma publicação atômica. A captura de um documento para salvamento e as consultas de busca continuam síncronas e são medidas nos testes de escala.

## Backup e restauração

A lista de fontes e a imagem do banco pertencem à mesma transação de leitura. Os hashes esperados são comparados antes de publicar. O manifesto TomSnapshot v1 registra classe, instante, hash do banco e cada arquivo. A classe `diario` usa retenção de sete dias distintos e quatro blocos de sete dias; outras classes não são apagadas automaticamente.

A restauração valida manifesto, caminhos relativos, hashes e `PRAGMA integrity_check`; copia em staging, confere novamente e publica uma pasta separada. Não há exclusão do acervo anterior. Arquivos transitórios `.partial` não representam backups concluídos. No WSL/DrvFS, a publicação usa rename compatível com o filesystem quando RENAME_NOREPLACE não está disponível; diretórios de cópias concluídas não são substituídos.

A aplicação não implementa sincronização do banco aberto. Uma ferramenta externa pode sincronizar a pasta de backups concluídos. A primeira versão não mescla acervos nem executa análise literária automática.
