# Tom 0.4 — estado, interação e sessões reproduzíveis

A distribuição 0.4.0 amplia o [núcleo existente](core-language.md). As bibliotecas
abaixo não executam inicialização ao serem importadas. A
[demonstração integrada](../exemplos/estado/README.md) é um laboratório técnico;
o jogo, a pontuação e as regras pedagógicas permanecem futuros.

## Registros, enumerações e campos

```tom
DefEnumxFase
ItemxPronta
ItemxPausada
FimDef
DefRegistroxRelogio
PropInSd64xorigemNs
FimDef
DefRegistroxSessao
PropRegistro<Relogio>xrelogio
PropEnum<Fase>xfase
PropDc34xvalor
FimDef
DefVarRegistro<Sessao>xEstadoyPadrao
SetVarInSd64xEstado.relogio.origemNsy9007199254740993
SetVarEnum<Fase>xEstado.fasey@Fase.Pausada
DefVarRegistro<Sessao>xCopiay@Estado
```

`DefEnumxNome` contém membros `ItemxNome`; `DefRegistroxNome` contém propriedades
`PropTIPOxNome`. Ambos terminam em `FimDef`, são declarações de módulo e podem ser
importados. Os nomes de tipos também participam do espaço de símbolos: escolha
nomes distintos para tipos e variáveis/parâmetros. Ciclos de registros e nomes
duplicados são diagnosticados no fonte de origem.

Registros admitem inteiros, floats, `Dc34`, `Bl`, `Enum<Nome>` e outros registros.
Não admitem textos, recursos nem coleções embutidos. `Padrao` inicializa números
com zero, booleanos com falso e enumerações com o primeiro membro, recursivamente.
`Enum<Nome>` tem identidade própria: somente igualdade e desigualdade entre valores
do mesmo tipo; nenhum cast implícito para números. SOA aceita propriedades enum.

`Registro<Nome>` passa e retorna por valor. `RefRegistro<Nome>` é um parâmetro
emprestado mutável, restrito à duração da chamada. Campos `Dc34` são copiados
independentemente; a cópia prepara todos os campos antes de publicar o destino.
Uma falha deixa o destino intacto. O retorno é preservado antes dos `Defer`.

```tom
DefFuncaoxPausar[RefRegistro<Sessao>xDado]yVazio
SetVarEnum<Fase>xDado.fasey@Fase.Pausada
FimFuncao
ChamarxPausar[@Estado]
```

Acesso aninhado resolve símbolos e propriedades; `@Estado.relogio.origemNs` não é
substituição textual. `@ULTIMO` também pode conter um registro, mas continua local
ao bloco e inválido nas junções de fluxo. Guarde resultados em variáveis explícitas
antes de condições, laços e novas chamadas que produzam resultados.

## Iteração

```tom
ParaxI[10,0,-2]
InSd64ParaTexto[@I,@Buffer]
FimPara
ParaIndiceSOAxJ[@Itens]
SetVarBlxItens@@J.ativoyVerdadeiro
FimPara
SOAComprimento[@Itens]
DefVarInSd64xQuantidadey@ULTIMO
```

`Inicio`, `FimExclusivo` e `Passo` são `InSd64`, avaliados uma vez. O índice é local
e somente leitura. Passo zero conhecido falha na compilação; dinâmico lança erro
4. Passos negativos são permitidos. O contador intermediário usa 128 bits: chegar
ao fim não provoca overflow apenas por calcular um incremento terminal.

`ParaIndiceSOA` percorre `[0, comprimento)`. `SOAComprimento` e o nome anterior
`ComprimentoSOA` retornam `InSd64`. Índices permanecem verificados e empréstimos
`SOA` somente leitura não permitem atribuição. Cada passagem reinicializa suas
declarações e executa limpeza. `Interromper`, `Continuar`, retorno e erro executam
os `Defer` em ordem inversa, seguidos das liberações automáticas.

## Ações de entrada: `tom/entrada`

`EntradaLer[EventoNativo,Destino]` preenche `Registro<EntradaEvento>`, com tipo, coordenadas,
botão, tecla lógica, posição física, repetição, modificadores e `tempoNs` de
origem. Texto digitado permanece na operação separada `EventoTexto`.
`EntradaAtualizar[Vinculos,Acoes,Evento]` recebe esse registro e também funciona
com eventos construídos ou reproduzidos em Tom.

O chamador cria SOA de capacidade explícita dos tipos `EntradaVinculo` e
`EntradaAcao`. Cada vínculo contém `habilitado`, `grupo`, `acao`, `codigo` e
`fisica`. Vínculos habilitados do mesmo grupo formam uma combinação AND, todos
para a mesma ação; grupos distintos permitem alternativas OR. Teclas adicionais
não impedem a combinação. `EntradaValidar` verifica índices, códigos e grupos.

