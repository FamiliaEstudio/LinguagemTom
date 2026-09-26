# Análise e comunicação local — Companion 0.1

## `analyze(source, options)`

Exportada por `core/compiler.js`, junto de `compile()`. As duas APIs são puras:
recebem o fonte e `{ file, modules }`; não leem arquivos, não executam o programa
e não publicam artefatos. `compile()` mantém seu contrato anterior.

```js
const { analyze } = require('./tom-lang/core/compiler');
const result = analyze('SomarxyInSd32x10y20', { file: 'calculadora.tom' });
```

| Campo | Conteúdo da versão 1 |
|---|---|
| `success`, `diagnostics` | Validade segundo o compilador; diagnóstico com arquivo, linha, coluna, código e gravidade. |
| `instructions` | Comandos reconhecidos, texto, início/fim, tipo, operandos, assinatura/argumentos, função e bloco. Fechamentos incluem `opens`. |
| `symbols` | Declarações e parâmetros observados na resolução real, com identidade, tipo, mutabilidade e localização. |
| `references` | Leituras/escritas reconhecidas e símbolo associado. |
| `calls` | Local da chamada, função que chama e destino quando a assinatura é resolvida sem ambiguidade. |
| `lastResults` | Uso de `@ULTIMO`, produtor, tipo/canal e indicação `resolved`. Não contém valores de execução. |

Linhas/colunas começam em 1. As colunas contam unidades UTF-16, como os índices
JavaScript; a extensão subtrai 1 ao criar posições do VS Code. O fim é exclusivo.
IDs combinam arquivo e linha; são estáveis **na revisão analisada**, não entre
edições. Strings e comentários usam o mesmo leitor do compilador. As relações
semânticas usam a etapa compartilhada de resolução, sem emitir LLVM. Se um bloco está incompleto, instruções ainda reconhecidas são úteis,
mas símbolos/produtores não resolvidos não são inventados. Para campos de registros,
a referência identifica a declaração raiz; não é uma API de reflexão de registros.

A [API `analyzeProject()` e o protocolo do mapa](code-map.md) acrescentam análise
de projetos, recuperação de regiões independentes e identidades entre revisões.
`analyze()` permanece o adaptador de compatibilidade versão 1.

## `CanalMensagens`

Recurso lexical geral ligado aos pipes de entrada/saída padrão fornecidos pelo
processo pai. Um canal por processo; não abre servidor nem conexão de rede.

```tom
DefRecursoxCanalyCanalMensagensAbrir[1048576,8]
DefStkFB1048577CxMensagemyl''
CanalMensagensConsultar[@Canal,@Mensagem]
Sex@ULTIMO
CanalMensagensEnviar[@Canal,@Mensagem]
FimSe
```

| Operação | Resultado e contrato |
|---|---|
| `CanalMensagensAbrir[InUd64,InSd32]` | Limite por mensagem de 1 a 1.048.576 bytes, sem LF; capacidade de 1 a 32 mensagens em cada fila. Retorna recurso. |
| `CanalMensagensConsultar[RefCanalMensagens,RefBuffer]` | Retorna Bl imediatamente. Falso preserva destino; verdadeiro copia uma mensagem e a retira da fila. Buffer insuficiente preserva destino **e mensagem** e gera erro de capacidade. |
| `CanalMensagensAguardarAte[RefCanalMensagens,RefBuffer,InSd64]` | Espera mensagem até um prazo absoluto de `TempoAgoraNs`. Retorna Bl; prazo ou EOF sem mensagem retorna falso e preserva o buffer. Erros e capacidade seguem `Consultar`. |
| `CanalMensagensEnviar[RefCanalMensagens,Txt]` | Enfileira UTF-8 completo, acrescentando LF. Não aceita NUL nem LF/CR literais no conteúdo. Fila cheia gera erro antes de inserir. |
| `CanalMensagensFechado[CanalMensagens]` | Retorna Bl quando a entrada fechou e as mensagens recebidas foram consumidas. Falhas de transporte são erros recuperáveis. |

