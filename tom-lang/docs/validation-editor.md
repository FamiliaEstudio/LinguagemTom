# Validação da Fase 2 — editor reutilizável

Registro local de 18/09/2026. Compilação x64 com LLVM 21.1.8, SDL 3.4.16, SDL_ttf 3.2.2, SQLite 3.53.4 e utf8proc 2.11.3/Unicode 17. O ambiente Linux é WSL, com o repositório e arquivos de teste em `/mnt/c`; o outro ambiente é Windows nativo. As alterações anteriores do repositório foram preservadas.

## Resultado funcional

| Verificação | Linux | Windows |
|---|---|---|
| Suíte completa `tom-lang/tests/*.test.js` | 222 passaram; zero falhas | 222 passaram; zero falhas |
| Documento: testes oficiais Unicode 17 | 766 casos, `-O0` e `-O2` | 766 casos, `-O0` e `-O2` |
| Documento, editor e persistência | Testes nativos e Tom nas duas otimizações | Testes nativos e Tom nas duas otimizações |
| Biblioteca estática pelo CMake | Compilada e instalada localmente | Compilada e instalada localmente |
| Pacote independente `-O0`/`-O2` | Janela X11, com PATH sem ferramentas | Janela Win32, com PATH sem ferramentas |
| Recuperação após interrupção | Versão manual e recuperação verificadas separadamente | Versão manual e recuperação verificadas separadamente |
| Área de transferência | Duas instâncias e xclip, nos dois sentidos | Duas instâncias e PowerShell, nos dois sentidos |

Os casos adicionais encontrados na revisão foram verificados com testes focados depois das suítes completas: revisões persistentes após excluir/recriar a recuperação, manutenção da rolagem entre quadros, seleção programática mantendo o cursor visível, colagem vazia e geometria em diferentes escalas. Os pacotes foram reconstruídos com essas correções.

O roteiro de aplicação escreve texto com acentos e emoji composto, aplica negrito, confirma uma versão, continua a edição, aguarda a recuperação automática e encerra o processo sem limpeza. Um segundo processo recupera e confirma a cópia. A inspeção usa SQLite do Node, independente do adaptador Tom, verifica texto e estilos e executa `PRAGMA integrity_check`. Também são verificados Cancelar e Descartar no fechamento. Um caminho de banco inválido é exercitado para verificar que a falha de abertura aparece na janela, sem depender de console.

Os testes do adaptador interrompem o processo antes da gravação e depois das instruções SQL, antes do COMMIT. Também exercitam falta de espaço simulada, banco ocupado, abertura somente para leitura, fila limitada, substituição de recuperação pendente, ordem dos pedidos manuais, intervalo de quinze segundos durante escrita contínua e conflito entre sessões. Um contador persistente impede que excluir/recriar uma recuperação reutilize uma revisão observada por uma sessão antiga.

No documento, são exercitados seleção invertida, grafemas, estilos mistos, parágrafos, JSON, desfazer/refazer, 300 sequências de alterações e 160 pontos de falha de alocação. O cache gráfico passa por 100 comparações com uma disposição totalmente refeita. A limpeza lexical é verificada pelos contadores de recursos Tom; não foi executado um detector externo de vazamentos de heap.

## Escala e medições

A carga visual contém **1.024.000 caracteres em um único parágrafo**, seguida de edição, seleção, formatação, rolagem e serialização. O teste de SQLite grava e reabre o conteúdo completo, conferindo cada byte, além de uma inserção Unicode. As amostras abaixo são execuções individuais; não são medianas nem promessas de desempenho. Parte delas foi coletada durante outras regressões. O custo de I/O em `/mnt/c` sob WSL difere bastante do acesso nativo Windows.

Tempos em milissegundos; as duas últimas linhas mostram memória em MiB. A importação inclui validação e disposição; a edição/formatação inclui a atualização necessária do editor. A espera de confirmação inclui o trabalhador e o disco; a preparação da cópia ocorre na thread da aplicação.

