# Arquivos, DOCX e trabalhos em segundo plano

As operações são registradas em `core/builtins.js` e declaradas em `runtime/stable/tom_runtime.h`. Os módulos `tom/arquivos`, `tom/docx` e `tom/formulario` expõem constantes e dependências. Não há regras do Scriptorium no runtime.

## Arquivos

`ArquivoLerTexto` aceita UTF-8 sem NUL. `ArquivoCopiar` e `ArquivoHash` operam sobre bytes, incluindo DOCX, sem conversão textual. O hash é SHA-256 em hexadecimal minúsculo. `ArquivoGravarTexto` e a cópia escrevem temporários e publicam após sincronizar os dados. `ArquivoPublicar[origem,destino,substituir]` publica por rename no mesmo filesystem; caminhos entre volumes podem falhar. A pasta de destino deve existir para gravação/cópia; `ArquivoDiretorioCriar` cria a hierarquia.

`ArquivoDiretorioUsuario[organização,aplicativo,saída]` usa o diretório de preferências SDL. `TOM_DATA_DIRECTORY` permite escolher outra raiz sem alterar a instalação. Caminhos Windows são convertidos de UTF-8 para APIs Unicode do sistema.

`DialogoArquivoCriar[modo,inicial,múltiplos]` usa modo 0 para abrir, 1 para salvar e 2 para pasta. Sua criação exige a thread principal. `DialogoArquivoEstado` informa 0 em andamento, 1 concluído, 2 erro e 3 cancelado. `DialogoArquivoResultado` retorna uma lista JSON de caminhos. A callback mantém sua própria referência; a liberação lexical não deixa um ponteiro pendente para memória liberada. Aplicativos devem manter alternativa de digitação quando o sistema não fornece um diálogo.

## DOCX e documento

`DocxImportar[caminho,RefDocumentoTexto,RefBuffer avisos]` e `DocxExportar[caminho,DocumentoTexto]` preservam texto, quebras, espaços, tabulações simples, negrito, itálico, sublinhado, tamanho inteiro entre 8 e 72 pt e alinhamento. Avisos indicam conversões e recursos não representados. A importação não executa macros, não acessa links externos e recusa DTD. A exportação recusa caracteres incompatíveis com XML 1.0.

miniz 3.1.2 e libxml2 2.15.4 têm URLs e SHA-256 fixados em `scripts/toolchain.json`; `scripts/build-docx.js` compila bibliotecas estáticas e copia licenças. No Windows, libxml2 usa bcrypt do sistema. Limites: ZIP de 512 MiB, cada parte XML de 64 MiB, profundidade de 128 nós e cadeia de estilos de 32 níveis.

`DocumentoRecortar[origem,início,fim,RefDestino]` usa intervalo semiaberto em pontos de código, exige fronteiras de grafemas e copia estilos e alinhamentos. `EditorSomenteLeitura` bloqueia mutações por entrada; seleção, cópia e navegação continuam disponíveis.

## TrabalhoArquivo

O construtor copia um objeto JSON de pedido e inicia uma thread. `ArquivoTrabalhoCampo` usa campos estado=0, progresso=1 e erro=2. Estados: executando=0, concluído=1, falhou=2, cancelado=3. Resultado e mensagem são consultáveis após conclusão. `ArquivoTrabalhoCancelar` sinaliza cancelamento; liberar o recurso também cancela e espera sua thread.

Pedidos aceitos:

- `importar`: origem, pasta de fontes opcional; retorna documento, hash, origem e avisos.
- `exportar`: destino, formato e documentos ordenados; alternativamente banco, consulta somente leitura e parâmetro textual. A consulta retorna um TomDocumento por linha, em uma coluna.
- `backup`: banco, raiz, destino, classe e consulta somente leitura com caminho relativo e hash esperado opcional. Usa uma transação de leitura e a API SQLite Backup. Publica manifesto TomSnapshot v1 após validar banco e arquivos.
- `restaurar`: origem e pasta de destino. Confere hashes e integridade e publica uma pasta nova. Não sobrescreve o acervo em uso.

O cancelamento ocorre entre unidades consistentes. A porcentagem indica avanço aproximado; uma unidade grande pode demorar sem alterar o percentual. Pedidos e documentos têm limites de memória; falhas retornam status e não são apresentadas como sucesso.

## Formulario

Recurso pertencente à janela, criado com uma fonte. `FormularioCarregar` recebe array JSON de campos com `id`, `rotulo`, `valor` e `opcoes` opcional. IDs são únicos; todos os valores são strings. Há até 128 campos e 256 opções por campo. `FormularioArea`, `FormularioFoco`, `FormularioProcessarEvento` e `FormularioDesenhar` integram o ciclo gráfico. Tab/Shift+Tab navegam, setas/espaço percorrem opções e Shift+Enter insere quebra textual.

`FormularioValor` obtém um campo, `FormularioDados` obtém um objeto JSON e `FormularioDefinirValor` atualiza um valor copiado. O formulário não grava no banco: o aplicativo define quando aplicar ou descartar seus valores.

## Contexto do editor SQLite

`PersistenciaDefinirContexto` associa um objeto JSON de até 16 MiB à edição; `PersistenciaObterContexto` o lê. `PersistenciaAlterada` considera documento e contexto. Cada solicitação captura ambos, e cada confirmação reconhece apenas a geração capturada. A recuperação restaura ambos. As chamadas anteriores permanecem válidas com contexto `{}`.

`PersistenciaEsquemaPreparar` inicializa/migra as tabelas antes de o aplicativo instalar seus triggers. A migração transacional 1→2 acrescenta `contexto` às tabelas de documentos e recuperações. Aplicativos devem fazer backup antes de migrar seus acervos. Triggers instalados pelo aplicativo podem derivar versões, metadados e índices dentro da mesma transação do salvamento.