O leitor preserva mensagens fragmentadas, aceita LF ou CRLF e rejeita UTF-8 inválido,
mensagem excessiva e EOF no meio de uma mensagem. Filas são limitadas; overflow
de entrada é comunicado após consumir as mensagens já recebidas. A API não
valida JSON: outros aplicativos podem transportar qualquer texto permitido.

Leitura e escrita usam threads nativas. O destrutor cancela operações pendentes,
aguarda as threads e libera as filas; uma saída obstruída não mantém o programa
preso. Ele concede até 200 ms para drenar respostas já aceitas. Confirmações que
precisem persistir devem ser aguardadas pelo aplicativo antes de fechar.
`Defer` do usuário executa antes da liberação automática. Não misture `GerarTxt`
com o protocolo no stdout; diagnósticos nativos usam stderr.

`JsonEscrever` produz JSON indentado. Para este transporte, troque LF/CR físicos
por espaços depois da serialização; quebras dentro de strings já estão escapadas.
O exemplo está em `CompanionEnviar`, no aplicativo. O canal usa o SDL3 já fixado
no projeto e acrescenta `channel` aos metadados de runtime.

## Protocolo do Companion

JSON por linha, versão `v:1`, sessão UUID, `request` crescente, `revision` do
documento e `selection` independente. O limite é 1 MiB e oito mensagens por fila
nativa. O documento tem limite explícito de 128 KiB.

1. Janela envia `ready`; extensão responde `init` com roteiro, progresso validado
   e eventual aviso de recuperação.
2. `analysis` contém hash, instrução, parâmetros, relações, produtor de `@ULTIMO`
   e diagnóstico. Alterar o documento invalida imediatamente a aprovação; a análise
   completa é enviada após aproximadamente 400 ms sem digitação.
3. A janela solicita `verify`, `run`, `build`, `stop`, `explain`, `where`,
   `navigate` ou `copyCode`. Os comandos do editor entram como `command`, usando as mesmas ações Tom.
4. `verification` identifica pedido, passo e revisão. Somente o pedido ainda ativo
   e a revisão corrente podem aprovar o passo. `status` antigo também é descartado.
5. `save` contém o estado escolhido em Tom; `saved` confirma a escrita atômica
   ou descreve uma falha recuperável. Avançar é sempre uma decisão manual.

A extensão cuida de arquivos, processos, prazos e navegação. A seleção das
explicações, dicas, página, passo e aprovação permanece em `.tom`. O roteiro tem
versão e SHA-256 do fonte de referência. O verificador exige assinaturas públicas
e comportamentos, não igualdade textual do programa.

`copyCode` é a ação 29, disponível assim que o Companion estiver conectado.
A ação revela a solução e registra sua consulta no histórico, sem exigir pistas anteriores.
A extensão envia o campo `solution` original do passo para a área de transferência
do VS Code, sem formatação Markdown, abreviação ou quebras de linha de paginação.
Uma revisão antiga não copia conteúdo. A confirmação usa `status` somente depois
de concluir a escrita; falhas são informadas. O documento não é modificado.

Ferramentas executam num Node 24 separado. Os testes usam cópias em diretórios
temporários, LLVM verificado e processo nativo com prazo de 5 s. Compilação/build
têm prazo de 120 s; cancelamento encerra os processos descendentes. A aplicação
interativa permanece aberta até fechamento ou **Parar**. Os pacotes só são
publicados depois do link bem-sucedido; revisões antigas não aprovam novos passos.

As integrações de seleção e navegação seguem as
[APIs do VS Code](https://code.visualstudio.com/api/references/vscode-api) e o
[Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust).

## Painéis integrados

Veja [apresentação e ciclo de vida](integrated-views.md). Os protocolos nativos
continuam disponíveis para as demonstrações; os processos sem janela acrescentam
capacidades de estado visual e controle de fluxo.
