# Linguagem Tom — extensão para VS Code

Realce de sintaxe, snippets e diagnósticos do compilador Tom 0.4. A extensão
reconhece arquivos `.tom`; não exige LLVM ou SDL para colorir e validar o fonte.

Inclui também os recursos `Texto`, `BancoSQLite`, `ConsultaSQLite` e
`TransacaoSQLite`, com snippets de texto dinâmico e consulta parametrizada.
Veja o [contrato de texto e SQLite](docs/texto-sqlite.md).

## Instalar o pacote local

1. Abra **Extensões** (`Ctrl+Shift+X`).
2. No menu **…**, escolha **Instalar do VSIX… / Install from VSIX…**.
3. Selecione `tom-lang-0.4.0.vsix`.
4. Abra um arquivo `.tom`. No canto inferior direito deve aparecer **Tom**;
   se aparecer Texto sem Formatação, clique e escolha Tom. Se solicitado,
   recarregue a janela do VS Code.

No repositório, o pacote fica em `tom-lang/build/tom-lang-0.4.0.vsix`.
Em uma janela **WSL**, instale a extensão também no ambiente WSL usando esse mesmo
menu. A instalação Windows e a instalação WSL são independentes. Caso haja um
VSIX histórico da Tom habilitado, desabilite-o para não manter duas versões ativas.

## Como ler as cores

O realce separa os componentes mesmo quando não há espaços entre eles:

```tom
// Tipos, nomes e comandos recebem categorias distintas.
DefFuncaoxSomarValores[Dc34xA,Dc34xB]yDc34
SomarxyDc34x@Ay@B
Retornarx@ULTIMO
FimFuncao

ChamarxSomarValores[0.1,0.2]
DefVarDc34xResultadoy@ULTIMO
GerarTxtxl'Resultado calculado.\n'
```

As cores exatas dependem do tema. No tema padrão **Escuro+ / Dark+**, a leitura
usual é:

| Elemento | Exemplos | Cor usual |
|---|---|---|
| Função declarada ou chamada | `SomarValores`, `JanelaCriar` | Amarelo |
| Variável ou parâmetro | `Resultado`, `A`, `B` | Azul-claro |
| Tipo | `Dc34`, `InSd32`, `Registro<Sessao>`, `Enum<Fase>` | Verde-água |
| Comando/controle | `DefFuncao`, `Retornar`, `Se`, `Tentar` | Roxo |
| Texto literal | `l'Resultado calculado.'` | Laranja |
| Número | `0.1`, `42` | Verde-claro |
| Comentário | `// explicação` | Verde |

Os separadores `x`, `y`, `xy` e `@` permanecem visíveis. Nomes de função/variável
que contêm palavras como `Somar` ou `Fl32` são coloridos como um nome completo.
O realce continua funcionando enquanto você digita um programa incompleto;
erros do compilador aparecem separadamente como sublinhados e no painel Problemas.

A versão 0.4 acrescenta `DefRegistro`, `DefEnum`, tipos nominais, campos aninhados,
`Para`/`ParaIndiceSOA` e as operações de JSON, catálogos e relógio de sessão.
Reconhece também `Importar`, `DefConst`, `SOA<Nome>`/`RefSOA<Nome>` e as
operações de relógio, visuais e áudio. Declarações de constante têm a categoria
`variable.other.constant`; referências `@Nome` continuam usando a categoria
geral de variável, pois o realce TextMate não faz resolução semântica de símbolos.
Diagnósticos resolvem bibliotecas locais e os módulos `tom/musica`, `tom/teclado`, `tom/entrada`, `tom/dados`, `tom/ui`,
`tom/sessao` e `tom/replay`,
considerando arquivos abertos ainda não salvos e apontando para o arquivo importado
que contém o erro. Não é necessário compilar um executável para consultar erros.

Para trocar o tema: **Preferências: Tema de Cores / Preferences: Color Theme**
(`Ctrl+K`, depois `Ctrl+T`). A extensão usa as categorias padrão do VS Code e
respeita temas claros, escuros e de alto contraste, sem trocar suas preferências.

## Gerar e testar a extensão

O [Tom Companion 0.1](../aplicativos/tom-companion/README.md) acrescenta os comandos
**Tom: Abrir Tom Companion**, explicar seleção, verificar, executar, interromper e
empacotar a calculadora. Abra pelo botão no título do editor, pela barra inferior,
pela paleta ou por **Ctrl+Alt+Shift+T** com um arquivo Tom aberto. O repositório e
suas subpastas são detectados automaticamente; a última calculadora é lembrada.
Os caminhos `tom.companion.installation` e `tom.companion.toolchain` continuam
disponíveis para pacotes separados. O código não salvo acompanha as revisões;
os processos de análise e compilação ficam separados do editor. O acompanhamento
e o mapa aparecem na lateral e no painel inferior, seguindo o tema do VS Code.
A lógica permanece em processos Tom sem janela, instalados com as ferramentas
locais fora do VSIX. **Tom: Encerrar Tom Companion** salva e encerra as sessões. Iniciar processos exige uma
pasta confiável; no WSL, instale a extensão no ambiente WSL e use o pacote Linux.

Use **Copiar código** no painel ou **Tom: Companion: copiar código do passo** na
paleta para revelar e copiar a solução diretamente. Cole no editor com Ctrl+V;
caracteres e quebras de linha são preservados, sem alteração automática do arquivo.

Na raiz do repositório, com Node 24 disponível:

```sh
npm ci --prefix tom-lang --ignore-scripts
npm --prefix tom-lang run test:editor
npm --prefix tom-lang run package:extension
```

`editor/grammar.js` gera `syntaxes/tom.tmGrammar.json` usando os nomes de tipos e
operações do compilador. Os testes usam `vscode-textmate` e `vscode-oniguruma`,
os mesmos componentes de tokenização usados pelo editor, incluindo o fonte da
calculadora. O pacote contém o compilador para diagnósticos e a gramática; as
ferramentas de desenvolvimento e os runtimes nativos não acompanham a extensão.

Referências: [realce de sintaxe](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
e [instalação de VSIX](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix)
na documentação oficial do VS Code. Este pacote local não foi publicado no Marketplace.

## Mapa do código no Companion

Use **Tom: Abrir mapa do código no Companion** no VS Code para acompanhar módulos,
funções, variáveis e resultados locais enquanto escreve, inclusive antes de salvar.
Veja [uso do mapa](../aplicativos/tom-companion/MAPA.md) e [API e bibliotecas](docs/code-map.md).

### Editor para escritores

`DocumentoTexto` oferece grafemas Unicode, formatação e histórico; `EditorTexto` acrescenta edição SDL; `tom/editor_sqlite` mantém salvamento manual e recuperação automática separados. Veja a [interface e contratos](docs/editor-texto.md) e a [oficina de escrita](exemplos/editor/README.md).
