# Validação do Tom Companion 0.1.0

Executada localmente em 13/09/2026 com Node 24, LLVM 21.1.8, Windows x64
(LLVM-MinGW/UCRT) e Ubuntu/WSLg x64. SDL3, SDL_ttf, libmpdec e yyjson mantêm
as versões e hashes do manifesto de ferramentas existente.

| Verificação | Resultado |
|---|---|
| Linguagem e Musical Tom | 185 testes passaram em cada plataforma: os 173 anteriores e 12 de análise/canal. |
| Roteiro e Companion | 61 testes passaram em cada plataforma; acrescentados depois três testes de limites, apresentação de instruções extensas e constantes em soluções equivalentes, validados separadamente. Total atual: 64. |
| Roteiro completo | Os 22 snapshots compilam, têm LLVM válido e passam nas verificações em O0 e O2, nas duas plataformas. |
| Referência | 664 instruções reconhecidas, incluindo fechamentos; nove funções com contratos preservados. Cada operação nativa usada tem explicação contextual. |
| Equivalência Tom/C | 38 cenários, 142 eventos e 135 quadros idênticos em O0 e O2, nas duas plataformas; quatro testes do executor de benchmark preservados. |
| VS Code real | Windows e VS Code conectado ao Ubuntu/WSL: iniciar, editar sem salvar, selecionar, desfazer/refazer, navegar, verificar e preservar o fonte em disco. |
| Abertura simplificada | Windows e WSL: detecção a partir de subpastas sem configuração manual, uso da calculadora ativa e cliques repetidos sem duplicar a janela, mantendo edição, seleção e verificação. Quatro testes da extensão passaram nas duas plataformas (três novos). |
| Cópia do código | 20 testes de extensão, sessão, modelo e integração nativa passaram em cada plataforma. O0/O2 preservam o texto original e zero objetos vivos ao encerrar. O comando foi exercitado nos editores reais Windows e WSL com destino de clipboard simulado; a ponte da extensão é testada separadamente, sem substituir o clipboard pessoal durante os testes. A cópia direta revela a solução e registra sua consulta, sem exigir pistas anteriores. |
| Desktop real | Windows e WSLg: janela, mouse, Tab/Enter, paginação, fonte, redimensionamento, salvar e fechar, em builds instrumentados e de produção O2. |
| Pacote de suporte | Verificador distribuído executa a calculadora completa; 113 verificações acumuladas, incluindo os 38 cenários finais. |

Os testes nativos instrumentados exigem zero objetos Tom vivos ao encerrar.
A revisão da cópia direta passou em sete testes por plataforma: modelo e
integração em O0/O2, recuperação e cliques de mouse antes das pistas e após
**Ver passo**. O histórico registra a solução consultada, e o fonte permanece intacto.
O protocolo cobre UTF-8 fragmentado, `%`, mensagens excessivas, fila cheia,
desconexão e encerramento com escrita bloqueada. Um destino pequeno conserva
a mensagem e seu conteúdo anterior. Retomada exige nova verificação; progresso
incompatível é preservado; falha de salvamento pode ser repetida sem substituir
o fonte. Respostas de revisão anterior não aprovam o código atual. Workspace Trust
bloqueia todos os comandos que iniciam processos.

Um teste de integração concorrente inicialmente encontrou colisão entre suas
próprias pastas de build. As pastas de cada processo de teste foram isoladas e o
caso de recuperação foi reexecutado com sucesso nas duas plataformas. O defeito
não envolvia o arquivo do aluno.

## Reproduzir

Depois de carregar `scripts/env.sh` ou `scripts/env.ps1`, na raiz:

```text
node --test --test-concurrency=1 tom-lang/tests/*.test.js jogos/musical-tom/tests/*.test.js
npm --prefix tom-lang run test:companion
npm --prefix tom-lang run benchmark:verify
node aplicativos/tom-companion/scripts/verify-desktop.js
node aplicativos/tom-companion/scripts/verify-desktop.js --package
node aplicativos/tom-companion/scripts/package.js
npm --prefix tom-lang run package:extension
```

Para testar a extensão num editor já instalado, sem mudar configurações globais:

```text
node aplicativos/tom-companion/scripts/verify-editor.js --code CAMINHO_DO_EXECUTAVEL_CODE
```

No WSL, com o Code do Windows e a extensão Remote WSL já instalada:

```text
node aplicativos/tom-companion/scripts/verify-editor.js --code /mnt/DRIVE/.../Code.exe --wsl Ubuntu --wsl-extension /mnt/c/Users/USUARIO/.vscode/extensions/ms-vscode-remote.remote-wsl-VERSAO
```

O teste usa um perfil isolado em `.tools/`, uma calculadora descartável em
`build/vscode/` e o mesmo código da extensão distribuída. Os resultados ficam em
`build/vscode/PLATAFORMA/result.json`; o registro do editor, em `editor.log`.
Capturas e traces nativos ficam em `build/desktop/`. O workflow de CI inclui a suíte
do Companion, desktop e pacotes nos dois sistemas; sua execução remota depende
do próximo envio ao repositório e não é apresentada aqui como concluída.

O verificador é um conjunto finito de cenários, não uma prova de equivalência
para todo programa possível. O MVP acompanha um único arquivo de até 128 KiB,
um roteiro local e as assinaturas da calculadora. Não executa código durante
análise, não corrige o fonte automaticamente e não implementa depurador.

## Painéis integrados — setembro de 2026

A integração foi exercitada em um VS Code real no Windows, com perfil isolado:
acompanhamento lateral, mapa inferior, expansão pelo teclado, maximização,
controle Pista acionado na webview, temas claro/escuro, edição não salva,
desfazer/refazer, navegação, verificação e encerramento com progresso salvo.
`build/vscode/win32/result.json` e as capturas `integrated-dark.png` e
`integrated-light.png` registram essa execução.

Os testes dos processos sem janela usam `SDL_VIDEODRIVER=invalid` e dispensam
servidor gráfico. Cobrem pistas, cópia, aprovação, salvamento identificado,
falha/repetição de escrita, visibilidade, geometria em Tom, zoom e filtros.
O teste máximo transporta 512 nós e 2.048 relações, com detalhes de 3.000
caracteres Unicode de quatro bytes, preservando o limite de 1 MiB por cena.
Os detalhes permanecem nos blocos e são consultados por índice, evitando cópias
repetidas durante a preparação. As apresentações nativas usam o mesmo modelo.

As regressões do roteiro verificam os 22 passos em O0 e O2. O canal também cobre
espera com prazo, EOF, UTF-8 fragmentado, preservação do buffer insuficiente e
encerramento com saída bloqueada. O teste do manifesto valida identificadores
de contêineres aceitos pelo VS Code e eventos explícitos de ativação.

Para repetir o teste visual no Windows, carregue as ferramentas e execute
`aplicativos/tom-companion/scripts/verify-vscode-windows.ps1`. Defina
`TOM_VSCODE_EXE` se necessário. O CDP local é habilitado somente nessa instância
de teste, em uma porta livre escolhida pelo lançador.
