# Documento e editor de texto — Fase 2 do Scriptorium

A Tom oferece três recursos independentes: `DocumentoTexto` edita texto e estilos sem janela; `EditorTexto` apresenta esse documento em SDL; `PersistenciaDocumentoSQLite` mantém a versão salva e uma recuperação automática. A [oficina de escrita](../exemplos/editor/editor.tom) reúne os três e integra a barra de ferramentas com `tom/ui`.

```tom
Importar[l'tom/editor']
DefRecursoxDocumentoyDocumentoCriar[l'Olá, escritor!',67108864,134217728]
DocumentoSelecionar[@Documento,0,3]
DocumentoFormatar[@Documento,@ESTILO_NEGRITO,1]
DefRecursoxTextoyTextoCriar[l'',67108864]
DocumentoObterTexto[@Documento,@Texto]
GerarTxtxTexto
```

## Documento e posições

`DocumentoCriar[Conteudo,LimiteTextoBytes,LimiteHistoricoBytes]` retorna `DocumentoTexto`. Os limites são positivos e de até 2.147.483.647 bytes; o limite de conteúdo inclui NUL. A demonstração usa 64 MiB e 128 MiB, respectivamente. Índices auxiliares, disposição gráfica e fontes consomem memória adicional: o limite de conteúdo não é um limite da memória total do processo.

O armazenamento é UTF-8 contíguo, sobre `Texto`. Importação, inserção e colagem convertem CRLF/CR em LF. Não há normalização de acentos. As operações `Texto` continuam preservando seus bytes. Posições começam em zero e contam **pontos de código**; as operações de documento exigem fronteiras de grafemas. `e` seguido de acento combinante, bandeiras e emojis unidos não são cortados no meio. A segmentação usa utf8proc 2.11.3/Unicode 17, distribuído estaticamente com licença e hash fixados em `scripts/toolchain.json`.

| Operação | Contrato |
|---|---|
| `DocumentoObterTexto[Documento,Destino]` | Cópia independente para `Texto` ou buffer fixo. Falha se o destino não comportar todo o texto. |
| `DocumentoSelecionar[Documento,Ancora,Cursor]` | Aceita seleção invertida e posição final. Rejeita posições dentro de grafemas. |
| `DocumentoInserir[Documento,Conteudo]` | Substitui a seleção ou insere no cursor, como uma ação de desfazer. |
| `DocumentoDigitar[Documento,Conteudo,TempoNs]` | Digitação contígua pode compartilhar um grupo por até um segundo entre entradas. |
| `DocumentoApagarAnterior/Seguinte[Documento]` | Apaga seleção ou um grafema; nos extremos, não altera nada. |
| `DocumentoDesfazer/Refazer[Documento]` | Restaura conteúdo, estilos, seleção e estilo de inserção da ação. |
| `DocumentoEncerrarGrupo[Documento]` | Encerra agrupamento de digitação. |
| `DocumentoFormatar[Documento,Campo,Valor]` | Aplica estilo ao trecho ou alinhamento aos parágrafos alcançados. |
| `DocumentoEstilo[Documento,Campo]` | Valor corrente, ou `-1` quando a seleção tem valores diferentes. |
| `DocumentoAlterado[Documento]` | Compara o estado atual com o estado confirmado por salvamento. |
| `DocumentoMarcarSalvo[Documento,Estado]` | Marca o identificador enviado ao gravador; não use o estado atual ao receber confirmação de uma cópia mais antiga. Zero força estado alterado. |
| `DocumentoSerializar[Documento,Destino]` | Copia JSON v1 para `Texto` ou buffer fixo; reservar espaço para escapes e metadados. |
| `DocumentoCarregar[Documento,JSON]` | Valida tudo antes de substituir; limpa histórico e marca a representação carregada como salva. |

Leitura aceita parâmetros `DocumentoTexto`; alterações exigem `RefDocumentoTexto`. Não há empréstimo de um `Texto` mutável interno. Recursos não podem ser retornados por referências nem embutidos em registros. `DefRecurso` libera recursos lexicalmente.

`DocumentoCampo[Documento,Campo]` retorna `InSd64`. Constantes em `tom/editor`:

