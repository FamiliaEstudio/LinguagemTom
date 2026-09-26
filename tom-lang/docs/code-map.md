# Análise de projetos e navegação gráfica

Esta entrega mantém a sintaxe Tom 0.4 e acrescenta uma base de ferramentas para
código incompleto. O mapa é análise estática: `Inicialização escrita` identifica
o operando no fonte, inclusive `@ULTIMO`, e nunca afirma um valor em execução.
Veja [como abrir a demonstração no Companion](../../aplicativos/tom-companion/MAPA.md).

## Análise compartilhada

`core/semantic.js` resolve símbolos, tipos, escopos, empréstimos, efeitos e canais
de resultado antes da emissão. `compile()` entrega esse modelo verificado ao
emissor LLVM; os emissores conservam verificações defensivas para suas operações.
`analyze()` mantém a resposta versão 1, incluindo seus identificadores por linha.
O mapa utiliza a API versão 2, com identidades reconciliadas entre revisões:

```js
const { analyzeProject } = require('./tom-lang/core/compiler');
const anterior = analyzeProject({
  entry: 'main.tom', revision: 1,
  sources: {
    'main.tom': { revision: 7, source: "Importar[l'./f.tom']\nChamarxF[]" },
    'f.tom': { revision: 4, source: 'DefFuncaoxF[]yVazio\nFimFuncao' }
  }
});
const atual = analyzeProject({
  entry: 'main.tom', revision: 2,
  sources: {
    'main.tom': { revision: 7, source: "Importar[l'./f.tom']\nChamarxF[]" },
    'f.tom': { revision: 5, source: '// comentário\nDefFuncaoxF[]yVazio\nFimFuncao' }
  }
}, { previous: anterior });
```

As três APIs recebem fontes em memória: não leem arquivos nem iniciam processos.
Importações padrão também precisam constar em `sources`; o coletor da extensão
fornece esses módulos. `compile()` continua estrito e não publica LLVM com erro.

| Campo versão 2 | Contrato |
|---|---|
| `files`, `revision` | Arquivos visitados, revisões individuais e revisão do projeto. |
| `instructions` | Instruções reconhecidas ou incompletas, pai lexical, ramo, tipo, operandos e intervalos. |
| `nodes`, `symbols` | Módulos, funções, declarações, parâmetros, tipos, operações e resultados locais. |
| `edges` | Relações direcionadas e estado de resolução. |
| `references`, `calls`, `lastResults` | Símbolos associados aos usos, chamadas e produtor de cada canal de `@ULTIMO`. |
| `diagnostics`, `success` | Diagnósticos reais e ausência de erros, respectivamente. |
| `complete` | A visita não foi interrompida por importação ou orçamento. Pode ser verdadeira com código inválido; não significa aprovação. |
| `visualContext` | Evidência anterior explicitamente desatualizada para trechos agora incompletos. Não confirma relações atuais. |

`range` tem `file`, `start` e `end`, com `line`, `character` e `offset` em unidades
UTF-16, começando em zero e com fim exclusivo. `location` mantém linha/coluna em
um por compatibilidade. `ranges.command`, `ranges.name`, `ranges.arguments` e
`ranges.tokens` permitem decompor a instrução sem reinterpretar seus literais.

Os estados são `confirmed`, `incomplete` e `unresolved`. A recuperação usa o
leitor e a gramática existentes, preserva regiões independentes e mantém aberturas
incertas como fronteiras de escopo. Um fechamento ausente não transforma variáveis
locais em globais. Duplicatas ambíguas não resolvem usos arbitrariamente.

IDs independem das linhas: primeiro é comparado o contexto lexical, depois o
conteúdo e a estrutura. Renomeações únicas preservam identidade; correspondência
ambígua recebe IDs novos. A extensão também fornece `edits`, uma lista de
`{file, fromRevision, toRevision, changes:[{rangeOffset, rangeLength, text}]}`.
Somente uma cadeia de revisões completa pode desambiguar instruções repetidas.
Comentários, linhas vazias e desfazer/refazer não recriam nós reconhecíveis.
IDs não são um formato persistente entre processos sem a análise anterior.

