# Linguagem Tom 0.4

Linguagem brasileira do Pipim Studios, com instruções lineares e tipos explícitos.
O núcleo CPU gera LLVM e oferece funções, condições, laços, exceções, buffers UTF-8,
aritmética decimal de 34 dígitos, interface 2D e áudio com SDL3.

A [calculadora](tom-lang/exemplos/calculadora.tom) é escrita em Tom: entrada, estado,
operações sequenciais e desenho. O runtime fornece operações gerais de texto,
números, janela, eventos e desenho.

A versão 0.3 acrescenta módulos, constantes, coleções compartilhadas, relógio,
teclado simultâneo, visuais preparados e áudio agendado. A biblioteca
[`tom/musica`](tom-lang/stdlib/musica.tom) e as [demonstrações técnicas](tom-lang/exemplos/multimedia/README.md)
preparam aplicações musicais. O [Musical Tom 0.1](jogos/musical-tom/README.md) usa essa base
para treinar leitura em sol e fá, com pontos, três modalidades e progresso local.

A versão 0.4 acrescenta registros e enumerações, iteração geral e as bibliotecas
`tom/entrada`, `tom/dados`, `tom/ui`, `tom/sessao` e `tom/replay`. O
[laboratório integrado](tom-lang/exemplos/estado/README.md) reúne pauta animada,
ações remapeáveis, tons/WAV, controles, calibração, arquivos JSON e reprodução.
Veja o [contrato 0.4](tom-lang/docs/state-0.4.md) e a
[validação reproduzível](tom-lang/docs/validation-0.4.md).

A [fundação do Scriptorium](tom-lang/docs/texto-sqlite.md) acrescenta texto UTF-8
dinâmico e SQLite 3.53.4 com consultas tipadas, transações, FTS5 e backup.
A [demonstração sem interface gráfica](tom-lang/exemplos/scriptorium/README.md)
valida textos de 1.024.000 caracteres e um acervo de 10.000 textos. O editor e o
organizador visual pertencem às próximas fases.

## O que está implementado

O [Tom Companion 0.1](aplicativos/tom-companion/README.md) acompanha a reconstrução
da calculadora em 22 passos práticos: acompanhamento na lateral do VS Code, explicações
do trecho selecionado, relações de funções e `@ULTIMO`, testes e retomada local.

O [mapa do código](aplicativos/tom-companion/MAPA.md) acompanha
qualquer projeto Tom no painel inferior do VS Code, inclusive módulos não salvos.
Abrir o Companion apresenta os dois painéis; a lógica permanece em Tom, sem
janelas auxiliares. O mapa expande funções,
mostra variáveis e resultados locais, preserva posições durante edições e navega
até o fonte. As bases incluem `analyzeProject()`, câmera, geometria e grafos em Tom.

O compilador atual é `tom-lang/tomc.js`. A [referência do núcleo 0.4](tom-lang/docs/core-language.md)
define a sintaxe e o comportamento suportados; o [manifesto de exemplos](tom-lang/exemplos/manifest.json)
identifica quais programas devem executar e quais devem receber diagnóstico de recurso experimental.