| Campo | Constante | Resultado |
|---|---|---|
| 0 | `DOCUMENTO_COMPRIMENTO` | Pontos de código |
| 1 / 2 | `DOCUMENTO_ANCORA` / `DOCUMENTO_CURSOR` | Extremos da seleção |
| 3 / 4 | `DOCUMENTO_PODE_DESFAZER` / `DOCUMENTO_PODE_REFAZER` | 0 ou 1 |
| 5 | `DOCUMENTO_ESTADO` | Identificador do estado, restaurado ao desfazer |
| 6 | `DOCUMENTO_REVISAO` | Geração crescente, inclusive ao desfazer/carregar |
| 7 | `DOCUMENTO_HISTORICO_BYTES` | Memória contabilizada do histórico |

O histórico guarda texto removido/inserido e diferenças dos intervalos de estilos/parágrafos. Não copia o documento inteiro por tecla. Desfazer um grupo prepara um estado temporário para garantir atomicidade. Edição após desfazer elimina o caminho de refazer. O limite remove grupos antigos completos; uma ação individual maior que o limite é rejeitada. Erros de capacidade, intervalo, UTF-8 e memória preservam texto, estilos, seleção e histórico. Alterar somente o estilo da próxima digitação não modifica o conteúdo persistente.

## Estilos

| Campo | Constante | Valores |
|---|---|---|
| 0 | `ESTILO_NEGRITO` | 0 ou 1 |
| 1 | `ESTILO_ITALICO` | 0 ou 1 |
| 2 | `ESTILO_SUBLINHADO` | 0 ou 1 |
| 3 | `ESTILO_TAMANHO` | Inteiro de 8 a 72 pontos; padrão 12 |
| 4 | `ESTILO_ALINHAMENTO` | `ALINHAR_ESQUERDA` (0), `ALINHAR_CENTRO` (1), `ALINHAR_DIREITA` (2), `ALINHAR_JUSTIFICADO` (3) |

Sem seleção, estilos de caracteres definem a próxima digitação. Com seleção, intervalos equivalentes são unidos; nenhum intervalo divide um grafema. Um parágrafo criado herda o anterior; na união prevalece o primeiro. Uma seleção cujo fim é exatamente o início de outro parágrafo não inclui esse parágrafo. Justificação distribui espaços entre palavras; a última linha fica à esquerda, sem hifenização.

## Apresentação SDL

`EditorCriar[Janela,Documento,Fonte]` retorna `EditorTexto`. Mantém referências próprias à janela e ao documento e cópias privadas de fontes. Pode haver várias instâncias, com **um editor por documento**, e um editor com foco por janela. `EditorTexto`/`RefEditorTexto` seguem as mesmas regras de empréstimo dos demais recursos. Todas as operações gráficas e de área de transferência pertencem à thread principal.

| Operação | Uso |
|---|---|
| `EditorArea[Editor,X,Y,Largura,Altura]` | Coordenadas lógicas; dimensões mínimas 32; área dentro de 16384 × 16384. |
| `EditorFoco[Editor,Ativo]` | Ativa entrada textual e encerra a composição anterior ao retirar foco. |
| `EditorProcessarEvento[Editor,Evento]` | Retorna `Bl`: se consumido, não encaminhar o mesmo evento a outro controle. |
| `EditorAtualizar[Editor,TempoNs]` | Atualiza cursor, área de composição e rolagem por arraste. Chamar em cada quadro. |
| `EditorDesenhar[Editor]` | Desenha somente linhas visíveis, com recorte. Não apresenta o quadro. |
| `EditorCampo[Editor,Campo]` | 0 foco, 1 linhas, 2 rolagem, 3 altura total, 4 bytes de texturas, 5 zoom em porcentagem. Constantes `EDITOR_*` em `tom/editor`. |
| `EditorZoom[Editor,Porcentagem]` | Ajusta a visualização entre 50% e 200%, sem alterar os estilos do documento. |
| `AreaTransferenciaLer[Janela,Destino]` | Copia UTF-8 completo; sem truncamento. |
| `AreaTransferenciaEscrever[Janela,Conteudo]` | Publica texto simples pela API SDL. |
| `JanelaTamanho[Janela,Campo]` | 0 largura, 1 altura nas coordenadas de janela. |
| `JanelaAreaLogica[Janela,Largura,Altura]` | Atualiza a área lógica para interfaces redimensionáveis. |

A disposição é compartilhada pelo desenho, cursor e identificação do clique. O cache reutiliza geometria dos parágrafos não alterados; mudanças de largura e alterações acumuladas recompõem a disposição. Texturas são criadas sob demanda para grafemas visíveis, com cache limitado a 16 MiB. Não se cria uma textura do livro inteiro. Um parágrafo muito longo ainda exige recompor suas linhas quando editado. A indexação do documento continua linear no tamanho do conteúdo.

