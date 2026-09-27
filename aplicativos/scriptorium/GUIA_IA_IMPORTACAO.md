# Preparar textos para importar no Scriptorium

Envie à IA seus documentos Word/PDF, este guia e `modelo-importacao.xlsx`.
Peça um arquivo **XLSX** preenchido, abra-o para revisar e depois escolha
**Importar** no Scriptorium. A IA trabalha fora do aplicativo. O Scriptorium não
envia documentos a serviços externos nem lê o PDF original por este fluxo.

## Prompt pronto para copiar

> Leia os documentos anexados e preencha a aba Textos do modelo XLSX anexo,
> seguindo GUIA_IA_IMPORTACAO.md. Cada linha deve conter uma obra ou fragmento
> completo, com seus metadados em colunas e o texto literal em texto, texto_2,
> texto_3… Não resuma, reescreva, atualize a ortografia nem elimine espaços,
> tabulações, versos ou linhas em branco. Não divida uma obra a cada parágrafo
> ou página. Preserve a ordem das obras no documento.
>
> Preencha autoria, persona e datas somente quando houver informação explícita
> no documento ou nas minhas instruções. Deixe o desconhecido vazio. Registre
> dúvidas de leitura, OCR e delimitação nas notas, com arquivo e localização;
> não complete palavras ilegíveis por adivinhação. Sugestões de gênero, corpus
> e tags devem ficar exclusivamente nas colunas de sugestão, com justificativa.
> Só sugira corpus se eu fornecer os critérios de classificação.
>
> Entregue a planilha como arquivo .xlsx, com todas as células preenchidas do
> tipo texto, inclusive datas. Confira que a concatenação das células de texto
> reproduz integralmente cada obra e que nenhuma célula excede os limites deste
> guia. Informe quais passagens precisam de conferência humana. Não coloque
> comentários seus dentro do texto da obra.

Acrescente ao prompt suas instruções explícitas de autoria, quais documentos
contêm obras diferentes e, se desejar, os critérios dos seus corpora. Não é
necessário informar dados que você desconhece.

## Estrutura da planilha

- **Textos:** única aba importada. Linha 1 contém cabeçalhos; dados começam na
  linha 2. Uma linha corresponde a uma nova obra, inclusive quando usa várias
  células de continuação. Linhas totalmente vazias são ignoradas.
- **Instrucoes:** lembrete de preenchimento.
- **Exemplos:** três exemplos fictícios: poema com estrofes, fragmento sem título
  e obra com continuação. Eles não serão importados automaticamente.

Preserve o nome `Textos` e os cabeçalhos exatos, sem acentos. As colunas podem
ser reordenadas. `texto` é obrigatório; as demais podem ficar vazias ou ser
omitidas. Não duplique cabeçalhos, mescle células ou crie fórmulas. Colunas
desconhecidas são apontadas para correção, evitando perda silenciosa de dados.

| Colunas | Como preencher |
|---|---|
| `titulo`, `incipit` | Título explícito e primeiras palavras, quando conhecidos. Não invente título. |
| `texto`, `texto_2`, `texto_3`… | Conteúdo literal, na sequência numérica. É possível acrescentar mais colunas de continuação. |
| `corpus` | Classificação explícita: `Opera`, `Fragmenta`, `Bibliotheca`, `Excerpta` ou `Commentaria`. Os nomes, sozinhos, não autorizam inferir os critérios pessoais do usuário. |
| `genero`, `subgenero` | Informações explícitas; classificações inferidas vão em `genero_sugerido` e sua justificativa. |
| `estado` | `Fragmento`, `Rascunho`, `Concluído`, `Abandonado` ou `Publicado`, quando informado. |
| `idioma` | Idioma informado, por exemplo `pt`. |
| `autor` | Autor empírico informado pelo documento ou usuário. Não deduza a partir do nome de quem enviou o arquivo. |
| `persona` | Persona ou atribuição autoral explicitamente informada; vazio significa indeterminado. |
| `certeza` | `Confirmado`, `Provável`, `Possível` ou `Indeterminado`, conforme a atribuição informada. Não confunda com confiança no OCR. |
| `composicao`, `publicacao` | Datas textuais, respeitando a precisão conhecida. |
| `tags`, `colecoes` | Itens explícitos separados por `;`, por exemplo `mar; memória`. |
| `justificativa` | Evidência da atribuição autoral, quando disponível. |
| `notas` | Dúvidas, problemas de leitura e informações complementares. Não alteram o texto da obra. |
| `arquivo_origem`, `localizacao_origem` | Nome do Word/PDF e página, seção ou outro local verificável; não invente paginação. |
| `corpus_sugerido`, `genero_sugerido`, `tags_sugeridas` | Classificações propostas pela IA, separadas dos dados explícitos. Tags usam `;`. |
| `justificativa_ia` | Explicação breve das sugestões, com evidências no texto. |

O aplicativo exibirá estes padrões para campos vazios: `Sem título`, corpus
`Fragmenta`, estado `Rascunho` e certeza `Indeterminado`. São padrões de entrada,
não conclusões extraídas do documento. Autor, persona, datas, idioma e gênero
desconhecidos permanecerão vazios.

