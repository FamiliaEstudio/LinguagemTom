# Contrato do núcleo Tom 0.4

O complemento [análise e comunicação local](companion-api.md) documenta a API pura
`analyze()` e o recurso lexical `CanalMensagens`, usados pelo Tom Companion 0.1.

Este documento descreve somente o compilador estável. Exemplos executáveis e seus
resultados estão em `../exemplos/manifest.json`. Recursos não descritos aqui são
rejeitados. Não há compatibilidade de comportamento com erros do compilador antigo.

Os [acréscimos 0.4](state-0.4.md) definem registros, enumerações, `Para`, ações,
JSON, catálogos, sessões e replay. Esse contrato complementa os comandos abaixo.

## Fonte, tipos e números

Um comando por linha, codificação UTF-8. Linhas vazias são ignoradas; `//` inicia
comentário fora de uma string. Espaços internos só são permitidos em strings e nos
elementos das listas Vec4 e argumentos entre colchetes. Nomes usam letras ASCII, números e `_`, começando por
letra ou `_`. `ULTIMO` e `TomPerf_StressLevel` são reservados.

| Tipo | Faixa ou representação |
|---|---|
| `InSd32` | −2147483648 a 2147483647 |
| `InUd32` | 0 a 4294967295 |
| `InSd64` | −9223372036854775808 a 9223372036854775807 |
| `InUd64` | 0 a 18446744073709551615 |
| `Fl32` | IEEE 754 binary32 |
| `Fl64` | IEEE 754 binary64 |
| `Bl` | `0`/`Falso` ou `1`/`Verdadeiro` |
| `Dc34` | Decimal128, 34 dígitos, half-even |

Inteiros aceitam somente dígitos decimais e, nos signed, sinal negativo opcional.
Não há conversão implícita entre tipos ou sinais; `12abc`, `1.5` e `1e3` não são
inteiros. Floats aceitam parte decimal e expoente; literais precisam ser finitos e
são arredondados para o tipo declarado. Operações float seguem IEEE 754, podendo
produzir infinito ou NaN; não recebem as verificações de overflow dos inteiros.

`Somar`, `Subtr`, `Multi` e `Divid` usam `OPERACAOxyTIPOxOPERANDOyOPERANDO`.
Operandos são literais, `@variavel`, `@ULTIMO` ou acesso SOA. A divisão inteira
trunca em direção a zero. Overflow, divisão por zero e divisão signed mínimo/−1
causam erro. Casos conhecidos pelos operandos constantes falham na compilação;
os demais propagam uma exceção capturável. Sem captura, o programa executa suas
limpezas e retorna código 1. Nunca continua com um resultado inteiro corrompido.

`SomarVec4In32x[1,2,3,4]y[4,3,2,1]` e as outras três operações aceitam quatro
literais signed por lado, de 32 ou 64 bits. Todos os elementos são verificados.
Vetores não atualizam `@ULTIMO`. Nenhuma sintaxe promete quantidade fixa de ciclos.

## Variáveis e entrada

```tom
DefVarInSd32xPontosy10
SomarxyInSd32x@Pontosy20
SetVarInSd32xPontosy@ULTIMO
LerEntradaInSd32xPontos
```

Declarações exigem valor inicial. Nomes visíveis não podem ser redeclarados, mesmo
com tipo diferente. Variáveis pertencem ao escopo que as declarou e deixam de ser
visíveis no seu fim. Atribuições a variáveis externas permanecem após o escopo.

`@ULTIMO` é o último resultado tipado (inclusive registros) de aritmética, atribuição ou `GetVar` no bloco
atual. É invalidado ao entrar/sair de um escopo, depois de `SeMaior` e depois de
`ParaCadaSOA`. Use variável explícita para transportar resultados entre blocos.