| Área | Disponível no núcleo atual |
|---|---|
| Compilação | API pura `compile()`, diagnósticos com arquivo/linha/coluna, geração LLVM e CLI com `--check`, `--build` e `--run`. Erros impedem a publicação de novos artefatos. |
| Tipos e números | Inteiros signed/unsigned de 32/64 bits, `Fl32`, `Fl64`, booleanos `Bl` e decimal `Dc34`. Inteiros têm overflow verificado; `Dc34` usa 34 dígitos significativos e arredondamento com empate para o par. |
| Controle e funções | Variáveis com escopo, comparações, `Se`/`Senao`, `Enquanto`, `Interromper`, `Continuar`, funções CPU com parâmetros e retorno tipados; preservação de `SeMaior`. |
| Erros e limpeza | `Tentar`/`Capturar`, relançamento, localização de falhas e `Defer` em ordem inversa nas saídas de escopo, inclusive propagação de erro. Recursos automáticos têm duração lexical. |
| Texto | Literais UTF-8, buffers fixos `FBnC` e recurso dinâmico `Texto`; inserção, remoção, substituição e busca por pontos de código, com alterações atômicas e vistas emprestadas estáveis. |
| Bibliotecas | `Importar`, constantes numéricas/booleanas, resolução de módulos pela CLI e editor; sem inicialização implícita. |
| SOA | Estruturas com propriedades numéricas e `Bl`, comprimento e índices verificados, parâmetros `SOA<Nome>`/`RefSOA<Nome>`, reinicialização por declaração. |
| Matemática | Conversões explícitas entre signed 32/64 e Fl64, potência finita e sorteador PCG32 com semente e sequência reproduzíveis. |
| Tempo e entrada | Relógio monotônico em nanossegundos, espera com prazo, teclas lógicas/físicas, pressionar/soltar, repetição, combinações e foco. |
| Interface 2D | [Animações e acabamento](tom-lang/docs/visual-2d.md): transformações, formas arredondadas, gradientes, temas e partículas em Tom. SDL3/SDL_ttf, escala lógica, redimensionamento, recorte, retângulos, linhas, elipses, fontes por caminho e texto/glifos preparados como `Visual`. |
| Áudio | Mixer estéreo 48 kHz, 32 canais, tons senoidais, WAV, repetição, volumes, pausa, fila limitada e início agendado por amostra. |
| Música | Notas com escrita preservada, frequência, posição nas claves de sol e fá, durações racionais e glifos SMuFL com Bravura 1.482. |
| Estado e iteração | Registros aninhados por valor, `RefRegistro`, enumerações nominais, `Para` e `ParaIndiceSOA`, cópias decimais transacionais e limpeza por iteração. |
| Entrada e componentes | Ações com combinações, repetição e remapeamento; botões, rótulos, seletores, deslizantes, foco, Tab/setas e arraste em bibliotecas Tom. |
| Persistência | `DadosUsuario`, gravação atômica e JSON limitado com yyjson 0.12.0; UTF-8 e números exatos, formatos versionados e publicação após validação. |
| SQLite | Biblioteca estática 3.53.4, consultas parametrizadas e tipadas, rollback lexical, FTS5 e backup, sem dependência gráfica ou servidor. |
| Sessões e recursos | Catálogos de visuais/sons com IDs verificados, relógio coerente de áudio, pausas, calibração e gravação/reprodução independente do desenho. |
| Calculadora | Mouse e teclado, quatro operações sequenciais, decimal com ponto/vírgula, repetir `=`, trocar sinal, limpar, apagar e recuperar-se de erros sem fechar a janela. |
| Musical Tom | Jogo em pasta própria: Aprender, Movimento e Ritmo, sol/fá, acidentes, fundos livres, desbloqueios e perfil JSON local. [Jogar e compilar](jogos/musical-tom/README.md). |
| VS Code | Extensão local 0.4.0 com cores, snippets e diagnósticos que acompanham módulos, inclusive alterações ainda não salvas. |
| Companion | Construção comentada da calculadora, dicas graduais, verificação de código não salvo, avanço manual e progresso atômico. API pura `analyze()` e canal lexical de mensagens locais. |
| Ferramentas | Instaladores locais, versões fixadas, testes de regressão e workflow de CI para Windows e Linux. |

### Limitações atuais

- Registros não embutem textos, recursos ou coleções. SOA, catálogos e gravações de replay têm capacidade fixa explícita; não há listas genéricas dinâmicas ou replay ilimitado.
- Funções CPU não têm recursão, closures, sobrecarga ou callbacks. Referências emprestadas não podem escapar da chamada.
- `@ULTIMO` pertence ao bloco; resultados entre blocos exigem variáveis explícitas. Textos estáticos só podem ser alterados no nível superior; use `FBnC` ou `Texto` para mutação em execução.
- `ParaCadaSOA` com float é rejeitado. Não há otimização automática de layout nem promessa de vetorização ou de quantidade fixa de ciclos.
- A calculadora executa na ordem dos comandos: `2 + 3 × 4 =` resulta em `20`. Ela não analisa expressões nem parênteses.
- Os builds locais de referência são Windows x64 com LLVM-MinGW/UCRT e Linux x64 com glibc e X11/XWayland, incluindo WSLg. Outras arquiteturas e ambientes gráficos não estão validados.
- A extensão é instalada por VSIX local. O pacote gerado neste repositório não depende de publicação no Marketplace.
- A posição de áudio mede quadros processados pelo mixer. Sua correlação com o relógio e a chegada ao dispositivo são estimativas; a compensação de latência depende de calibração.
- WAV é carregado integralmente com limite explícito de memória. Não há streaming de arquivos longos; formatos aceitos e limites estão no [contrato multimídia](tom-lang/docs/multimedia-0.3.md).

## Planos futuros e pesquisa

Os itens abaixo **não estão disponíveis no compilador estável**. São propostas ou
protótipos preservados para evolução, sem compromisso de prazo ou de sintaxe final.
Comandos experimentais são rejeitados explicitamente pelo núcleo atual.