Relações: `contains`, `declares`, `calls`, `reads`, `writes`, `argument`,
`receivesArgument`, `returns`, `produces`, `consumes`, `usesType`, `imports`,
`readsField` e `writesField`. Caminhos de campos identificam a declaração raiz
e o campo acessado. Uma aresta `reads` vai da instrução ao símbolo lido;
`produces` vai ao resultado local e `consumes` deste resultado ao consumidor.
Referência mutável concede permissão; efeitos de funções são derivados do corpo
e das chamadas. `builtins.js` declara o acesso de cada argumento nativo:
`CopiarTxt` escreve o destino e lê a origem; `AnexarTxt` também lê o destino.
As junções de fluxo invalidam os resultados conforme os canais atuais da Tom.

## Operações nativas e bibliotecas

| Operação | Contrato |
|---|---|
| `RaizQuadradaFl64[Fl64]` | Fl64; entrada negativa ou não finita gera erro. |
| `HipotenusaFl64[Fl64,Fl64]` | Fl64; usa `hypot`, verifica entradas e overflow. |
| `JanelaEventosRolagem[RefJanela,Bl]` | Ativa separadamente o evento 12. Desativado inicialmente. |
| `EventoCampoFl64[Evento,InSd32]` | Campos 1/2: ponteiro em coordenadas lógicas; 12/13: deslocamento horizontal/vertical. Campo desconhecido gera erro de faixa. |

