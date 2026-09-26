# Validação local do mapa

Referência: Intel Core i5-14400F, Node 24.21.0 e LLVM 21.1.8, Windows
x64 e Ubuntu/WSL2 com WSLg. As versões de SDL e SDL_ttf continuam fixadas
no manifesto de ferramentas.

- `desenho-*.json`: análise pura e cena 512 nós/2.048 arestas, software/dummy.
- `atualizacao-*.json`: revisão não salva até publicação Tom, incluindo 400 ms
  de espera, cache, transporte e ACK; 10.000 instruções, 101 nós/100 relações.
- `editor-*.json`: execução real da extensão no VS Code Windows e remoto WSL,
  arquivos de teste não salvos, desfazer/refazer, relações e navegação.
- `desktop-*.json`: pacote nativo com PATH sem ferramentas de desenvolvimento;
  eventos direcionados de teclado, mouse, filtros, arraste, rolagem, foco e resize.

As suítes completas existentes foram executadas nas duas plataformas. A execução
Windows terminou com 273 testes aprovados. No Linux, uma leitura concorrente de
trace do Musical Tom apresentou ENODATA transitório no NTFS; o teste passou a
repetir somente essa leitura e ENOENT dentro do prazo existente, e as duas
otimizações passaram na repetição. As novas regressões e as alterações finais
foram verificadas separadamente em Windows/Linux, incluindo demonstração
simulada, parser com recuperação, caches, UTF-16, filtros, SDL e mil publicações.

A calculadora preservou os 38 cenários, 142 eventos e 135 quadros com equivalência
entre Tom e C nas duas otimizações e plataformas. Os testes de mil publicações
usam limite de objetos vivos, conferem reutilização de rótulos e exigem zero
objetos Tom ao encerrar. Medições de FPS isolam o renderizador do compositor;
a abertura de janelas reais é uma validação distinta.

Comandos reproduzíveis: [code-map.md](../../../../tom-lang/docs/code-map.md).
Artefatos transitórios, traces, capturas e pacotes ficam em `build/`, ignorado pelo Git.