| Frente | Trabalho que ainda falta |
|---|---|
| Execução GPU e funções CPU/GPU | Completar compilação, upload/download, despacho e APIs do runtime com comportamento verificável. Ver [estudo de unificação](tom-lang/docs/heterogeneous_cpu_gpu_unification.md). |
| Backend MLIR | Integrar e validar o lowering e sua execução, hoje mantidos como [proposta](tom-lang/docs/mlir_lowering_paracadasoa.md). |
| `Comptime` | Definir uma avaliação controlada e verificável em compilação; a execução de JavaScript do compilador antigo não integra o núcleo atual. |
| SOA e otimizações | Implementar operações float e transformações estruturadas de layout/vetorização, comprovando que preservam resultados e textos literais. |
| Segurança e orçamento de execução | Definir e implementar as propostas de regiões/`Inseguro`, ciclos e LiveBudget. Os [estudos Tom Live](PesquisaTomLive.md) ainda não representam garantias da linguagem. |
| Evolução de Musical Tom | Acordes, outras claves, figuras rítmicas variadas, importação de partituras e execução das melodias completas pelo jogador. |
| Formatos e instrumentos | Instrumentos realistas, streaming, MP3/OGG, MIDI, MusicXML, microfone e interpretação completa de partituras. |

O [compilador anterior e seus artefatos](tom-lang/experimental/README.md), o host GPU
e os exemplos antigos de jogos são material de pesquisa. A interface SDL3 da
calculadora usa o runtime estável separado. A entrada de qualquer proposta no
núcleo exige semântica documentada, diagnósticos e testes de execução nas duas plataformas.

## Preparar e abrir a calculadora

Na raiz do repositório, Linux/WSL x64:

```bash
bash scripts/setup-linux.sh
source scripts/env.sh
node tom-lang/tomc.js --run tom-lang/exemplos/calculadora.tom
```