`LerEntradaInSd32`, `InUd32`, `InSd64` e `InUd64` leem um token decimal da entrada
padrão, ignorando espaços ASCII iniciais. Entrada aceita `+`; unsigned rejeita `-`,
inclusive `-0`. Token inválido, EOF antes de um número e valor fora da faixa encerram
com código 1. O parser verifica a faixa antes de acumular cada dígito.

## Escopos, condições e Defer

```tom
EscopoInixBloco
DeferGerarTxtxl'Encerrado.\n'
SeMaiorxyInSd32x10y0
GerarTxtxl'Condição verdadeira.\n'
EscopoFimxBloco
```

Um escopo não repete implicitamente. Dentro de um laço, declarações reinicializam
seus valores em cada passagem. As alocações LLVM ficam na entrada da função, nunca
no corpo repetido do laço. Um escopo executa uma vez por passagem. `SeMaior` compara dois inteiros do tipo indicado; se falso,
pula o restante do escopo mais interno e executa sua limpeza. Não há `else` ou laço
implícito. `MainLoop` é experimental e rejeitado.

`Defer` registra uma ação somente quando a execução chega à declaração. A saída
normal, retorno, interrupção, continuação, condição falsa e propagação de erro
executam as ações registradas em ordem inversa. As ações podem atribuir números,
calcular, imprimir, chamar funções e executar operações de runtime. Referências numéricas usam
os valores das variáveis no momento da execução da ação; seus nomes precisam estar
visíveis no registro. Declarações, outros controles e formas `ULTIMO` não são aceitos
em `Defer`. Escopos aninhados mantêm registros independentes.

## Textos estáticos e buffers em execução

```tom
DefTxtxMensagemyl'Olá, Tom!\n'
SomarTxtxMensagemyl'100%: %s e %n são texto.\n'
GerarTxtxMensagem
DefStkFB64CxCurtoyl'Olá '
SomarlFB64CxCurtoyl'mundo'
GerarTxtUltimo
```

Strings usam `l'...'`. Escapes: `\n`, `\r`, `\t`, `\'` e `\\`. NUL e substitutos
Unicode isolados são rejeitados. Todo conteúdo é impresso como dado, nunca como
formato de `printf`. `GerarTxtxNome` imprime texto nomeado ou buffer;
`GerarTxtxl'...'` imprime diretamente.

`DefTxt`, `SetTxt` e `SomarTxt` representam textos calculados estaticamente. `SetTxt`,
`SomarTxt` só são aceitos no nível superior. Buffers `FBnC` permitem mutação dentro
de escopos, condições, funções e laços. Declarações locais têm visibilidade léxica.

`DefStkFBn[C]` e `SomarlFBn[C]` verificam o limite em bytes UTF-8, incluindo NUL.
Capacidade e modo devem corresponder à declaração. São buffers reais com duração lexical e capacidade máxima de 2147483647 bytes; o
nome histórico DefStk não promete alocação em stack. `U` é rejeitado. `SomarlI8xyxl'a'yl'b'`, `SomarlUT...`
e `SomarlFBn[C]...` concatenam literais; I8 e UT são aliases para esse caso, sem heap
ou ponteiros expostos. `GerarTxtUltimo` exige concatenação/buffer anterior no bloco;
seu estado é invalidado em entradas/saídas de escopo e condições.

## Estruturas SOA

```tom
DefStructSOAxPessoa
PropIn32xhp
PropIn32xmp
FimDef
DefArraySoAxgrupoxPessoax5
SetVarInSd32xgrupo@0.hpy10
ParaCadaSOAxgrupoxSomarhp2
GetVarxgrupoxIndex0xhp
DefVarInSd32xResultadoy@ULTIMO
```

Propriedades aceitam `In32`, `In64`, `Fl32`, `Fl64` e `Bl`; inteiros SOA são signed.
`AlocSOAxPessoaxgrupox5` e a variante `xy5` são aliases de alocação. A quantidade é
literal positiva, limitada a 2147483647 elementos; a memória necessária continua
sujeita aos limites da plataforma. Dados são reinicializados com zero toda vez que a declaração é executada e ficam em
armazenamento privado do módulo, evitando grandes alocações na stack do Windows.
Nomes respeitam os escopos e não há ponteiros arbitrários ou escape de memória.

