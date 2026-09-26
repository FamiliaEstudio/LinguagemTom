# Tom Companion 0.1.0

Um painel integrado ao VS Code acompanha a construção da calculadora. A lógica
do acompanhamento continua escrita em Tom, em um processo sem janela.
Você escreve o código; o Companion explica sua finalidade, indica o próximo
trabalho e executa verificações quando solicitado. Tudo funciona localmente,
em português, sem rede depois da preparação das ferramentas.

Também inclui o [mapa do código](MAPA.md), aberto junto do acompanhamento ou pelo comando
**Tom: Abrir mapa do código no Companion**. Ela acompanha projetos Tom e seus
módulos, independentemente do roteiro da calculadora.

## Começar no repositório

Prepare as [ferramentas locais](../../scripts/README.md). No Linux/WSLg:

```bash
source scripts/env.sh
npm ci --prefix tom-lang --ignore-scripts
node aplicativos/tom-companion/scripts/build.js
npm --prefix tom-lang run package:extension
```

No Windows, no PowerShell:

```powershell
. ./scripts/env.ps1
npm.cmd ci --prefix tom-lang --ignore-scripts
node aplicativos/tom-companion/scripts/build.js
npm.cmd --prefix tom-lang run package:extension
```

1. Instale `tom-lang/build/tom-lang-0.4.0.vsix` em **Extensions: Install from VSIX**.
2. Abra o repositório ou uma de suas subpastas em uma janela confiável do VS Code.
   A extensão detecta o executável e as ferramentas preparados acima.
3. Execute **Tom: Abrir Tom Companion** pela paleta (`Ctrl+Shift+P`).
   Com um arquivo `.tom` aberto, também há um botão no canto superior direito
   do editor, **Tom Companion** na barra inferior e o atalho **Ctrl+Alt+Shift+T**.
4. Na primeira abertura, escolha onde escrever sua calculadora. Se o editor já
   estiver em um arquivo `calculadora.tom`, ele será usado diretamente.
   Um arquivo inexistente será criado vazio; um existente será preservado.

A extensão lembra a pasta da calculadora nesta área de trabalho e reutiliza a
instalação detectada nas próximas aberturas, inclusive em projetos fora do
repositório. **Tom: Companion: escolher pasta da calculadora** permite escolher
outro projeto, salvando o progresso antes de trocar. Uma falha de salvamento
preserva a sessão para uma nova tentativa. Clicar novamente em Abrir revela os
painéis e mantém a sessão existente. A abertura depende de um clique
ou comando; digitar ou abrir o VS Code não inicia o aplicativo sozinho.

Se atualizar uma extensão antiga, execute **Developer: Reload Window** uma vez.
Para instalações fora do repositório ou para escolher caminhos manualmente, use
`tom.companion.installation` (a pasta com `companion-install.json`) e
`tom.companion.toolchain` (`.tools/windows` ou `.tools/linux`), com caminhos absolutos.

O acompanhamento aparece na lateral e o mapa no painel inferior, na mesma janela
do código. O mapa pode ser maximizado pelo controle do painel do VS Code; posições
e tamanhos ajustados pelo usuário são preservados. Os painéis seguem o tema do editor.
**Tom: Encerrar Tom Companion** salva o progresso e encerra as duas sessões.
Ocultar um painel mantém sua sessão e suspende atualizações visuais. Restaurar
painéis ao reabrir o VS Code não inicia processos: use o botão Abrir.
O Companion nunca substitui o arquivo do aluno.
No WSL, instale a extensão no lado WSL e use os caminhos Linux e o pacote Linux.
Windows x64 e Linux x64/WSL são as plataformas de referência. Os painéis dispensam
servidor gráfico no processo Tom; executar a calculadora no Linux exige X11/WSLg.
VS Code web e remotos sem desktop não fazem parte deste MVP.

## Usar o acompanhamento

O cartão superior apresenta **agora, por quê, onde escrever, como conferir e
o próximo trabalho**. O cartão central explica a instrução selecionada no editor.
O inferior mostra diagnósticos ou resultados medidos nas verificações.
Os cartões têm rolagem e se ajustam ao espaço disponível. **Fonte** alterna 16, 18 e 20 pontos; Tab move o
foco e Enter/Espaço ativa o controle. As explicações são de construção prática,
apresentadas quando o trecho passa a ser necessário.

| Controle | Comportamento |
|---|---|
| Pista | Primeira pista, explicação adicional e, no terceiro pedido, solução contextual do passo. Você decide o que escrever. |
| Copiar código | Revela e copia diretamente o código completo daquele passo, preservando caracteres e quebras de linha. Não exige consultar pistas antes. Cole com Ctrl+V no local indicado; o Companion não altera o arquivo. |
| Ver passo | Volta ao objetivo, preservando o histórico das dicas consultadas. |
| Onde? | Abre a função ou a região principal correspondente no VS Code. |
| Explicar | Atualiza o trecho selecionado. Outra relação / Ir ao código navega por declarações, usos, chamadas, aberturas e produtores de `@ULTIMO`. |
| Verificar | Compila uma cópia da revisão atual e executa os testes do passo. Inclui alterações não salvas. |
| Próximo | Avanço manual, disponível somente depois de verificar a revisão atual. |
| Anterior | Volta ao objetivo anterior; o arquivo permanece como você o escreveu. |
| Executar / Parar | Compila em O0 e abre a calculadora; interrompe processos e testes em andamento. |
| Empacotar | Compila em O2 e publica em `build/calculadora-HASH/calculadora/` na pasta do aluno. Copie a pasta inteira: executável, fonte, bibliotecas e licenças. |
| Salvar | Persiste o acompanhamento; não salva o documento do VS Code. |