Os campos inteiros antigos permanecem. A rolagem preserva frações, horário SDL
e normaliza `SDL_MOUSEWHEEL_FLIPPED`, conforme o [contrato SDL3](https://wiki.libsdl.org/SDL3/SDL_MouseWheelEvent).
Ela não é texto digitado nem uma tecla.

- `tom/geometria`: ponto em círculo/retângulo, distância até segmento e interseção
  de retângulos, com dimensões verificadas.
- `tom/canvas`: `CanvasCamera`, `CanvasCriar`, conversões `CanvasTelaX/Y` e
  `CanvasConteudoX/Y`, `CanvasZoom`, `CanvasDeslocar` e início/movimento/fim de
  arraste. O zoom ancorado no cursor fica entre 0,25 e 4.
- `tom/grafos`: SOA `GrafoNo` e `GrafoAresta`, inserção/atualização por ID positivo,
  remoção em cascata, organização determinística, acomodação de novos nós,
  fixação, seleção, vizinhos, filtro, teste de ponteiro, animação e desenho.
  A capacidade é declarada pelo aplicativo. As arestas guardam índices já
  verificados; aplicativos devem usar as funções de mutação para preservá-los.

`GrafoMover` respeita nós fixados em movimentos automáticos. `GrafoAnimar` recebe
horário explícito; a duração é 180 ms e o movimento reduzido aplica o destino.
O desenho recorta o painel e descarta elementos fora dele. No zoom inferior a
50%, simplifica os cartões e as setas de relações não selecionadas. Texturas de
rótulos são reutilizadas. A fonte DejaVu Sans Mono 2.37, sua licença e SHA-256
estão em `runtime/stable/assets/tom/` e `scripts/toolchain.json`.

## Atualizações e orçamento

`project-sources.js` é a fronteira de arquivos: prefere documentos abertos,
incluindo módulos não salvos. `project-worker.js` mantém um processo Node, cache
de leitura por fonte e resultado por revisão. Um cache limitado de comandos já
reconhecidos evita repetir a gramática para instruções idênticas, com localização
renovada a cada leitura: até 8.192 entradas, 2 MiB de chaves e 4.096 caracteres
por comando. Mudança de fonte invalida a análise
semântica do projeto e suas dependências; seleção apenas reutiliza o resultado.
O cache é podado quando arquivos deixam o projeto.

O protocolo antigo continua versão 1. A janela do mapa negocia `graph-v1` e
`ack-chunks`. A extensão envia `begin`, blocos de até 64 KiB e `commit`, aguardando
um ACK de cada etapa. Sessão, revisão, transferência e índice devem coincidir.
O limite nativo é 1 MiB por mensagem e oito mensagens por fila; o host mantém
uma etapa pendente. ACK expira em cinco segundos. Mensagens antigas não publicam.

A janela prepara SOA, JSON e rótulos antes de substituir a vista inteira. Falha
na preparação descarta os recursos novos e preserva o último mapa, sinalizado
como desatualizado. `R` pede sincronização. Desconexão mantém a vista consultável;
reabra pelo editor para restabelecer o processo.

Padrões: 64 arquivos, 4 MiB UTF-8, 512 nós e 2.048 arestas por vista. `options.limits`
configura a API pura; `projectView` aceita capacidades explícitas. A demonstração
tem SOA e orçamentos JSON fixados no fonte Tom: para ampliá-los, ajuste emissor e
receptor juntos e valide memória. Excesso é informado e não publica vista parcial.
Recolha funções ou use filtros para explorar partes do projeto.

## Validação reproduzível

Após preparar as ferramentas, na raiz:

```bash
source scripts/env.sh
node --test --test-isolation=none --test-concurrency=1 tom-lang/tests/*.test.js aplicativos/tom-companion/tests/*.test.js jogos/musical-tom/tests/*.test.js
npm --prefix tom-lang run benchmark:verify
node aplicativos/tom-companion/scripts/benchmark-map.js
node aplicativos/tom-companion/scripts/benchmark-map-update.js
node aplicativos/tom-companion/scripts/verify-map-desktop.js
node aplicativos/tom-companion/scripts/build.js
node aplicativos/tom-companion/scripts/verify-map-desktop.js --package
```

No Windows use `. ./scripts/env.ps1`, `node` e `npm.cmd`. Para testar a extensão
no editor real, use `verify-editor.js --code CAMINHO_CODE`; no WSL acrescente
`--wsl Ubuntu --wsl-extension CAMINHO_DA_EXTENSAO_REMOTE_WSL`. Os testes usam
perfis de editor e documentos próprios dentro de `build/`.

O benchmark grava hardware, versões, tempos e configuração em
`aplicativos/tom-companion/build/map-benchmark-PLATAFORMA.json`. A referência
local Intel i5-14400F mediu análises de 10.000 instruções em 244–347 ms no WSL2
e 214–338 ms no Windows. A cena de 512 nós/2.048 arestas, zoom 25%, renderizador
software e driver dummy, atingiu 363/435 FPS em O0/O2 no Linux e 503/514 no
Windows. Esses números isolam análise e desenho, sem compositor nem captura
por quadro; não são uma promessa de FPS para qualquer topologia ou computador.

Os testes incluem mil publicações sucessivas sem recriar rótulos idênticos,
falha após preparar um rótulo com preservação da vista, capacidades, fragmentação,
UTF-8, revisões antigas, escopos incompletos, identidades e zero objetos Tom vivos.
O teste de desktop abre a janela e envia eventos ao processo testado, incluindo
rolagem e redimensionamento. O fixture SDL verifica direção, frações e horário
na tradução nativa, além do caminho de eventos simulados.

A medição completa `benchmark-map-update.js`, após a primeira publicação, usa
o mesmo projeto de 10.000 instruções com módulos/funções recolhidos (101 nós,
100 relações). Inclui a espera de 400 ms, coleta, processo Node, blocos/ACK e
publicação na janela Tom O2: 689–780 ms no Linux e 739–850 ms no Windows, em
cinco edições sucessivas. Drivers de janela dummy isolam a medição de carga do
compositor; a navegação real foi verificada separadamente no Windows e no WSLg.
Os dados completos da referência estão em
[`validacao/mapa/`](../../aplicativos/tom-companion/validacao/mapa/).

## Apresentação integrada

O mapa agora também é apresentado no painel inferior do VS Code. O modelo de
grafo sem desenho está em `tom/grafosmodelo`; `tom/grafos` mantém a API nativa
por importação desse modelo. As duas entradas compartilham preparação atômica,
interação e câmera. Veja [painéis integrados](integrated-views.md).
