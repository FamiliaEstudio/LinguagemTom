# Runtime estável Tom

A [fundação do Scriptorium](../../docs/texto-sqlite.md) acrescenta `Texto`
redimensionável e `tom_sqlite`, com SQLite 3.53.4/FTS5 estático. `TomText.limit=0`
identifica buffers fixos; um limite positivo permite crescimento. `TomTextView`
mantém vistas emprestadas válidas após realocação. Recompile as bibliotecas C e
os módulos Tom ao atualizar esta ABI.

ABI C em [tom_runtime.h](tom_runtime.h), dividida em `tom_text`, `tom_decimal`,
`tom_ui`, `tom_platform`, `tom_math` e `tom_audio`. As operações devolvem código `int32_t`; resultados usam o último
parâmetro de saída, exceto operações cujo destino é explícito. Saídas de novos
handles devem começar em NULL. A falha preserva o destino. Handles pertencem ao
compilador; o programa Tom não recebe ponteiros. Funções `free(NULL)` são seguras.
Não há exceções C++ nem lógica específica de calculadora.

O [contrato multimídia 0.3](../../docs/multimedia-0.3.md) lista as assinaturas de
tempo, teclado, fontes, visuais e áudio, incluindo limites, erros e duração de vida.
`platform.c` administra as referências independentes aos subsistemas SDL.
`audio.c` contém o mixer de 32 canais/48 kHz e sua fila de 256 comandos; o callback
usa o mesmo processamento testado em memória, sem executar Tom.
`math.c` implementa conversões, potência finita, pré-condições e PCG32.

`core/builtins.js` define as assinaturas Tom e sua correspondência C. A CLI compila
os fontes necessários no mesmo alvo e otimização do programa. Também é possível
obter bibliotecas estáticas reutilizáveis via CMake; os instaladores as preparam
em `.tools/<plataforma>/native/lib/`.

## API gráfica Tom

Argumentos inteiros de coordenadas/tamanho/campos são `InSd32`; cor é `InUd32`,
RGBA no formato `0xRRGGBBAA`, expresso como literal decimal Tom. Coordenadas começam
no canto superior esquerdo. `Ref` na assinatura de uma função Tom é obrigatório
para buffers, eventos e janelas que essa função modifica.

| Comando | Contrato |
|---|---|
| `DefRecursoxJyJanelaCriar[l'Título',480,640]` | Janela redimensionável, resolução lógica fixa; dimensões 1..16384 |
| `DefRecursoxFyFonteCarregar[20]` | DejaVuSans.ttf ao lado do executável; tamanho 1..512 |
| `DefRecursoxEyEventoCriar[]` | Armazenamento de um evento |
| `EventoAguardar[@J,@E]` | Espera o próximo evento reconhecido, sem laço ocupado |
| `EventoConsultar[@J,@E]` | Consulta sem esperar; Bl em @ULTIMO |
| `EventoCampo[@E,CAMPO]` | InSd32 em @ULTIMO |
| `EventoTexto[@E,@Buffer]` | Copia UTF-8 do evento |
| `JanelaLimpar[@J,COR]` | Limpa o quadro |
| `DesenharRetangulo[@J,X,Y,LARGURA,ALTURA,COR]` | Retângulo preenchido |
| `MedirTexto[@F,TEXTO]` | Largura InSd32 em unidades lógicas |
| `DesenharTexto[@J,@F,TEXTO,X,Y,COR]` | Texto UTF-8 |
| `JanelaApresentar[@J]` | Apresenta o quadro completo |

Campos de evento: 0 tipo; 1 x; 2 y; 3 botão; 4 tecla; 5 largura; 6 altura;
7 ID SDL da janela; 8 repetição de tecla (0/1). Tipos: 0 nenhum; 1 fechamento;
2 texto; 3 tecla pressionada; 4 botão do mouse; 5 redimensionamento; 6 exposição.
Campos não aplicáveis são zero. Texto de evento tem limite de 255 bytes UTF-8;
entrada maior provoca erro de capacidade, sem truncamento silencioso.

Teclas imprimíveis devem ser tratadas pelo evento **texto**, evitando dupla
entrada; tecla Enter é 13, Escape 27, Backspace 8. Enter numérico é normalizado
para 13. Os outros códigos seguem SDL_Keycode. Mouse esquerdo é botão 1.
Eventos são da fila SDL do processo; as coordenadas do mouse são convertidas para
a resolução lógica da janela de origem. Aplicações com várias
janelas precisam considerar o ID do evento ao despachar suas ações.

Eventos completos são opt-in por janela: soltura=7, perda de foco=8, ganho=9.
Campos novos: 9 posição física e 10 modificadores. `EventoTempoNs` preserva o
timestamp SDL em InSd64 e `EventoAguardarAte` usa um prazo absoluto desse relógio.
O estado mantido acompanha os eventos consumidos e é limpo na perda de foco.

Toda operação de janela, evento e desenho ocorre na thread principal. A janela
usa escala lógica com letterbox e alta densidade; o mouse passa pela conversão
SDL de coordenadas. O renderizador tenta o driver disponível e recorre ao software
se a criação falhar. No build Linux de referência, os backends GPU são desativados
para a interface 2D; usa X11/XWayland, inclusive WSLg.

