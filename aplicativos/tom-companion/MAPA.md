# Mapa do código no Tom Companion

Abra qualquer arquivo `.tom` com caminho no VS Code e execute pela paleta:

**Tom: Abrir mapa do código no Companion**

O comando abre o mapa no painel inferior do VS Code. **Abrir Tom Companion**
também abre esse painel, direcionado à calculadora escolhida. Acompanha o arquivo de entrada e seus
módulos, incluindo mudanças não salvas. Começa por módulos e funções; selecione
uma função e pressione Espaço para revelar parâmetros, variáveis e instruções.
A área de detalhes explica o elemento e suas relações. Enter abre sua origem no
VS Code. Não é necessário instalar o Obsidian.

| Controle | Ação |
|---|---|
| Clique | Selecionar e destacar vizinhos. |
| Arrastar nó / fundo | Mover e fixar o nó / deslocar a câmera. |
| Roda vertical / horizontal | Zoom no cursor / deslocamento horizontal. |
| Tab | Próximo nó visível. |
| Setas | Deslocar a câmera. |
| Espaço | Expandir ou recolher o elemento selecionado. |
| Enter | Abrir origem no código. |
| P | Alternar fixação. |
| M | Alternar movimento reduzido. |
| PgUp / PgDn | Rolar a explicação. |
| Shift+Tab | Sair do foco do mapa. |
| 0 | Todas as categorias. |
| 1–8 | Módulos, funções, parâmetros, variáveis, tipos, instruções, resultados e operações nativas. Módulos/funções continuam como contexto. |
| R | Tentar sincronizar novamente. |

O mapa aguarda cerca de 400 ms depois da digitação. Elementos incompletos e
relações não resolvidas são sinalizados; o contexto anterior aparece como tal.
Os valores mostrados são a **inicialização escrita**, sem observar a execução.
Cada `@ULTIMO` se conecta ao seu produtor local, respeitando escopos e canais.

Nós reconhecidos preservam suas posições e fixação durante as revisões. Nós
retirados da vista por recolhimento/filtro são acomodados novamente ao reaparecer.
A organização é por grupos; não usa simulação de forças nem
salva posições entre sessões. O mapa também pode acompanhar projetos independentes do roteiro da calculadora.
Seus atalhos são capturados apenas quando o mapa está em foco.

## Preparar e distribuir

Use a [preparação do Companion](README.md). `scripts/build.js` empacota os processos `companion-headless` e `mapa-headless`,
além das demonstrações nativas, bibliotecas e licenças. Gere o
VSIX atualizado, instale-o e execute **Developer: Reload Window** em editores já
abertos. O manifesto informa as capacidades; a extensão pede atualização ou reconstrução quando o pacote ainda não oferece
os processos integrados.

O comando respeita Workspace Trust. Tom controla o estado, a geometria e a interação; uma webview local desenha em
SVG. Um processo Node 24 separado analisa os fontes. O mapa não compila nem executa
o programa observado. No WSL, use o pacote e a extensão do lado WSL; o processo do mapa dispensa WSLg.

Para experimentar as bibliotecas sem editor ou canal:

```bash
source scripts/env.sh
node tom-lang/tomc.js aplicativos/tom-companion/src/mapa-simulado.tom --run
```

Esse programa contém dados de exemplo. A demonstração conectada usa
`mapa.tom`, `mapa-modelo.tom`, `mapa-protocolo.tom`, `mapa-entrada.tom` e
`mapa-interface.tom`. As demonstrações mantêm desenho nativo. Organização, câmera e interação são
compartilhadas com os painéis em `.tom`;
o analisador é responsável por significados e relações.

O orçamento inicial aceita 64 arquivos/4 MiB e 512 nós/2.048 relações na vista.
Ao excedê-lo, a última vista é preservada com aviso. Use recolhimento e filtros.
Veja [API, arquitetura e validação](../../tom-lang/docs/code-map.md).