Acesso: `grupo@0.hp` ou `grupo@@Indice.hp`; em `GetVar`, use
`GetVarxgrupoxIndex@Indicexhp`. Índices literais e dinâmicos são verificados contra
os limites. `ParaCadaSOA` adiciona um inteiro a cada propriedade inteira com
overflow verificado por elemento. O caminho atual é um laço escalar correto; não
há transformação de layout nem alteração de texto. A variante float é rejeitada.
O sufixo numérico de `ParaCadaSOA` é resolvido contra as propriedades declaradas:
se `hp` e `hp2` tornarem `Somarhp22` ambíguo, a compilação falha com `E_AMBIGUOUS`.

## API, artefatos e compatibilidade

```js
const { compile } = require('./core/compiler');
const result = compile('SomarxyInSd32x10y20', { file: 'exemplo.tom' });
// Sucesso: { success: true, diagnostics: [], artifacts:
//   { llvm: '...', runtimeRequirements: [], assetRequirements: [] } }
// Falha: { success: false, diagnostics: [{ code, severity, message,
//          file, line, column }], artifacts: {} }
```

Linha e coluna começam em 1 e são preservadas desde o fonte. `runtimeRequirements` lista `text`, `decimal`, `ui`, `time`, `math` e/ou `audio` conforme as operações usadas.
`assetRequirements` lista os assets padronizados necessários (por exemplo Bravura).
`core/native-build.js` consome esses metadados; a geração LLVM permanece separada
do link e de qualquer operação de arquivos. A API é síncrona,
determinística, sem leitura/gravação de arquivos nem execução de JavaScript do
programa. `target` só aceita `llvm`. O primeiro erro é retornado; falhas internas
inesperadas lançam exceção. A extensão consome esses mesmos diagnósticos.

Programas bem-sucedidos retornam `i32 0` de `main`. Diagnósticos do compilador vão
para stderr; diagnósticos fatais dos programas vão para stdout antes do retorno 1 de `main`.
O LLVM usa ponteiros opacos e é validado pela suíte em LLVM 21.1, sem flags de
aritmética que autorizem comportamento indefinido por overflow.

O compilador anterior, seus emitters MLIR, o host GPU gráfico e os estudos de orçamento
estão isolados como pesquisa. O caminho estável rejeita essas funcionalidades,
inclusive avaliação Comptime em JavaScript, em vez de emitir chamadas ausentes ou
substituir operações por comentários.

## Booleanos, condições e laços

```tom
DefVarBlxExecutaryVerdadeiro
DefVarInSd32xIy0
Enquantox@Executar
SomarxyInSd32x@Iy1
SetVarInSd32xIy@ULTIMO
CompararMaiorIgualxyInSd32x@Iy3
Sex@ULTIMO
Interromper
Senao
GerarTxtxl'Outra passagem.\n'
FimSe
FimEnquanto
```

`CompararIgual`, `CompararDiferente`, `CompararMenor`, `CompararMenorIgual`,
`CompararMaior` e `CompararMaiorIgual` usam `...xyTIPOxAyB` e produzem `Bl` em
`@ULTIMO`. Os operandos devem ter o mesmo tipo. `ExyBlxAyB`, `OuxyBlxAyB` e
`NaoBlxA` operam sobre booleanos, sem conversões numéricas nem curto-circuito.
`SexCONDICAO` exige Bl. `Senao` é opcional. `EnquantoxCONDICAO` consulta a condição
novamente antes de cada passagem; use uma variável Bl para atualizá-la.
`Interromper` e `Continuar` referem-se ao laço mais interno e executam as limpezas.

