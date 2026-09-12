# Runtime estável Tom 0.2

ABI C em [tom_runtime.h](tom_runtime.h), dividida em `tom_text`, `tom_decimal` e
`tom_ui`. As operações devolvem código `int32_t`; resultados usam o último
parâmetro de saída, exceto operações cujo destino é explícito. Saídas de novos
handles devem começar em NULL. A falha preserva o destino. Handles pertencem ao
compilador; o programa Tom não recebe ponteiros. Funções `free(NULL)` são seguras.
Não há exceções C++ nem lógica específica de calculadora.

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
a resolução lógica da janela passada à espera/consulta. Aplicações com várias
janelas precisam considerar o ID do evento ao despachar suas ações.

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
