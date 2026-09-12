# Linguagem Tom 0.2

Linguagem brasileira do Pipim Studios, com instruções lineares e tipos explícitos.
O núcleo CPU gera LLVM e oferece funções, condições, laços, exceções, buffers UTF-8,
aritmética decimal de 34 dígitos e interface 2D com SDL3.

A [calculadora](tom-lang/exemplos/calculadora.tom) é escrita em Tom: entrada, estado,
operações sequenciais e desenho. O runtime fornece operações gerais de texto,
números, janela, eventos e desenho.

## O que está implementado

O compilador atual é `tom-lang/tomc.js`. A [referência do núcleo 0.2](tom-lang/docs/core-language.md)
define a sintaxe e o comportamento suportados; o [manifesto de exemplos](tom-lang/exemplos/manifest.json)
identifica quais programas devem executar e quais devem receber diagnóstico de recurso experimental.

| Área | Disponível no núcleo atual |
|---|---|
| Compilação | API pura `compile()`, diagnósticos com arquivo/linha/coluna, geração LLVM e CLI com `--check`, `--build` e `--run`. Erros impedem a publicação de novos artefatos. |
| Tipos e números | Inteiros signed/unsigned de 32/64 bits, `Fl32`, `Fl64`, booleanos `Bl` e decimal `Dc34`. Inteiros têm overflow verificado; `Dc34` usa 34 dígitos significativos e arredondamento com empate para o par. |
| Controle e funções | Variáveis com escopo, comparações, `Se`/`Senao`, `Enquanto`, `Interromper`, `Continuar`, funções CPU com parâmetros e retorno tipados; preservação de `SeMaior`. |
| Erros e limpeza | `Tentar`/`Capturar`, relançamento, localização de falhas e `Defer` em ordem inversa nas saídas de escopo, inclusive propagação de erro. Recursos automáticos têm duração lexical. |
| Texto | Literais UTF-8, impressão segura de `%` e buffers `FBnC` mutáveis em execução, com capacidade verificada antes de alterar o destino. |
| SOA | Estruturas e arrays com limites verificados, reinicialização por declaração e `ParaCadaSOA` para adição inteira. |
| Interface 2D | Runtime com ABI C, SDL3 e SDL_ttf: janela, eventos de teclado/mouse, redimensionamento, retângulos, texto UTF-8 e apresentação de quadros. |
| Calculadora | Mouse e teclado, quatro operações sequenciais, decimal com ponto/vírgula, repetir `=`, trocar sinal, limpar, apagar e recuperar-se de erros sem fechar a janela. |
| VS Code | Extensão local 0.2.1 com cores para funções, variáveis, parâmetros, tipos e literais, além de snippets e diagnósticos do compilador. |
| Ferramentas | Instaladores locais, versões fixadas, testes de regressão e workflow de CI para Windows e Linux. |

### Limitações atuais

- Funções CPU não têm recursão, closures, sobrecarga ou callbacks. Referências emprestadas não podem escapar da chamada.
- `@ULTIMO` pertence ao bloco; resultados entre blocos exigem variáveis explícitas. Textos estáticos só podem ser alterados no nível superior; use `FBnC` para mutação em execução.
- `ParaCadaSOA` com float é rejeitado. Não há otimização automática de layout nem promessa de vetorização ou de quantidade fixa de ciclos.
- A calculadora executa na ordem dos comandos: `2 + 3 × 4 =` resulta em `20`. Ela não analisa expressões nem parênteses.
- Os builds locais de referência são Windows x64 com LLVM-MinGW/UCRT e Linux x64 com glibc e X11/XWayland, incluindo WSLg. Outras arquiteturas e ambientes gráficos não estão validados.
- A extensão é instalada por VSIX local. O pacote gerado neste repositório não depende de publicação no Marketplace.

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
SDL_ttf 3.2.2 e libmpdec 4.0.1 em `.tools/`, sem alterar o PATH global.
Consulte os [pré-requisitos e instruções WSL](scripts/README.md).

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
`tom-lang/build/tom-lang-0.2.1.vsix` pelo menu **Extensões → … → Instalar do VSIX**.

## Testes

Depois de ativar o ambiente:

```bash
npm ci --prefix tom-lang --ignore-scripts
npm --prefix tom-lang test
node scripts/verify-desktop.js
```

A suíte verifica LLVM e executa programas em `-O0` e `-O2`, incluindo os 43 casos
anteriores, controle de fluxo, limpeza, UTF-8, 261 vetores decimais publicados e a
calculadora com eventos simulados. `verify-desktop.js` abre uma janela real e envia
teclado, mouse, redimensionamento e fechamento exclusivamente à aplicação criada
pelo teste. No WSL exige WSLg; em Linux exige `DISPLAY`. Capturas e logs ficam em
`.tools/<plataforma>/validation/`. [Resultados locais](tom-lang/docs/validation-0.2.md).

A [CI](.github/workflows/core.yml) está configurada para executar testes em Linux e Windows.
O estado de cada execução remota deve ser consultado no [GitHub Actions](https://github.com/FamiliaEstudio/LinguagemTom/actions).
Dependências ausentes causam falha; testes nativos não são silenciosamente ignorados.

## Organização

- `tom-lang/core/`: parser, tipos e emissão LLVM; `compile()` é uma API pura.
- `tom-lang/core/native-build.js` e `tom-lang/tomc.js`: ferramentas, link e publicação.
- `tom-lang/runtime/stable/`: ABI C para texto, decimais e SDL; sem lógica de calculadora.
- `tom-lang/exemplos/`: programas e manifesto com resultados esperados.
- `tom-lang/extension.js`, `snippets.json`, `syntaxes/`: editor com os mesmos diagnósticos.
- `tom-lang/tests/`: regressões e execução nativa.
- `tom-lang/experimental/`: protótipos e artefatos anteriores, preservados para pesquisa.

Novos artefatos ficam em `build/` e `.tools/`, ignorados pelo Git. A extensão 0.2
deve ser empacotada a partir destes fontes; os VSIX históricos não contêm o núcleo
atual. O [README histórico](tom-lang/docs/history/README-original.md) preserva as propostas antigas
e não deve ser usado como referência de recursos implementados.