São suportados setas, Home/End, Page Up/Down, Ctrl+Home/End, Shift para seleção, Ctrl+setas por palavras, duplo clique, arraste com rolagem, barra de rolagem arrastável, roda do mouse e Ctrl+A/C/X/V/Z/Y/Shift+Z. Letras, marcas, números e apóstrofo interno formam palavras. AltGr não aciona os atalhos Ctrl do editor. Tab permanece disponível à aplicação para alternar foco entre editor e controles; a demonstração implementa essa navegação nos dois sentidos.

O evento 13, `EVENTO_COMPOSICAO`, é opt-in por `EditorCriar`. `EventoTexto` copia a composição provisória ou o texto confirmado. Campos 15/16 representam início/comprimento da seleção da composição; campo 14 informa cliques. Os identificadores antigos não mudam. Janelas com editores usam eventos textuais dinâmicos limitados a 64 MiB, incluindo terminador; janelas antigas mantêm o contrato anterior. A composição aparece separadamente, com seleção e sublinhado; só a confirmação altera o documento e o histórico.

Colagem vazia não remove a seleção. Colagem é textual e herda o estilo de inserção; cada colagem é uma ação. Recorte publica a seleção antes de removê-la e a alteração é atômica; falha de capacidade ou memória deixa o documento intacto. Glifos ausentes são representados visivelmente, preservando o UTF-8 original. DejaVu Sans é distribuída; SDL_ttf usa HarfBuzz nos dois sistemas. O aceite desta fase abrange português/alfabetos latinos; escrita bidirecional, ligaduras entre grafemas e emojis coloridos completos não fazem parte dessa apresentação.

## JSON v1

```json
{"formato":"TomDocumento","versao":1,"texto":"Olá\n","estilos":[[4,3073]],"paragrafos":[[0,0],[4,0]]}
```

`estilos` contém pares `[fimExclusivo,estilo]`. O começo de cada intervalo é o fim do anterior, inicialmente zero. O estilo é `(tamanho << 8) | negrito | (italico << 1) | (sublinhado << 2)`; 3073 significa 12 pt em negrito. `paragrafos` contém pares `[inicio,alinhamento]`, incluindo o parágrafo vazio final quando houver LF terminal. Posições contam pontos de código, sem relação com a largura visual.

A importação exige a versão e o marcador acima, UTF-8 válido, LF, cobertura ordenada dos estilos, limites de grafemas e parágrafos coerentes com o texto. Rejeita NUL interno, estilos inválidos, intervalos fora dos limites e versões desconhecidas antes de modificar o documento. Texto vazio tem um intervalo final em zero e um parágrafo em zero. Não são persistidos histórico, cursor, composição, caches ou estado gráfico.

## SQLite assíncrono

Importe `tom/editor_sqlite`. `PersistenciaDocumentoAbrir[Caminho,Id,Documento]` abre/cria armazenamento e carrega a versão confirmada; `PersistenciaDocumentoAbrirLeitura` permite consultar armazenamento existente. `Id` é `InSd64` positivo. O caminho UTF-8 é relativo ao diretório de execução. A demonstração usa `editor-demonstracao.sqlite`, separado do acervo da Fase 1.

O adaptador mantém um trabalhador nativo e conexão própria; a Tom não ganha concorrência geral. A fila admite até oito solicitações manuais pendentes e uma automática pendente, além da operação em execução. Uma nova automática substitui a automática pendente, mantendo a ordem dos pedidos manuais. A automática substituída não gera uma conclusão própria. Fila cheia produz erro capturável. Cópias imutáveis são preparadas na thread da aplicação; transações e I/O ocorrem no trabalhador. Use `PersistenciaPausar` enquanto espera decisões do usuário.

| Operação | Contrato |
|---|---|
| `PersistenciaSolicitar[Armazenamento,Modo]` | 0 `GRAVAR_RECUPERACAO`, 1 `GRAVAR_CONFIRMADO`, 2 `DESCARTAR_RECUPERACAO`. Retorna após enfileirar. |
| `PersistenciaConsultar[Armazenamento]` | Retorna verdadeiro ao consumir uma conclusão, mesmo quando a gravação falhou. Chamar até retornar falso. |
| `PersistenciaVerificar[Armazenamento]` | Lança o erro da conclusão mais recente para `Tentar/Capturar`. |
| `PersistenciaMensagem[Armazenamento,Destino]` | Mensagem do último erro, inclusive diagnóstico SQLite. |
| `PersistenciaRecuperar[Armazenamento]` | Carrega a cópia pendente como documento alterado, sem sobrescrever a versão confirmada. |
| `PersistenciaPausar[Armazenamento,Bl]` | Suspende solicitações automáticas. |
| `PersistenciaAtualizar[Armazenamento,TempoNs]` | Agenda recuperação após 2 s sem alteração ou 15 s de escrita contínua. |