## Dependências e distribuição

SDL 3.4.16, SDL_ttf 3.2.2, libmpdec 4.0.1; versões e SHA256 em
[`scripts/toolchain.json`](../../../scripts/toolchain.json). Windows x64 usa ABI
MinGW UCRT, separada de Linux. Não misture bibliotecas MSVC/MinGW ou versões de
Linux com glibc incompatível. O pacote inclui DLLs/SOs, dependências de FreeType,
fonte DejaVu Sans e licenças; não distribui Node ou LLVM. Linux conserva as
bibliotecas básicas do sistema (glibc, loader, X11) como pré-requisitos do desktop.
Linux habilita PulseAudio e ALSA; seus clientes e dependências acompanham o pacote.
O diretório `alsa/` contém configuração para libasound. Windows usa o SDL oficial
com suporte a WASAPI. Bravura 1.482 e sua licença acompanham `tom/musica` em assets.

```bash
# Depois de preparar scripts/setup-linux.sh e carregar scripts/env.sh:
cmake -S tom-lang/runtime/stable -B .tools/linux/runtime-build -G Ninja \
  -DCMAKE_C_COMPILER="$CLANG" -DCMAKE_PREFIX_PATH="$PWD/.tools/linux/native"
cmake --build .tools/linux/runtime-build
```

A [calculadora Tom](../../exemplos/calculadora.tom) espera eventos quando está
ociosa, redesenha ao alterar estado/expor/redimensionar e captura erros de conta
sem perder a janela. As operações são sequenciais, sem parênteses. Enter ou `=`
repete a última operação; Escape/C limpa; Backspace apaga; ponto e vírgula entram
como decimal; `±` troca sinal. Todos os 34 dígitos são exibidos, sem arredondamento
adicional. O host GPU em `../tom_gpu_host.cpp` continua experimental e independente.

`TOM_UI_TEST` ativa apenas nos binários de teste injeção de eventos, registro de
texto e captura de quadro. Builds normais não consultam essas variáveis de teste.
`tom_live_objects`/`tom_peak_objects` permitem verificar a propriedade dos recursos
sem expor essas operações na linguagem.

`TOM_AUDIO_TEST` expõe somente ao harness C criação de mixer sem dispositivo e
renderização em memória. Builds normais não incluem essas entradas. Destrutores
nativos aceitam NULL, mas cada handle liberado deve ser descartado/zerado pelo
chamador C; usar novamente um handle liberado não é válido. A Tom faz isso
automaticamente. Som retém seu Audio e Visual retém sua Janela; fechar o dono
invalida o uso, mas adia a liberação estrutural até terminar a dependência.

## Acréscimos 0.4

`tom_data` usa SDL_GetPrefPath e arquivos UTF-8, com leitura limitada e substituição
atômica por temporário vizinho. `tom_json` usa yyjson 0.12.0 estático com alocador
limitado, tokens numéricos preservados e alterações transacionais. O setup fixa
SHA-256 e instala a licença MIT; ambos os alvos foram acrescentados ao CMake.

`tom_ui` acrescenta movimento/soltura opt-in e catálogos de texturas; `tom_audio`
acrescenta catálogos WAV e uma leitura coerente de posição/âncora/pausa. Catálogos
retêm seus proprietários, IDs não são reutilizados e remoção de som cancela vozes
ativas e comandos antes de liberar memória. `common.c` mantém a contagem de objetos
usada pelos testes de limpeza. `math.c` fornece multiplicação/divisão intermediária
128 bits com resultado64 verificado.

Ações, componentes, configuração, sessão e replay são bibliotecas `.tom`, não
comportamentos específicos no runtime. Consulte o [contrato 0.4](../../docs/state-0.4.md).
Injeção de eventos, relógios, diretório de dados e traces é compilada somente com
`TOM_UI_TEST`; builds públicos ignoram essas variáveis.

### Editor de documentos

`document.c` usa Texto, utf8proc 2.11.3/Unicode 17 e yyjson sem SDL; `editor.c` utiliza o modelo e SDL_ttf/HarfBuzz; `editor_sqlite.c` mantém um trabalhador SDL e conexão SQLite exclusivos. As bibliotecas CMake são `tom_document`, `tom_editor` e `tom_editor_sqlite`. `document.h` e `ui_internal.h` são interfaces internas; a interface pública permanece em `tom_runtime.h`. Consulte [contratos e representação persistente](../../docs/editor-texto.md).

## Arquivos, DOCX e formulários

`files.c`, `docx.c`, `xlsx.c`, `file_jobs.c`, `file_dialog.c` e `form.c` implementam operações reutilizáveis de arquivo, conversão DOCX, leitura XLSX, trabalhos assíncronos, seleção de caminhos e formulários. `editor_sqlite.c` captura contexto JSON junto ao documento. Contratos e limites estão em [arquivos-docx.md](../../docs/arquivos-docx.md); testes adicionais ficam em `aplicativos/scriptorium/tests/` na raiz. Os builds diretos e CMake incluem miniz/libxml2 estáticos, com versões fixadas na toolchain.
