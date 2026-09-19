# Integração do Companion no VS Code

- Esta pasta cuida do host, processos, sessões, fontes não salvos e apresentação. A lógica do curso/mapa fica em `../../aplicativos/tom-companion/src/`.
- Comece em `extension.js`/`session.js` para ciclo de vida, `project-sources.js`/`project-worker.js` para análise, `graph-session.js` para mapa e `views.js`/`media/` para webviews.
- Contratos: seções pertinentes de `../docs/integrated-views.md`, `../docs/code-map.md` e `../docs/companion-api.md`.
- Preserve Workspace Trust, início explícito, revisões não salvas e salvamento do progresso. Não execute o programa observado para desenhar o mapa.
- Testes do host e das views ficam em `../../aplicativos/tom-companion/tests/`. Se mudar análise compartilhada, inclua os testes de `../tests/analysis.test.js` e `../tests/project-analysis.test.js`.
