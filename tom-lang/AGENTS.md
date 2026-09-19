# Linguagem, biblioteca e editor

Os caminhos abaixo são relativos a esta pasta; comandos partem da raiz do repositório.

- Sintaxe e semântica estáveis: seções pertinentes de `docs/core-language.md`; exemplos suportados: `exemplos/manifest.json`. Arquivos `.tom` contêm a linguagem Tom, não configuração TOML.
- Entrada CLI: `tomc.js`. API: `core/compiler.js`; expansão de módulos/parser → `core/semantic.js` → `core/emitter.js` e `core/scalar-emitter.js`. IO de módulos: `core/module-loader.js`; build nativo: `core/native-build.js`.
- Preserve as APIs puras `compile`, `analyze` e `analyzeProject`; não introduza acesso a disco/processos nelas. `core/analysis.js`, `core/project-analysis.js` e `core/recovery.js` tratam análise do editor, inclusive fontes incompletos.
- Tipos, recursos e assinaturas: `core/types.js`, `core/nominal-types.js`, `core/resources.js`, `core/builtins.js`. Ao mudar uma operação, confira semântica, emissão e ABI correspondente em `runtime/stable/tom_runtime.h`.
- Preserve localização dos diagnósticos, escopo de `@ULTIMO`, empréstimos e limpeza lexical. Mudanças de semântica precisam de casos válidos e inválidos; emissão/runtime precisam de execução pertinente em O0/O2.
- Biblioteca Tom: `stdlib/`. Reutilize módulos existentes e confira consumidores ao mudar contratos.
- Editor: `extension.js`, `editor/`, `syntaxes/`, `snippets.json`. A gramática é gerada por `editor/grammar.js`: altere a fonte e use `npm --prefix tom-lang run build:grammar` quando necessário.
- Companion: leia `companion/AGENTS.md` apenas se essa integração for afetada. Runtime C tem instruções próprias em `runtime/stable/AGENTS.md`.
- Validação inicial: arquivo pertinente em `tests/*.test.js`. `npm --prefix tom-lang run test:unit` cobre compilador/editor/realce, mas não substitui as suítes de análise ou de runtime. O mapa em `../docs/codex/mapa.md` relaciona as demais suítes.