Também há comandos do VS Code para explicar, verificar, executar, interromper e
empacotar, além de **Tom: Companion: copiar código do passo**. O botão de cópia
fica ao lado das setas do cartão superior. Na declaração `DefStkFB128CxSaidayl''`,
`l''` é a letra L minúscula seguida de duas aspas simples: um texto vazio.
Os nomes diferenciam maiúsculas de minúsculas, e referências usam `@` diretamente.
A análise ocorre após cerca de 400 ms sem digitação; compilar para
executar e verificar exige ação explícita. Um erro de compilação, um comportamento
incorreto e um passo aprovado aparecem como resultados diferentes. Valores de
execução só são apresentados quando medidos nos testes.

`@ULTIMO` é explicado pelo produtor reconhecido no mesmo fluxo. Em código
incompleto, relações ainda não resolvidas permanecem indisponíveis. O acumulador,
o texto do visor e o histórico da calculadora precisam de variáveis persistentes;
`UltimoOperador` é um nome comum, diferente de `@ULTIMO`.
Instruções excepcionalmente longas recebem uma indicação de abreviação no cartão;
o fonte completo e suas posições continuam no editor e nas verificações.

## Os 22 passos

O roteiro reconstrói as nove funções e o comportamento da
[calculadora de referência](../../tom-lang/exemplos/calculadora.tom), seguindo
dependências, sem atribuir uma cronologia histórica à sua criação.

| Passos | Resultado |
|---|---|
| 1–5 | Primeiro resultado decimal; `Calcular` com soma, subtração, produto e divisão. |
| 6–10 | `Valor`, `Digitar`, separador, `Sinal` e `Apagar`. |
| 11–12 | `Comando`: caracteres e teclas viram comandos internos. |
| 13–17 | Janela, `Botao`, `Desenhar` e reconhecimento de cliques em `Posicao`. |
| 18–19 | Estado que sobrevive entre eventos, entrada e redesenho. |
| 20–22 | Operações sequenciais, repetição de igual e recuperação de erros. |

Nomes e assinaturas das nove funções são o contrato do roteiro. Comentários,
espaçamento, nomes locais e implementações equivalentes são aceitos. No primeiro
passo, guardar o resultado decimal de `@ULTIMO` é um objetivo explícito.
As funções são exercitadas por programas temporários antes de existir a janela.
A última verificação usa os 38 cenários existentes da calculadora.

## Retomar e recuperar

O progresso fica em `.tom-companion/progresso.json`, na pasta escolhida: versão,
hash da referência, passo, dicas, fonte e hashes das revisões verificadas.
Reabrir preserva o histórico e exige conferir o código atual antes de aprová-lo.
Um progresso incompatível é informado e preservado em `.invalid-TIMESTAMP`
antes de salvar um novo estado. Uma falha de escrita mantém os dados na memória:
use **Salvar** para tentar novamente. Encerrar ou trocar de projeto aguarda a confirmação
do salvamento. Dicas, avanço, fonte e verificações aprovadas também são salvos durante o uso. Se a conexão cair, reabra pelo comando do editor.

Arquivos do aluno têm limite de 128 KiB; mensagens, 1 MiB; o canal nativo mantém
oito mensagens por fila. A compilação tem prazo de 120 s e cada cenário automático,
5 s. **Parar** cancela a árvore de processos. O Workspace Trust impede iniciar
ferramentas em pastas não confiáveis; o Companion não é uma sandbox para código.

## Pacote separado do repositório

`node aplicativos/tom-companion/scripts/package.js` gera um arquivo de distribuição
para a plataforma atual, com manifesto SHA-256 e o VSIX atualizado. O pacote contém os processos sem janela e as demonstrações nativas,
fontes, bibliotecas, licenças, roteiro e fontes de suporte. Em `support/`, execute
uma vez `scripts/setup-windows.ps1` ou `bash scripts/setup-linux.sh`. Os
pré-requisitos de sistema estão em `support/scripts/README.md`. Configure a extensão
com a pasta extraída e `support/.tools/windows` ou `support/.tools/linux`.

Os processos Tom e a calculadora empacotada são nativos; os painéis são webviews locais. O acompanhamento precisa de
Node 24 e LLVM 21.1 locais para analisar e compilar o que você escreve. As versões
e hashes das ferramentas já são fixados pelo projeto. Não há nova dependência
de terceiros nesta entrega.

## Organização e validação

- `src/`: estado, ações, explicações, geometria e entradas nativas/com painéis em Tom.
- `../../tom-lang/companion/media/`: apresentação HTML/CSS/SVG, sem regras do roteiro.
- `courses/calculadora/`: referência, 22 snapshots, roteiro e explicações versionados.
- `scripts/course.js`: geração editorial dos snapshots; não altera arquivos do aluno.
- `tests/`: roteiro, alternativas, erros, progresso, protocolo e integração nativa.
- `../../tom-lang/companion/`: extensão, processos de ferramentas e acesso a arquivos.
- `../../tom-lang/core/analysis.js`: API pura de análise, usando parser e símbolos do compilador.

```bash
npm --prefix tom-lang run test:companion
node aplicativos/tom-companion/scripts/verify-desktop.js
node aplicativos/tom-companion/scripts/verify-desktop.js --package
# Windows: VS Code isolado, controles reais e capturas nos dois temas
# ./aplicativos/tom-companion/scripts/verify-vscode-windows.ps1
```

Veja [protocolo e API](../../tom-lang/docs/companion-api.md) e
[resultados da validação](VALIDACAO.md). Outros roteiros, editor próprio, chat com
IA, correções automáticas e depuração passo a passo ficam fora desta versão.
