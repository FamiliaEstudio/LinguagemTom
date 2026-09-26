# Mapa para localizar código e testes

Consulta sob demanda. Caminhos e comandos partem da raiz do repositório, a pasta que contém `tom-lang/` e `scripts/`.

## Onde começar

| Tarefa | Código inicial | Contrato / orientação |
| --- | --- | --- |
| Sintaxe e erros | `tom-lang/core/parser.js`, `source.js`, `semantic.js` | `tom-lang/docs/core-language.md` |
| Tipos e registros | `tom-lang/core/types.js`, `nominal-types.js`, `records.js` | `tom-lang/docs/state-0.4.md` |
| LLVM, controle e limpeza | `tom-lang/core/emitter.js`, `scalar-emitter.js`, `resources.js` | `tom-lang/AGENTS.md` |
| Importação e CLI | `tom-lang/core/modules.js`, `module-loader.js`, `tom-lang/tomc.js` | `tom-lang/docs/core-language.md` |
| Análise, símbolos e recuperação | `tom-lang/core/analysis.js`, `project-analysis.js`, `recovery.js`, `semantic.js` | `tom-lang/docs/code-map.md` |
| ABI e link nativo | `tom-lang/core/builtins.js`, `native-build.js`, `tom-lang/runtime/stable/tom_runtime.h` | `tom-lang/runtime/stable/AGENTS.md` |
| Texto, documento e SQLite | `tom-lang/runtime/stable/text.c`, `document.c`, `sqlite.c`, `editor_sqlite.c` | `tom-lang/docs/texto-sqlite.md`, `editor-texto.md` |
| Interface e editor nativo | `tom-lang/runtime/stable/ui.c`, `editor.c`; `tom-lang/stdlib/editor.tom` | `tom-lang/docs/editor-texto.md`, `visual-2d.md` |
| Bibliotecas Tom | `tom-lang/stdlib/` | Contrato do recurso em `tom-lang/docs/` e consumidor em `exemplos/` |
| Realce e diagnósticos VS Code | `tom-lang/extension.js`, `tom-lang/editor/` | `tom-lang/AGENTS.md` |
| Companion: curso e estado | `aplicativos/tom-companion/src/`, `courses/calculadora/` | `aplicativos/tom-companion/AGENTS.md` |
| Companion: host e webviews | `tom-lang/companion/` | `tom-lang/companion/AGENTS.md` |
| Musical Tom | `jogos/musical-tom/src/` | `jogos/musical-tom/AGENTS.md` |
| Calculadora e benchmark | `tom-lang/exemplos/calculadora.tom`, `benchmarks/calculator/` | `benchmarks/calculator/README.md` |
| Setup, empacotamento e CI | `scripts/`, `.github/workflows/core.yml` | `scripts/AGENTS.md` |

Nomes curtos na mesma célula compartilham a pasta do primeiro arquivo. Nem toda tarefa precisa ler todos os arquivos indicados: procure primeiro o símbolo ou comportamento.

## Preparar comandos

Linux/WSL, com toolchain instalada:

```bash
source scripts/env.sh
```

Windows/PowerShell: `. ./scripts/env.ps1`; use `npm.cmd` se necessário. Pré-requisitos e instalação estão em `scripts/README.md`. JavaScript requer Node 24. Testes de realce usam as dependências de `tom-lang/package-lock.json`; instale-as quando ausentes com `npm ci --prefix tom-lang --ignore-scripts`.

## Escolher a validação

| Mudança | Ponto inicial de validação |
| --- | --- |
| Parser/compilação | `node --test tom-lang/tests/compiler.test.js` |
| Análise e projeto | `node --test tom-lang/tests/analysis.test.js tom-lang/tests/project-analysis.test.js` |
| Extensão/gramática | `npm --prefix tom-lang run test:editor` |
| CLI/imports no disco | `node --test tom-lang/tests/cli.test.js` |
| LLVM/controle/decimais | Testes pertinentes em `native.test.js`, `control.test.js`, `decimal.test.js`, dentro de `tom-lang/tests/` |
| Texto dinâmico e SQLite | `npm --prefix tom-lang run test:scriptorium` |
| Scriptorium: acervo, DOCX e backup | `aplicativos/scriptorium/README.md`; `npm --prefix tom-lang run test:scriptorium-app`; `npm --prefix tom-lang run verify:scriptorium-app` |
| Documento/editor/persistência | `npm --prefix tom-lang run test:document-editor` |
| Canal local | `node --test --test-concurrency=1 tom-lang/tests/channel.test.js tom-lang/tests/channel-protocol.test.js` |
| Grafos | `node --test tom-lang/tests/graph.test.js` e testes do mapa em `aplicativos/tom-companion/tests/` |
| Companion | `npm --prefix tom-lang run test:companion` |
| Musical Tom | `npm --prefix tom-lang run test:musical` |
| Benchmark calculadora | `npm --prefix tom-lang run benchmark:verify` |
| Mudança ampla da linguagem | `npm --prefix tom-lang test`, mais suítes dos aplicativos afetados |

Esses comandos são pontos de partida, não cobertura automática de qualquer alteração. Busque testes do comportamento exato em `tom-lang/tests/` ou no aplicativo e amplie conforme o impacto.

Para iterar em um teste do Companion, por exemplo:

```bash
node --test --test-concurrency=1 aplicativos/tom-companion/tests/views.test.js
```

Para verificar a sintaxe/semântica de um programa:

```bash
node tom-lang/tomc.js --check tom-lang/exemplos/calculadora.tom
```

`--check` não valida execução, janela nem build distribuível. Testes nativos precisam de LLVM e bibliotecas locais; consulte `tom-lang/tests/helpers.js` quando necessário. Para validação de janela/clipboard/áudio/distribuição, selecione o `verify-*` correspondente e confira requisitos no README da área. Use `.github/workflows/core.yml` como referência para mudanças que atravessam várias áreas; registre separadamente o que foi validado em Linux e Windows.