`@ULTIMO` não atravessa entrada, saída ou junção de blocos. Operações escalares,
comparações e chamadas com retorno definem um resultado no bloco atual. A chamada
CPU invalida o resultado anterior; uma função `Vazio` não deixa resultado numérico.
Chamadas nativas que retornam um valor também atualizam `@ULTIMO`. Operações de
texto que retornam `Vazio` usam destino explícito. `SeMaior` conserva a semântica
antiga e exige um bloco que possa abandonar, mesmo dentro de uma função.

## Funções CPU e empréstimos

```tom
DefFuncaoxSomarValores[Dc34xA,Dc34xB]yDc34
SomarxyDc34x@Ay@B
Retornarx@ULTIMO
FimFuncao
ChamarxSomarValores[0.1,0.2]
DefVarDc34xResultadoy@ULTIMO

DefFuncaoxAnotar[RefFB64CxDestino,TxtxMensagem]yVazio
AnexarTxt[@Destino,@Mensagem]
FimFuncao
DefStkFB64CxLogyl''
ChamarxAnotar[@Log,l'Concluído']
```

A assinatura é `DefFuncaoxNome[Tipo x Nome,...]yTipoRetorno`, sem os espaços
ilustrativos entre tipo, `x` e nome. Funções são declaradas no nível superior e
podem chamar funções declaradas adiante. Recursão direta ou indireta é rejeitada.
Não há closures, sobrecarga, callbacks ou despacho CPU/GPU. Toda referência precisa
ser parâmetro ou declaração local; variáveis do programa principal não são globais
implicitamente acessíveis. Funções e variáveis usam espaços de nomes separados.

Números e Bl são valores independentes. Textos estáticos podem entrar como `Txt`
(literal ou `@buffer`), uma vista UTF-8 somente leitura. `FBnC`, `Janela`, `Fonte`
e `Evento` são referências emprestadas: `RefFB64C`, `RefJanela` e `RefEvento`
autorizam mutação. Um parâmetro somente leitura não pode ser repassado como mutável.
Parâmetros de buffer exigem a capacidade declarada na assinatura; operações nativas
aceitam qualquer capacidade válida. Referências não podem ser retornadas,
armazenadas em números ou retidas depois da chamada. Aliases são permitidos; a
capacidade do buffer é fixa, e operações de texto usam cópia segura para sobreposição.

Retornos aceitam os tipos numéricos, Bl ou `Vazio`. `RetornarxVALOR` preserva o valor
antes de executar `Defer`; `Retornar` encerra uma função Vazio. Toda função com
resultado exige retorno em todos os caminhos normais. O compilador não prova laços
infinitos: mantenha um retorno após o laço quando necessário.

## Exceções e limpeza

```tom
DefVarDc34xDivisory0
Tentar
DeferGerarTxtxl'Limpeza executada.\n'
DividxyDc34x1y@Divisor
CapturarxErro
ErroMensagemxErro
GerarTxtUltimo
FimTentar
```

`Tentar` exige `CapturarxNome` e `FimTentar`. `ErroCodigo`, `ErroLinha` e
`ErroColuna` seguidos de `xNome` produzem InSd32; `ErroMensagemxNome` e
`ErroArquivoxNome` produzem texto, utilizável em `GerarTxtUltimo` ou em argumento
`@ULTIMO` de uma operação textual. Localizações começam em 1 e identificam a
operação que falhou, preservadas através das chamadas. `Relancar` dentro da
captura propaga o mesmo erro. O objeto de erro pertence somente à captura.

| Código | Falha |
|---|---|
| 1 | Overflow inteiro ou decimal |
| 2 | Divisão inválida/por zero, incluindo mínimo signed dividido por −1 |
| 3 | Subfluxo decimal inexato |
| 4 | Entrada inválida ou conversão com perda de precisão |
| 5 | Capacidade de buffer, fila ou carregamento excedida |
| 6 | Índice fora do limite |
| 7 | Memória insuficiente |
| 8 | Falha de recurso: janela, áudio ou arquivo |
| 9 | Áudio agendado para posição já processada |