No Windows x64, PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-windows.ps1
. ./scripts/env.ps1
node tom-lang/tomc.js --run tom-lang/exemplos/calculadora.tom
```

Os instaladores guardam Node 24.21.0, LLVM 21.1.8, CMake, Ninja, SDL3 3.4.16,
SDL_ttf 3.2.2, libmpdec 4.0.1, yyjson 0.12.0 e SQLite 3.53.4 em `.tools/`, sem alterar o PATH global.
Consulte os [pré-requisitos e instruções WSL](scripts/README.md).

Para abrir as novas demonstrações, depois de ativar o mesmo ambiente:

```text
node tom-lang/tomc.js --run --assets tom-lang/exemplos/multimedia/assets tom-lang/exemplos/estado/laboratorio.tom
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/animacao.tom
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/teclado.tom
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/catalogo.tom
node tom-lang/tomc.js --run --assets tom-lang/exemplos/multimedia/assets tom-lang/exemplos/multimedia/audio.tom
```

No áudio, A–G tocam notas e Espaço pausa/retoma; Escape fecha cada demonstração.
`--assets DIRETORIO` inclui arquivos próprios em `assets/` no pacote. Bravura e sua
licença são incluídas automaticamente ao importar `tom/musica`.

`--build` verifica o LLVM, compila e publica uma pasta independente. Copie **toda**
a pasta `tom-lang/exemplos/build/<plataforma-arquitetura-abi>/calculadora/` para distribuir a aplicação da
plataforma usada no build (`linux-x64-gnu` ou `windows-x64-mingw`). O destinatário executa `calculadora.exe` no Windows ou
`./calculadora` no Linux, sem Node ou LLVM. A fonte tipográfica, bibliotecas e licenças acompanham
o executável. Linux requer um desktop X11/XWayland e uma glibc compatível com o
sistema de build. Para produzir as duas versões, execute o build em cada sistema.

Sem `--build`/`--run`, a CLI preserva a saída LLVM em `build/<nome>.ll`.
`--check` valida; `--out-dir DIR` escolhe a pasta; `-o ARQUIVO` vale para LLVM.
Erros impedem a publicação e preservam a última compilação válida. Confira sempre
se o comando terminou com sucesso antes de executar uma compilação anterior.

## Cores no VS Code

A [extensão Tom](tom-lang/README.md) distingue funções, variáveis, parâmetros, tipos,
textos e comentários respeitando o tema do editor. Gere o pacote com
`npm ci --prefix tom-lang --ignore-scripts` e
`npm --prefix tom-lang run package:extension`; instale
`tom-lang/build/tom-lang-0.4.0.vsix` pelo menu **Extensões → … → Instalar do VSIX**.

Com as ferramentas e o [Companion](aplicativos/tom-companion/README.md) preparados,
use **Tom: Abrir Tom Companion** na paleta (`Ctrl+Shift+P`), o botão no editor Tom
ou **Ctrl+Alt+Shift+T**. A extensão detecta o build neste repositório e lembra a
pasta escolhida para a calculadora. Após atualizar uma extensão antiga, recarregue
a janela do VS Code.

## Testes

Depois de ativar o ambiente:

```bash
npm ci --prefix tom-lang --ignore-scripts
npm --prefix tom-lang test
node scripts/verify-desktop.js
node scripts/verify-multimedia.js
node scripts/verify-state.js
```

A suíte verifica LLVM e executa programas em `-O0` e `-O2`, incluindo os 43 casos
anteriores, controle de fluxo, limpeza, UTF-8, 261 vetores decimais publicados e a
calculadora com eventos simulados. `verify-desktop.js` abre uma janela real e envia
teclado, mouse, redimensionamento e fechamento exclusivamente à aplicação criada
pelo teste. No WSL exige WSLg; em Linux exige `DISPLAY`. Capturas e logs ficam em
`.tools/<plataforma>/validation/`. [Resultados locais](tom-lang/docs/validation-0.2.md).

A validação 0.3 acrescenta módulos, SOA emprestada, PCG, teclado/foco, métricas de
glifos e mixer renderizado em memória. `verify-multimedia.js` exercita as quatro
demonstrações em O0/O2 com drivers simulados; `--desktop` abre janelas reais e
`--package` executa os pacotes de produção com o ambiente de desenvolvimento
removido. `verify-audio-device.js` reproduz um som curto no dispositivo real.
Consulte [procedimentos e resultados da 0.3](tom-lang/docs/validation-0.3.md).

A validação 0.4 acrescenta registros, enumerações, iteração, JSON, componentes e
reprodução da mesma lógica do laboratório a 30/60/144 FPS. `verify-state.js`
exercita as quatro demonstrações; `--desktop` valida janelas reais e `--package`
valida os executáveis distribuíveis. [Resultados 0.4](tom-lang/docs/validation-0.4.md).

A [CI](.github/workflows/core.yml) está configurada para executar testes em Linux e Windows.
O estado de cada execução remota deve ser consultado no [GitHub Actions](https://github.com/FamiliaEstudio/LinguagemTom/actions).
Dependências ausentes causam falha; testes nativos não são silenciosamente ignorados.

## Calculadora C e benchmarking

Há uma [versão C17 da calculadora e estrutura de benchmark](benchmarks/calculator/README.md)
usando os mesmos runtimes decimal e SDL3 da Tom. Os testes comparam valores,
mensagens e desenho antes de medir processamento sem renderização, desenho em
software e espera ociosa. As amostras e os relatórios ficam em `build/`, fora do Git.

```text
npm --prefix tom-lang run calculator:c
npm --prefix tom-lang run benchmark:verify
node benchmarks/calculator/run.js --quick
```

A comparação caracteriza as implementações atuais de Tom e C. Python e C# ainda
não têm versões nesse benchmark. Consulte o guia para a metodologia e as limitações.

## Organização

- `tom-lang/core/`: parser, tipos e emissão LLVM; `compile()` é uma API pura.
- `tom-lang/core/native-build.js` e `tom-lang/tomc.js`: ferramentas, link e publicação.
- `tom-lang/runtime/stable/`: ABI C para texto, decimais e SDL; sem lógica de calculadora.
- `tom-lang/stdlib/`: módulos Tom de música, entrada, dados, interface, sessão e reprodução.
- `tom-lang/exemplos/`: programas e manifesto com resultados esperados.
- `tom-lang/extension.js`, `snippets.json`, `syntaxes/`: editor com os mesmos diagnósticos.
- `tom-lang/tests/`: regressões e execução nativa.
- `benchmarks/calculator/`: calculadora C, roteiro comparativo e instrumentos de medição.
- `tom-lang/experimental/`: protótipos e artefatos anteriores, preservados para pesquisa.

Novos artefatos ficam em `build/` e `.tools/`, ignorados pelo Git. A extensão 0.3
deve ser empacotada a partir destes fontes; os VSIX históricos não contêm o núcleo
atual. O [README histórico](tom-lang/docs/history/README-original.md) preserva as propostas antigas
e não deve ser usado como referência de recursos implementados.

O componente reutilizável da Fase 2 do Scriptorium está documentado em [Documento e editor de texto](tom-lang/docs/editor-texto.md), com [demonstração gráfica](tom-lang/exemplos/editor/README.md).

O [Scriptorium](aplicativos/scriptorium/README.md) reúne acervo literário, escrita, versões, pesquisa, DOCX e backup em uma aplicação Tom local, com pacote independente para Windows e Linux.