`PersistenciaCampo` retorna `InSd64`; constantes em `tom/editor_sqlite`:

| Campo | Constante | Significado |
|---|---|---|
| 0 | `PERSISTENCIA_OCUPADA` | Há trabalho ou conclusões por consumir |
| 1 | `PERSISTENCIA_TEM_RECUPERACAO` | Há cópia de recuperação |
| 2 | `PERSISTENCIA_ULTIMA_OPERACAO` | Modo da conclusão mais recente |
| 3 | `PERSISTENCIA_ERRO` | Código Tom da conclusão; zero indica sucesso |
| 4 | `PERSISTENCIA_ESTADO` | Estado do documento enviado nessa operação |
| 5 | `PERSISTENCIA_CONCLUIDA` | Identificador da solicitação concluída |
| 6 | `PERSISTENCIA_GERACAO` | Geração enviada nessa operação |
| 7 | `PERSISTENCIA_REVISAO_BANCO` | Revisão confirmada observada pela conexão |
| 8 | `PERSISTENCIA_DECIDIR_RECUPERACAO` | É preciso recuperar ou descartar antes de gravar |
| 9 | `PERSISTENCIA_SOLICITADA` | Identificador da última solicitação enviada |
| 10 | `PERSISTENCIA_CODIGO_SQLITE` | Código nativo do erro |

`tom_editor_meta` versiona o esquema; `tom_editor_documentos` guarda revisão, texto simples e JSON confirmado; `tom_editor_recuperacoes` guarda revisão-base, sequência, texto e JSON de recuperação. As duas representações são escritas na mesma transação `BEGIN IMMEDIATE`, com chaves estrangeiras, journal DELETE, sincronização FULL e espera de bloqueio de até um segundo. `tom_editor_revisoes` mantém um contador de gravações que sobrevive à exclusão da recuperação, impedindo reutilização de revisões. Comparações de revisão/sequência impedem sobrescrita por outra instância; código Tom 14 (`ERRO_CONFLITO_REVISAO`) informa conflito. O aplicativo deve preservar o documento em memória e pedir ao usuário uma decisão; não há fusão automática.

Só a conclusão bem-sucedida de uma gravação manual marca o **estado enviado** como salvo. Digitação posterior permanece alterada. Só uma transação automática concluída permite indicar “recuperação atualizada”. Falhas aparecem por consulta/mensagem/verificação; a cópia em memória é preservada. Ao fechar, primeiro pause o agendamento, envie salvar ou descartar e aguarde sua conclusão consumindo eventos. Cancelar mantém o editor aberto. A limpeza lexical drena e encerra o trabalhador; não substitui esse protocolo de fechamento responsivo.

## Compilação e verificação

A instalação nativa incorpora utf8proc, o arquivo oficial de testes de grafemas Unicode 17 e HarfBuzz no Linux. `document` não depende de SDL/SQLite; as dependências gráficas e de persistência são vinculadas somente quando utilizadas. CMake instala `tom_document`, `tom_editor` e `tom_editor_sqlite`; o compilador também compila esses módulos diretamente nos executáveis e copia fontes, bibliotecas compartilhadas e licenças.

```sh
npm --prefix tom-lang run test:document-editor
node scripts/verify-editor.js --desktop
node scripts/verify-editor-clipboard.js
npm --prefix tom-lang test
```

Em CI Linux, execute os dois roteiros de desktop dentro de `xvfb-run -a`; a área de transferência externa usa `xclip`. O roteiro de janela X11 desativa XInput2 somente no ambiente de teste para permitir eventos dirigidos via XSendEvent. Windows usa mensagens Win32 e PowerShell para a integração externa da área de transferência. Essas verificações automatizadas não substituem validação humana de teclados ABNT2 físicos, teclas mortas e IMEs instalados.

Veja o [roteiro da demonstração](../exemplos/editor/README.md) e o [relatório de validação](validation-editor.md). O organizador, listas, imagens, tabelas, paginação e DOCX continuam nas fases posteriores.