| Medição | Linux `-O0` | Linux `-O2` | Windows `-O0` | Windows `-O2` |
|---|---:|---:|---:|---:|
| Importação e disposição | 59.840 | 41.339 | 51.333 | 30.363 |
| Digitação e atualização | 47.897 | 32.119 | 45.789 | 27.431 |
| Selecionar tudo | 0.003 | 0.003 | 0.004 | 0.002 |
| Formatação e disposição | 46.542 | 28.300 | 37.139 | 20.101 |
| Rolagem e desenho | 0.197 | 0.190 | 0.330 | 0.283 |
| Serialização JSON | 1.260 | 1.282 | 1.217 | 0.951 |
| Primeira gravação SQLite | 2435.137 | 864.935 | 45.037 | 36.348 |
| Preparação da cópia para gravar | 11.992 | 10.648 | 17.021 | 12.501 |
| Espera pela confirmação SQLite | 2164.038 | 534.585 | 15.177 | 13.382 |
| Reabertura SQLite | 473.147 | 224.222 | 24.446 | 20.971 |
| Pico residente do teste visual (MiB) | 73.23 | 73.10 | 73.79 | 74.05 |
| Pico residente do teste SQLite (MiB) | 28.30 | 28.27 | 29.93 | 29.73 |

A memória é o pico residente do processo (`getrusage` no Linux e `PeakWorkingSetSize` no Windows), incluindo runtime, fontes e dados do teste. Não é apenas o tamanho do documento ou do histórico. Os arquivos de medições contêm plataforma, otimização, data e valores originais.

## Artefatos e reprodução

- Interface pública: [Documento e editor de texto](editor-texto.md).
- Demonstração e roteiro de uso: [oficina de escrita](../exemplos/editor/README.md).
- Documento: [testes nativos](../tests/fixtures/document-runtime.c).
- Editor: [testes nativos](../tests/fixtures/editor-runtime.c).
- Persistência: [testes nativos](../tests/fixtures/editor-store-runtime.c).
- Roteiro integrado: [verify-editor.js](../../scripts/verify-editor.js).
- Integração externa da área de transferência: [verify-editor-clipboard.js](../../scripts/verify-editor-clipboard.js).

Os pacotes ficam em `.tools/linux/validation-editor/packages/{O0,O2}/editor/` e `.tools/windows/validation-editor/packages/{O0,O2}/editor/`. É necessário copiar a pasta inteira. Não é necessária instalação separada de Node, LLVM, Tom ou SQLite para executar o pacote. Resultados de integração, área de transferência e medições ficam em `validation-editor/` e são publicados pelo workflow de CI. O workflow foi atualizado; a execução remota do GitHub Actions não foi disparada nesta sessão.

```sh
npm --prefix tom-lang run test:document-editor
node scripts/verify-editor.js --desktop
node scripts/verify-editor-clipboard.js
npm --prefix tom-lang test
```

Use `xvfb-run -a` para os roteiros gráficos em Linux sem desktop. No WSL, execute os roteiros gráficos Linux e Windows em sequência: as janelas compartilham o foco do mesmo desktop. O roteiro Linux usa eventos X11 dirigidos, com XInput2 desativado apenas no processo de teste. A demonstração processa a fila de entrada entre quadros e mantém a interface ativa enquanto espera confirmação do banco.

## Validação manual ainda necessária

Composição e AltGr foram verificados por eventos SDL; área de transferência e janela foram verificadas com APIs reais dos sistemas. Não houve operação manual com um teclado ABNT2 físico nem com IMEs instalados. Teclas mortas, janelas de candidatos e troca de DPI entre monitores permanecem na lista de verificação humana antes do aceite final de distribuição.

As relações de coordenadas 100%, 125%, 150%, 175% e 200% foram testadas automaticamente, mantendo o mesmo ponto lógico de clique. Isso verifica a transformação e a geometria compartilhada; não equivale a testar vários monitores físicos. Escrita bidirecional e apresentação completa de emojis coloridos permanecem fora do escopo acordado.
