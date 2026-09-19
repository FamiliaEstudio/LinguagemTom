# Musical Tom

- Comece na seção relevante de `README.md` e no módulo de `src/` afetado: entrada em `musical-tom.tom`, conteúdo em `conteudo.tom`, regras em `rodada.tom`, persistência em `perfil.tom`, apresentação em `apresentacao.tom`/`painel.tom`/`visual.tom`, som em `audio.tom`.
- Reutilize bibliotecas em `../../tom-lang/stdlib/`. Consulte compilador/runtime quando o defeito ou recurso necessário estiver nessa camada.
- Preserve relógio explícito, aleatoriedade reproduzível e replay; mudanças visuais não devem modificar julgamento ou persistência incidentalmente.
- Da raiz do repositório: `node --test --test-concurrency=1 jogos/musical-tom/tests/<arquivo>.test.js`; suíte completa: `npm --prefix tom-lang run test:musical`.
- Testes e builds nativos usam a toolchain do repositório. Testes de desktop e pacote estão em `scripts/verify-desktop.js` e no README; rode sequencialmente quando necessários.