## Preservar o texto

Use quebras de linha reais dentro da célula (Alt+Enter no Excel). Não escreva
os caracteres `\n` para representá-las, não use HTML e não envolva o texto em
aspas ou blocos de Markdown. Tabulações e espaços são caracteres do conteúdo;
alinhamento, recuo e altura de linha do Excel não os substituem.

Para versos e estrofes, preserve a disposição original. Em prosa extraída de
PDF, diferencie parágrafos de quebras visuais impostas pela largura da página.
Não junte nem remova hifens automaticamente quando houver dúvida. Registre a
incerteza nas notas e peça conferência do trecho. A leitura de uma imagem ou
PDF por IA/OCR pode errar; o importador preserva o texto recebido na planilha.

Cada célula aceita no máximo **32.767 caracteres e 253 quebras de linha**.
Esses são [limites documentados pela Microsoft](https://support.microsoft.com/en-us/excel/excel-specifications-and-limits).
Ao gerar arquivos por código, conte conservadoramente caracteres como unidades
UTF-16 e nunca trunque valores para fazê-los caber. Divida antes do limite, em
fronteiras de caracteres completos, preferindo uma fronteira de parágrafo.

Continue na mesma linha em `texto_2`, `texto_3` etc. O Scriptorium reúne essas
células **sem acrescentar nenhum separador**. Se a primeira parte terminar em
um espaço ou quebra de linha, esse caractere deve permanecer em uma das partes.
A concatenação deve resultar exatamente na obra completa. A quebra CRLF/CR é
normalizada para LF pelo editor; os demais espaços e quebras são mantidos.

Exemplo: `texto` termina com `Primeiro parágrafo.` seguido de duas quebras;
`texto_2` começa com dois espaços e `Segundo parágrafo.`. O resultado tem as
duas quebras e os dois espaços. As partes não viram obras diferentes.

Escreva todas as células como strings ao gerar o XLSX. Uma obra que começa com
`=` continua sendo texto literal: não a grave como fórmula. Negrito, itálico,
fontes e tamanhos do Word/Excel não são importados por este fluxo.

## Datas

Use células do tipo **Texto** para evitar que o Excel converta uma data em
número de série. Se a célula já virou número/data, mudar apenas sua aparência
não basta: digite novamente o valor textual.

- Ano conhecido: `2011`.
- Ano e mês: `2011-03`.
- Dia completo: `2011-03-25` ou `25/03/2011`.
- Intervalo de dias completos: `2011-03-25/2011-04-02` ou
  `25/03/2011/02/04/2011`.
- Desconhecida: célula vazia. Nunca use `0`, `?` ou uma data estimada como fato.

Composição e publicação são independentes. O aplicativo rejeita datas
impossíveis e intervalos cujo término antecede o início.

## Revisar e importar

1. Em **Importar**, escolha ou digite o caminho do `.xlsx` e clique em **Aplicar**.
2. A prévia lista as obras e seleciona as linhas válidas ainda não importadas.
   Clique no título para ler o texto ou em **Ficha / avisos** para conferir os
   dados. Use `[ ]` para incluir/excluir uma linha e as páginas para percorrê-las.
3. **Aplicar sugestões** aceita as sugestões da obra exibida; **Às selecionadas**
   aceita as de todas as linhas marcadas. Dados explícitos têm prioridade:
   corpus e gênero só são preenchidos quando ausentes, e tags são acrescentadas
   sem repetição. A origem das sugestões fica registrada na ficha.
4. Corrija erros no Excel e reabra o arquivo. Linhas inválidas não podem ser
   marcadas; erros nos cabeçalhos bloqueiam o arquivo inteiro.
5. Clique em **Importar selecionadas**. Cada linha confirmada cria uma obra nova
   com versão inicial, ficha e pesquisa. **Concluir** abre a última obra criada.

Cancelar durante o lote (botão ou Esc) conclui a gravação em curso e interrompe
as próximas. Falhas também interrompem o lote. As obras já concluídas ficam no
acervo; as pendentes continuam selecionadas para tentar novamente.

Ao reabrir o **mesmo arquivo**, linhas confirmadas são reconhecidas por hash,
aba e linha e ficam desmarcadas. Marcá-las expressamente cria outras cópias.
Um XLSX alterado tem outro hash e é tratado como nova entrada: revise as marcas
antes de importar novamente. Este fluxo não atualiza obras existentes.

O XLSX integral é preservado em `fontes/` e incluído no backup. As referências
ao Word/PDF ficam na ficha, mas esses documentos não são copiados a partir de
nomes escritos nas células. Guarde também seus originais.

Limites de leitura: ZIP de 512 MiB; XML de 64 MiB por parte e 128 MiB total;
50.000 linhas, 250.000 células e 32 MiB de valores por aba. Para acervos maiores,
divida as obras entre arquivos. O aplicativo funciona sem Excel, Word, Python
ou conexão com uma IA instalados na máquina.
