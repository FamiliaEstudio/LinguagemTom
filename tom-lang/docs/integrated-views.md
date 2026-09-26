# Painéis integrados do Companion

A extensão registra `tom.companion.view` no contêiner lateral `tom-companion`
e `tom.companion.mapView` no contêiner inferior `tom-code-map`. Apenas comandos
ou botões explícitos iniciam processos. Restaurar uma webview mostra o estado
ocioso; ocultá-la mantém o processo e suspende a apresentação.

`companion-headless.tom` reutiliza estado, explicações e ações do roteiro.
`mapa-headless.tom` reutiliza preparação/validação de grafos, câmera e interação.
As entradas não têm a dependência de runtime `ui`; `build-headless.js` verifica
isso antes de gerar os executáveis. A espera bloqueante do canal acorda por
mensagem, desconexão ou prazo, dispensando consulta contínua quando ocioso.
`mapa-modelo.tom` e `mapa-entrada.tom` adaptam o mesmo modelo às janelas nativas.

A webview usa recursos locais do VSIX, CSP restritiva e `textContent` para textos
de fontes e explicações. Os dados não são HTML. JavaScript cuida de elementos,
cores, rolagem e encaminhamento de eventos; o processo Tom decide ações, posições,
fixação, seleção, zoom e animações. O analisador JavaScript existente mantém a
responsabilidade por significado, projeção, arquivos e revisões.

## Mensagens adicionais, versão 1

O envelope conserva `v`, `session` e `revision`. Capacidades
`companion-view-v1` e `graph-view-v1` identificam as entradas integradas.

- `visibility {visible}`: suspende/restaura publicação e animações. Ao reaparecer,
  Tom publica o estado atual completo; o navegador não recompõe regras do modelo.
- `viewState {sequence,...}`: estado visual completo. No acompanhamento contém
  passo, textos, relação selecionada, fonte e estados de aprovação/salvamento.
  No mapa contém revisão publicada, aviso, seleção, zoom, nós, arestas e detalhes
  do elemento selecionado. Coordenadas são calculadas em Tom.
- `viewAck {sequence}`: a extensão confirma o recebimento, inclusive de estados
  descartados por revisão antiga. Há no máximo uma publicação sem confirmação.
- `input {input,...}` / `inputAck {input}`: uma ação da webview por vez no canal;
  eventos de movimento/redimensionamento ainda enfileirados são consolidados.
  A fila da extensão aceita até 64 ações. Ações de uma revisão antiga não operam
  sobre a revisão nova. Acompanhamento também identifica a sequência visual.
- O comando de salvamento pode carregar `saveToken`; a resposta `save` repete
  esse identificador. Encerrar/trocar de projeto aguarda a gravação correspondente,
  sem confundir uma gravação automática anterior com a solicitação atual.

A transferência de análise do mapa continua usando `begin`, blocos de até
64 KiB, confirmação de cada bloco e `commit`. A última publicação é preservada
se a preparação falhar. O estado visual inclui somente os detalhes selecionados,
mantendo o limite de 1 MiB por mensagem mesmo no orçamento de 512 nós/2.048 arestas.
As oito posições das filas nativas são preservadas.

## Instalação e persistência

O manifesto `companion-install.json` acrescenta `headlessExecutable`,
`headlessMapExecutable` e suas capacidades; os campos dos executáveis nativos
permanecem para as demonstrações. Pacotes antigos recebem instrução para atualizar
ou reconstruir. `progresso.json` mantém a versão 1 e suas regras de recuperação.

Ocultar não encerra sessões. O comando **Encerrar Tom Companion** e a troca de
calculadora aguardam salvamento; uma falha mantém a sessão para nova tentativa.
A extensão também tenta salvar na desativação, além das gravações durante o uso.
Posições do grafo permanecem durante a sessão; não são persistidas entre processos.

## Validação

`npm --prefix tom-lang run test:companion` inclui processos sem servidor gráfico,
controles, revisão não salva, salvamento e regressões nativas. Os testes de canal
cobrem prazo, EOF, buffer insuficiente e mensagem fragmentada.

No Windows, `scripts/verify-vscode-windows.ps1` prepara uma instância isolada do
VS Code, executa `tests/vscode-host.js` e confere webviews reais por CDP local.
Use `TOM_VSCODE_EXE` se `code` não estiver no PATH. O depurador remoto é habilitado
somente nesse editor de testes. Capturas e resultado ficam em `build/vscode/win32/`.
