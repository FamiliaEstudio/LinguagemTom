# Scriptorium — oficina de escrita

Esta demonstração integra `DocumentoTexto`, `EditorTexto`, `tom/ui` e `tom/editor_sqlite`. Cada execução usa o arquivo `editor-demonstracao.sqlite` no diretório de execução. Esse arquivo é independente do acervo da Fase 1.

No repositório, carregue `scripts/env.sh` (Linux) ou `scripts/env.ps1` (Windows) e execute:

```sh
node tom-lang/tomc.js --run tom-lang/exemplos/editor/editor.tom
```

Para gerar e verificar os pacotes de ambas as otimizações:

```sh
node scripts/verify-editor.js --desktop
```

Os executáveis e suas dependências ficam em `.tools/linux/validation-editor/packages/O2/editor/` ou `.tools/windows/validation-editor/packages/O2/editor/`. Copie a **pasta inteira**. Execute a partir de uma pasta onde possa gravar o banco. Não é necessário instalar Tom, Node, LLVM ou SQLite no computador que executar o pacote. A interface usa a fonte DejaVu Sans distribuída.

## Roteiro

1. Selecione o texto com Ctrl+A e escreva uma passagem com acentos, `é` combinante e `👩🏽‍💻`. Setas, Backspace e Delete devem respeitar cada grafema.
2. Selecione um trecho e use N, I, S e A−/A+. Escolha o alinhamento do parágrafo. A barra mostra estilos ativos, tamanho e valores mistos.
3. Copie/cole entre duas instâncias e um editor externo. O conteúdo é textual; estilos são aplicados dentro da oficina. Desfaça e refaça com Ctrl+Z/Ctrl+Y. Tab/Shift+Tab alternam entre área de escrita e botões.
4. Clique Salvar ou use Ctrl+S. Aguarde “Salvamento confirmado” e “Versão salva”.
5. Continue escrevendo. O indicador deve voltar a “Alterações não salvas”. Depois de dois segundos sem alterações, aguarde “Recuperação automática atualizada”. Durante escrita contínua, a tentativa ocorre a cada quinze segundos.
6. Encerre o processo abruptamente pelo gerenciador de tarefas. Reabra no mesmo diretório e escolha Recuperar. Deve reaparecer a última cópia automática **concluída**, com estilos. Ela ainda é uma alteração não confirmada manualmente.
7. Salve para promover a recuperação. Alternativamente, reabra e escolha Descartar para conservar a versão manual anterior.
8. Ao fechar com alterações, experimente Cancelar, Salvar e Descartar. Salvar espera a confirmação mantendo a janela ativa; Descartar também remove a recuperação. Erros de gravação aparecem no rodapé e não apagam o texto em memória. Falhas ao abrir o armazenamento aparecem em uma janela de erro.
9. Cole um documento com pelo menos 1.024.000 caracteres, incluindo um parágrafo extenso. Redimensione, role, selecione e formate. Os roteiros nativos registram latências e verificam a recuperação integral.

`editor.tom` coordena recursos e o ciclo de eventos; `oficina.tom` contém auxiliares da barra. O núcleo reutilizável não depende desse exemplo. Consulte a [interface pública e formato persistente](../../docs/editor-texto.md).