`EntradaAcao` expõe `mantida`, `pressionada`, `solta`, `repetida` e `tempoNs`.
Transientes são renovados por atualização; consuma-os antes da próxima chamada.
Repetição não produz nova ativação. Perda de foco libera os estados mantidos.
Depois de editar vínculos, chame `EntradaRemapear` entre atualizações para validar
e encerrar os estados antigos. As letras musicais são escolhas da aplicação.

## Arquivos e JSON: `tom/dados`

```tom
Importar[l'tom/dados']
DefRecursoxDadosyDadosUsuarioCriar[l'MinhaOrganizacao',l'MinhaAplicacao']
DefRecursoxDocumentoyJsonCriar[1048576]
JsonDefinirInSd64[@Documento,l'/versao',1]
ChamarxDadosDefinirHorario[@Documento,l'/origemNs',9007199254740993]
DefStkFB4096CxTextoyl''
JsonEscrever[@Documento,@Texto]
DadosGravar[@Dados,l'configuracao.json',@Texto]
```

`DadosUsuario` usa o [diretório de preferências SDL](https://wiki.libsdl.org/SDL3/SDL_GetPrefPath).
`DadosExiste[Dados,Caminho]` retorna `Bl`. `DadosLer[Dados,Caminho,Limite,Buffer]`
valida todo o UTF-8 e a capacidade antes de substituir o buffer. `DadosGravar`
escreve um temporário no mesmo diretório, conclui e sincroniza a escrita e então
substitui o arquivo. Caminhos absolutos, componentes `..` e NUL são rejeitados.
Diretórios intermediários devem existir. Falhas de arquivo são capturáveis; use
`DadosExiste` para manter padrões quando ainda não há configuração.

`JsonCriar[LimiteBytes]` cria um objeto; `JsonLer[Texto,LimiteBytes]` exige documento
completo, UTF-8 válido, sem chaves duplicadas. Limite cobre documentos e cópias
transacionais temporárias, portanto alterações precisam de espaço livre. A
profundidade máxima é 128; strings com NUL são rejeitadas pelo contrato de texto
Tom. O documento só é substituído depois da validação e preparação completas.

Os caminhos são JSON Pointer: `l''` aponta para a raiz, `/itens/0` para um elemento,
`~0` codifica `~`, `~1` codifica `/`; `/-` acrescenta a um array. Operações:

- `JsonExiste`, `JsonTipo`, `JsonComprimento` consultam estrutura. Constantes
  `JSON_NULO`, `JSON_BOOLEANO`, `JSON_NUMERO`, `JSON_TEXTO`, `JSON_ARRAY`, `JSON_OBJETO`
  estão em `tom/dados`.
- `JsonObterTexto[Json,Caminho,Buffer]` e `JsonObterInSd64`, `InUd64`, `Fl64`, `Bl`,
  `Dc34` retornam dados tipados. Inteiros/decimais podem vir de tokens ou strings
  decimais; inteiros exigem dígitos integrais, sem expoente/fração. Não passam por
  `double`. `Fl64` é uma conversão explícita com verificação de finitude.
- `JsonDefinirTexto`, `InSd64`, `InUd64`, `Fl64`, `Bl`, `Dc34` recebem destino,
  caminho e valor. `JsonDefinirObjeto`, `Array`, `Nulo` recebem destino e caminho.
  `JsonDefinirDocumento` copia outro documento e `JsonExtrair` cria recurso próprio.
- `JsonEscrever[Json,Buffer]` serializa sem alterar parcialmente o buffer.

A implementação usa [yyjson 0.12.0](https://github.com/ibireme/yyjson/releases/tag/0.12.0),
MIT, SHA-256 `b16246f617b2a136c78d73e5e2647c6f1de1313e46678062985bdcf1f40bb75d`.
`JsonDefinirDc34` escreve string decimal. As bibliotecas também escrevem horários,
sementes e inteiros64 de configuração como strings; versões, tipos de evento e
pequenos índices usam números. Enumerações devem ser serializadas explicitamente
por nome pela aplicação. Não há reflexão automática.

## Interface e catálogos: `tom/ui`

Ative `JanelaEventosPonteiro[Janela,Verdadeiro]` para movimento (evento 10), soltura
(11) e foco. `EventoCampo[Evento,11]` consulta a máscara de botões mantidos.
`JanelaEventosCompletos` continua ativando teclado completo separadamente. Os modos
anteriores e a calculadora preservam seus códigos e comportamento.

`UIComponente` é SOA com retângulo lógico inteiro, visibilidade, habilitação,
`Enum<UIControle>`, ID visual, ID da ação, valor `Fl64` entre 0 e 1 e seleção `Bl`.
Tipos: `Rotulo`, `Botao`, `Seletor`, `Deslizante`. `UIInicializar` prepara `UIEstado`;
`UIAtualizar[Itens,Estado,Evento]` produz `acao` (`-1` quando ausente), `alterado`,
`foco` e `redesenhar`. O chamador trata a ação, sem callbacks. `UIDesenhar` usa os
mesmos dados e o catálogo. Tab/ShiftTab mudam foco, Enter/Espaço ativam, setas
ajustam o controle deslizante. Soltura fora do botão cancela o clique; soltura fora
da janela ou perda de foco encerra o arraste.

`CatalogoVisualCriar[Janela,Capacidade]` e `CatalogoSomCriar[Audio,Capacidade]`
retornam recursos lexicais. Inserções retornam IDs positivos `InSd64`, guardáveis
em SOA. IDs expirados ou de outro catálogo falham. `CatalogoVisualTexto/Glifo`
preparam texturas; `DesenharCatalogoVisual` move/recolore sem recriá-las.
`CatalogoVisualMetrica` usa os mesmos campos de `VisualMetrica` (0 largura,
1 altura, 2 origem X, 3 linha de base, 4 avanço).

`CatalogoVisualSubstituir` e `CatalogoSomSubstituir` preparam o novo recurso antes
de liberar o anterior e preservam o ID. `CatalogoVisualRemover` invalida o ID.
`CatalogoSomRemover` cancela comandos pendentes e reproduções antes de liberar o
WAV. `CatalogoSomTocar`/`Agendar` recebem ID, canal, volume, repetição e, no segundo
caso, posição em amostras. A capacidade e o limite de memória WAV são explícitos.
Catálogos retêm seus proprietários e são liberados depois dos `Defer` do usuário.

## Relógio e calibração: `tom/sessao`

`AudioRelogioLer[Audio,Relogio]` preenche `Registro<RelogioAudio>` sob uma única
sincronização nativa: posição processada, âncora amostra/ns, compensação de áudio
e pausa. Importe a definição da biblioteca; alterar seu layout produz diagnóstico.
Uma sessão usa um áudio dedicado, criado pausado.

`SessaoConfiguracaoPadrao` retorna BPM 120, quatro batidas preparatórias, volume
0,2, semente 42 e sequência 54. `SessaoIniciar` recebe configuração, relógio e
horário explícitos, além de SOA `SessaoTrecho` para histórico limitado.
`SessaoAtualizar` conserva origens e registra pausas/retomadas e mudanças de
compensação; `SessaoEventoAmostra` relaciona horários de origem de eventos atrasados
ao trecho correto, inclusive pausas já encerradas. Esgotar o histórico é erro.

`SessaoPrazoAmostra` calcula batidas/durações racionais desde uma origem comum.
`AudioAmostraParaTempoNs` converte a amostra em prazo monotônico estimado. `MultiplicarDividirInSd64[A,B,C]` usa produto128, trunca uma única vez
e verifica a faixa final. BPM e numerador/denominador da duração são positivos e
limitados a um milhão; a contagem preparatória aceita zero. `SessaoAndamento` só
altera BPM enquanto pausado, estabelecendo nova origem da grade. `SessaoAudioPausar`
coordena a pausa nativa e a atualização do histórico.

`Calibracao` separa `entradaNs`, `audioNs` e `videoNs`. `CalibracaoAdicionar` acumula
a diferença entre batida esperada e entrada; `CalibracaoEstimar` retorna a média.
Essa estimativa **inclui a resposta humana**, não mede isoladamente o dispositivo.
Compensação de apresentação afeta só a projeção visual. A posição processada do
mixer e a estimativa de chegada ao ouvido continuam conceitos distintos.

`SessaoConfiguracaoGravar/Ler` serializam explicitamente formato versão1. A leitura
valida tudo antes de publicar o registro; arquivo inválido ou versão desconhecida
preservam o estado atual e geram erro capturável.

## Gravação e reprodução: `tom/replay`

`ReplayIniciar` recebe origem, relógio inicial, semente PCG e sequência.
`ReplayAdicionar` grava evento normalizado, captura e relógio coerente em SOA
`ReplayEvento` de capacidade explícita. Capturas devem ser não decrescentes;
o evento conserva seu instante anterior de origem. Empates conservam ordem de
inserção. Capacidade excedida gera erro5, sem descarte silencioso.

`ReplayGravar` cria JSON `TomReplay`, versão1, incluindo configuração explícita.
`ReplayLer` valida o documento inteiro antes de publicar estado, eventos e
configuração; `ReplayRebobinar` reinicia o cursor. `ReplayProximo` recebe prazo
relativo à origem da reprodução e devolve evento, relógio e `momentoNs` original.
Chame repetidamente até retornar falso para consumir eventos acumulados.

O [modelo do laboratório](../exemplos/estado/laboratorio-core.tom) usa a mesma
`LaboratorioAtualizar` para eventos nativos e gravados. Desenhar só projeta posições;
frequência de desenho não altera o estado. Os testes substituem relógio/entrada e
recolhem comandos de tom, sem comparar IDs nativos nem imagens intermediárias.
O contrato de amostras do mixer é testado separadamente. Arquivos longos/streaming,
listas dinâmicas e gravação ilimitada não fazem parte desta versão.
