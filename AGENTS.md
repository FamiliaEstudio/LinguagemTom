# Trabalho no repositório Tom

## Contexto mínimo

- Responda em português. Preserve alterações existentes; consulte `git status --short` antes de editar.
- Identifique a área pelo pedido. Leia o `AGENTS.md` dessa área antes de alterá-la, mesmo quando a sessão começou na raiz. Abra somente as seções de documentação necessárias.
- Linguagem, compilador, biblioteca e extensão: `tom-lang/AGENTS.md`.
- Runtime C: também `tom-lang/runtime/stable/AGENTS.md`.
- Companion em Tom: `aplicativos/tom-companion/AGENTS.md`; integração VS Code: `tom-lang/companion/AGENTS.md`.
- Jogo: `jogos/musical-tom/AGENTS.md`. Toolchain/empacotamento: `scripts/AGENTS.md`.
- Para localizar uma implementação ou suíte desconhecida, consulte a tabela em `docs/codex/mapa.md`. O guia `uso-eficiente.md` é para consulta sobre IA, sem leitura obrigatória por tarefa.

## Busca e escopo

- Use `rg --files <área>` e `rg -n '<símbolo>' <área>` antes de abrir arquivos inteiros. Amplie a busca quando houver evidência de dependências externas à área.
- Preserve os ignores nas buscas normais. `.tools/`, `node_modules/`, `build/`, binários, imagens e logs são consultados apenas quando necessários ao diagnóstico.
- `tom-lang/experimental/`, `tom-lang/docs/history/`, `PesquisaTomLive.md` e `RPG_TOM_GUIA.md` são pesquisa/histórico; não definem o núcleo estável. O contrato atual fica em `tom-lang/docs/core-language.md`.
- Em tarefas de aplicativos, comece no aplicativo e siga as chamadas relevantes. Evite reler o compilador inteiro.
- Prefira trabalho em um agente. Subagentes só quando solicitados pelo usuário.

## Validação e entrega

- Os comandos documentados partem desta raiz. JavaScript usa Node 24; scripts npm ficam em `tom-lang/package.json`.
- Para a toolchain local já instalada: `source scripts/env.sh` no Linux/WSL; `. ./scripts/env.ps1` no PowerShell. Pré-requisitos: `scripts/README.md`.
- Rode primeiro a suíte que cobre o comportamento alterado. Amplie para consumidores quando mudar contratos compartilhados; para mudanças amplas, siga `.github/workflows/core.yml`.
- Se faltar ferramenta, informe a limitação. Não considere `--check` equivalente a compilação nativa ou teste de interface real.
- Em mudanças só de documentação, verifique caminhos/comandos e o diff; não é necessário compilar tudo.
- Ao terminar, resuma mudança, validação e limitações. Evite transcrever arquivos/logs completos. Atualize o mapa apenas se caminhos ou comandos mudarem.
