# Aplicativo Tom Companion

- Leia a seção pertinente de `README.md`; para o mapa, use `MAPA.md`.
- `src/` contém estado, ações, explicações e mapa em Tom. `courses/calculadora/` contém roteiro, explicações e passos; `scripts/course.js` gera os snapshots.
- O host VS Code e a apresentação ficam em `../../tom-lang/companion/`, com instruções próprias. A análise semântica compartilhada fica em `../../tom-lang/core/analysis.js` e `project-analysis.js`.
- Mantenha regras do curso, geometria e interação em Tom, respeitando a divisão existente entre lógica, análise e apresentação.
- Preserve arquivos do aluno e a persistência do progresso. O mapa observa fontes, inclusive revisões não salvas, sem executar o programa observado.
- Da raiz do repositório, teste o arquivo relevante em `aplicativos/tom-companion/tests/` com `node --test --test-concurrency=1 <arquivo>`; para integração ampla, `npm --prefix tom-lang run test:companion`.
- Build: `node aplicativos/tom-companion/scripts/build.js`. Validação real de VS Code/desktop e distribuição estão em `README.md` e `DISTRIBUICAO.md`; execute quando a tarefa exigir essas evidências.