Somente falhas em execução são capturáveis. Literais inválidos e operações
constantes inválidas continuam sendo erros de compilação. Não há exceções C++
atravessando a ABI: código, mensagem, arquivo, linha e coluna são propagados por
estado de erro e desvios LLVM. Uma falha em `Defer` preserva o primeiro erro e
permite as demais limpezas. Em cada escopo, os recursos automáticos são liberados
**depois** dos Defer do usuário. Defer não captura `@ULTIMO`; exige nomes explícitos.
Defer é permitido em blocos e na raiz de uma função, não na raiz do programa.

Mudança da 0.2: erros não capturados também executam Defer antes de encerrar com 1.

## Operações de buffer UTF-8

O recurso dinâmico `Texto`, criado com `TextoCriar[Conteudo,LimiteBytes]`, também
é aceito pelas operações textuais. O limite inclui NUL; a capacidade cresce sob
demanda. `FBnC` conserva capacidade fixa. Veja [texto dinâmico e SQLite](texto-sqlite.md)
para inserção, remoção, substituição, busca, vistas emprestadas e persistência.

As operações usam `Nome[arg1,arg2,...]`. `@Nome` referencia uma variável; `l'...'`
representa texto. Destinos exigem buffer mutável. Todos os índices de caracteres
contam pontos de código Unicode, não clusters de grafemas: um acento combinante
é um ponto de código separado. Capacidade e comprimento em bytes incluem/excluem,
respectivamente, o terminador NUL.

| Operação | Resultado/efeito |
|---|---|
| `CopiarTxt[@Destino,TEXTO]` | Substitui todo o conteúdo |
| `AnexarTxt[@Destino,TEXTO]` | Concatena literal, buffer ou vista Txt |
| `LimparTxt[@Destino]` | Conteúdo vazio |
| `ApagarTxt[@Destino]` | Remove o último ponto de código completo; vazio é permitido |
| `ComprimentoTxt[@Buffer]` | InUd64: bytes sem NUL |
| `QuantidadeCaracteresTxt[TEXTO]` | InUd64: pontos de código |
| `CodigoCaractereTxt[TEXTO,INDICE]` | InSd32: ponto de código; índice InUd64 |
| `RecortarTxt[@Destino,TEXTO,INICIO,QUANTIDADE]` | Copia intervalo de pontos de código, índices InUd64 |
| `TrocarCaractereTxt[@Destino,DE,PARA]` | Substitui bytes ASCII 1..127, argumentos InSd32 |
| `InteiroParaTexto[VALOR,@Destino]` | Formata InSd32 |

Texto inválido, intervalo inválido ou falta de capacidade falham antes de alterar
o destino. Recorte admite origem e destino iguais. `SomarlFBnCxNomeyl'...'`
permanece como a forma histórica de anexar literal a um buffer verificado.

## Decimal Dc34

```tom
DefVarDc34xAy0.1
DefVarDc34xBy0.2
SomarxyDc34x@Ay@B
DefVarDc34xResultadoy@ULTIMO
DefStkFB128CxVisoryl''
Dc34ParaTexto[@Resultado,@Visor]
GerarTxtxVisor // 0.3
TextoParaDc34[l'9007199254740993.1']
SetVarDc34xResultadoy@ULTIMO
```

O contexto é [decimal128 do libmpdec](https://www.bytereef.org/mpdecimal/doc/libmpdec/context.html):
34 dígitos significativos, half-even, expoente ajustado máximo 6144, mínimo normal
−6143 e menor expoente subnormal −6176. Zero é apresentado como `0`. Não há NaN
ou infinito Dc34. Overflow, divisão por zero, operações inválidas e subfluxo
inexato propagam erro; subnormais exatos são permitidos. Resultados como `1/3`
são arredondados uma vez no contexto decimal, para 34 dígitos.

Literais e conversão de texto devem ser inteiramente válidos e exatamente
representáveis. Zeros finais não contam como perda de precisão. Não há conversão
implícita de inteiros ou floats para decimal, nem o inverso. `TextoParaDc34` aceita
sinal `+` ou `-`, dígitos, parte decimal opcional com dígitos dos dois lados e
expoente opcional; rejeita espaços, vírgula, entrada parcial, NaN e infinito.
O compilador usa dígitos/BigInt; o runtime usa libmpdec 4.0.1, sem passar por double.

`Dc34ParaTexto[DECIMAL,@Buffer]` preserva todos os dígitos significativos. Usa
notação fixa quando o expoente ajustado está entre −6 e 33, científica fora desse
intervalo; remove zeros finais sem um segundo arredondamento. A calculadora usa
ponto internamente e vírgula apenas no visor e na entrada humana.

## Janela, eventos e desenho

Veja a [ABI e o guia gráfico](../runtime/stable/README.md) e o
[exemplo completo](../exemplos/calculadora.tom). Recursos só são criados com
`DefRecursoxNomeyConstrutor[...]` e pertencem ao bloco em que foram declarados.
SDL e SDL_ttf permanecem na thread principal. Não há ponteiros ou liberação manual
expostos na sintaxe Tom; a saída lexical libera automaticamente cada recurso.

## Módulos e constantes (0.3)

```tom
Importar[l'tom/musica']
Importar[l'./minha-biblioteca.tom']
DefConstInSd32xVELOCIDADEy144
DefConstFl64xGANHOy0.1
DefConstBlxATIVOyVerdadeiro
```

Importações ficam no nível superior. Caminhos começam por `./` ou `../` e são
relativos ao arquivo que importa; `tom/nome` identifica um módulo da distribuição.
O identificador normalizado é sensível a maiúsculas; mantenha a mesma grafia nas
duas plataformas. Importações repetidas são deduplicadas. Ciclos, fontes ausentes,
UTF-8 inválido e definições duplicadas produzem diagnóstico com a localização de
origem. Módulos importados só podem conter importações, funções, constantes e
estruturas. Não abrem recursos nem executam inicialização implicitamente.

Definições importadas compartilham os espaços de nomes existentes; use prefixos
para nomes públicos. Não há aliases nem declaração de exportação nesta versão.
Constantes aceitam inteiros, floats e `Bl`, com literal ou referência a outra
constante já definida. Não aceitam `Dc34`, chamadas nem valores de variáveis.
Constantes superiores ficam disponíveis às funções como valores imutáveis,
sem criar armazenamento global mutável. Constantes locais respeitam o escopo.

`compile()` continua pura e recebe todos os fontes explicitamente:

```js
compile("Importar[l'./limites.tom']\nDefVarInSd32xNy@LIMITE", {
  file: 'app/main.tom',
  modules: { 'app/limites.tom': 'DefConstInSd32xLIMITEy32' }
});
```

As chaves de `modules` são caminhos normalizados com `/`, ou `tom/musica` e
`tom/teclado`. A API pura não resolve esses módulos sozinha. A CLI e a extensão
usam `core/module-loader.js` para ler arquivos antes de chamar o compilador;
o editor considera fontes ainda não salvos.

## Coleções emprestadas (0.3)

```tom
DefStructSOAxItem
PropFl64xx
PropBlxativo
FimDef
DefFuncaoxAtivar[RefSOA<Item>xItens]yInSd64
SetVarBlxItens@0.ativoyVerdadeiro
ComprimentoSOA[@Itens]
Retornarx@ULTIMO
FimFuncao
DefArraySoAxDadosxItemx8
ChamarxAtivar[@Dados]
```

`SOA<Item>` permite leitura; `RefSOA<Item>` permite atribuições e repasse mutável.
O tipo da estrutura deve corresponder. A referência leva seu comprimento;
`ComprimentoSOA` retorna `InSd64`. Índices continuam verificados dentro da função,
inclusive em referências repassadas. Não há cópia da coleção, redimensionamento
ou escape da referência. Uma referência somente leitura não pode ser usada com
`SetVar`, `ParaCadaSOA` ou parâmetro mutável. A declaração de coleção executada
novamente reinicializa todos os campos, incluindo `Bl` como falso.

## Matemática e sorteio (0.3)

| Operação | Contrato |
|---|---|
| `InSd32ParaFl64[I]`, `InSd64ParaFl64[I]` | Fl64; valores de 64 bits podem ser arredondados como binary64 |
| `Fl64ParaInSd32[F]`, `Fl64ParaInSd64[F]` | Truncamento em direção a zero, com faixa verificada; NaN e infinito são inválidos |
| `PotenciaFl64[BASE,EXPOENTE]` | Fl64; entradas e resultado precisam ser finitos; domínio inválido/overflow propagam erro |
| `Exigir[CONDICAO]` | Bl verdadeiro retorna normalmente; falso lança erro 4, útil para pré-condições em bibliotecas |
| `SorteadorCriar[SEMENTE,SEQUENCIA]` | Recurso PCG32; dois InUd64, sequência limitada a 0..9223372036854775807 |
| `SortearInteiro[@R,LIMITE]` | InUd32 no intervalo `[0,LIMITE)`; limite InUd32 maior que zero; exige RefSorteador |

O sorteador usa PCG XSH RR 64/32 com rejeição para eliminar viés do limite.
Semente, sequência e limites idênticos produzem os mesmos inteiros em Windows e
Linux. Não se destina à criptografia. Potência usa a biblioteca matemática nativa;
não promete igualdade bit a bit entre plataformas para resultados transcendentes.

Os novos recursos `Sorteador`, `Visual`, `Audio` e `Som` seguem o cadastro central
de tipos e destrutores. Podem ser emprestados a funções, mas não retornados.
Uma visualização mantém sua janela proprietária; um som mantém seu mixer.
Os `Defer` do usuário executam antes das liberações automáticas, inclusive em erro.
O [contrato multimídia](multimedia-0.3.md) detalha tempo, entrada, desenho e áudio.
`@ULTIMO` conserva suas restrições: estado persistente precisa de variáveis.

## Animações e acabamento 2D

As transformações de visuais, formas arredondadas e bibliotecas `tom/cores`,
`tom/animacao` e `tom/efeitos` estão descritas no [contrato visual](visual-2d.md).
O desenho com tema é opt-in; `UIDesenhar` mantém sua aparência anterior.

## Câmera e grafos

`RaizQuadradaFl64`, `HipotenusaFl64`, eventos de rolagem e campos precisos do
ponteiro sustentam `tom/geometria`, `tom/canvas` e `tom/grafos`. O
[contrato do mapa](code-map.md) documenta assinaturas, capacidades, identidades e
análise estática de código incompleto. A sintaxe dos programas existentes é preservada.

## Documento, editor e persistência

Os recursos `DocumentoTexto`, `EditorTexto` e `PersistenciaDocumentoSQLite` têm parâmetros emprestados de leitura e variantes `Ref` para alteração, limpeza lexical e proibição de campos em registros. Seus contratos, eventos de composição e formato JSON estão em [Documento e editor de texto](editor-texto.md). A declaração e a verificação usam o mesmo registro nativo das demais operações estáveis.

Os recursos `Formulario`, `DialogoArquivo` e `TrabalhoArquivo`, as operações binárias e a conversão DOCX estão descritos em [Arquivos e DOCX](arquivos-docx.md). `Formulario` pertence à janela; os demais têm duração lexical independente. Os empréstimos `Ref` indicam alterações e nenhum desses handles pode ser armazenado em registros.
