# Tom 0.3: tempo, entrada, desenho e áudio

As interfaces abaixo são gerais. Notas, pauta, durações e escolha de teclas ficam
em Tom, na [biblioteca musical](../stdlib/musica.tom) e nas
[demonstrações](../exemplos/multimedia/README.md). O runtime não contém regras de jogo.
O [contrato do núcleo](core-language.md) continua valendo para tipos, escopos,
`@ULTIMO`, `Tentar`/`Capturar` e `Defer`.

## Relógio e entrada

| Chamada | Resultado e contrato |
|---|---|
| `TempoAgoraNs[]` | InSd64 monotônico, em nanossegundos, com origem SDL comum a eventos e mixer |
| `EventoTempoNs[@E]` | InSd64: horário de origem do evento, distinto do momento em que foi consumido |
| `EventoAguardarAte[@J,@E,PRAZO]` | Bl: recebe evento ou termina ao atingir prazo absoluto InSd64 não negativo |
| `JanelaEventosCompletos[@J,Verdadeiro]` | Habilita soltura e foco somente nessa janela; exige RefJanela |
| `TeclaMantida[@J,POSICAO]` | Bl: estado da posição física InSd32 depois dos eventos consumidos |

`EventoAguardarAte` exige um `RefEvento`; em timeout retorna falso e zera seus
campos. Recalcula o tempo restante ao descartar eventos irrelevantes; não reinicia
o prazo nem faz espera ocupada. A espera do sistema tem granularidade de
milissegundos e pode terminar depois do prazo por escalonamento. Não é uma
garantia de tempo real. Um evento já disponível pode ser retornado mesmo se o
prazo tiver passado. Use o resultado Bl para decidir se os campos são válidos.

`Importar[l'tom/teclado']` disponibiliza constantes de tipos, campos, teclas e
posições físicas. Os códigos anteriores permanecem:

| Tipo | Código | Novidade |
|---|---:|---|
| Nenhum, fechar, texto, pressionar, mouse, redimensionar, expor | 0..6 | Compatíveis com a calculadora |
| Soltar | 7 | Somente com eventos completos |
| Perder foco | 8 | Limpa as teclas mantidas da janela de origem |
| Ganhar foco | 9 | Permite retomar a interação explicitamente |

`EventoCampo` retorna InSd32: 0 tipo, 1/2 mouse x/y, 3 botão, 4 tecla lógica,
5/6 largura/altura, 7 ID da janela, 8 repetição, 9 posição física SDL_Scancode,
10 máscara SDL_Keymod. Campos não aplicáveis são zero. A fila é do processo;
o estado de teclas e a conversão de coordenadas usam a janela de origem.
Aplicações com várias janelas devem despachar pelo ID do evento. O fechamento
global SDL tem ID zero. Alterar o modo de eventos limpa o estado mantido.

Tecla lógica representa o teclado configurado; posição física representa a
localização, independentemente do layout. Use texto para caracteres digitados e
pressionamento/soltura para comandos e combinações. Não processe texto e tecla
como duas entradas da mesma letra. Repetição está separada do primeiro
pressionamento. A biblioteca oferece A–G e W/R sem definir o que fazem na aplicação.
O contrato de origem é [SDL_KeyboardEvent](https://wiki.libsdl.org/SDL3/SDL_KeyboardEvent).

Animações devem calcular `posição = função(agora - origem)` usando InSd64 para
horários e Fl64 para posições. Guarde origem, prazo e estado em variáveis;
`@ULTIMO` não guarda o resultado de um quadro anterior. A demonstração
`animacao.tom` usa a mesma função de posição nos testes e na janela.

## Desenho e fontes

As operações inteiras anteriores permanecem. As novas coordenadas são Fl64 em
unidades lógicas; cor é InUd32, RGBA `0xRRGGBBAA` expresso em decimal na Tom.
X cresce para a direita e Y para baixo. A escala lógica, letterbox, recorte,
redimensionamento e alternativa por software aplicam-se também aos visuais.

| Chamada | Contrato |
|---|---|
| `FonteCarregarArquivo[l'fontes/minha.otf',TAMANHO]` | Fonte do pacote; tamanho InSd32 de 1..512 |
| `VisualTextoCriar[@J,@F,TEXTO]` | Cria Visual de texto UTF-8; literal/buffer é capturado nesse momento |
| `VisualGlifoCriar[@J,@F,CODIGO]` | Cria Visual de um ponto de código Unicode InSd32 presente na fonte |
| `VisualMetrica[@V,CAMPO]` | InSd32: 0 largura, 1 altura, 2 origem X, 3 linha de base, 4 avanço |
| `DesenharVisual[@J,@V,X,Y,COR]` | X/Y indicam origem e linha de base, ambos Fl64 |
| `DesenharLinha[@J,X1,Y1,X2,Y2,ESPESSURA,COR]` | Segmento; espessura Fl64 positiva |
| `DesenharElipse[@J,CX,CY,RAIO_X,RAIO_Y,COR]` | Elipse preenchida, raios Fl64 positivos |
| `JanelaRecorte[@J,X,Y,LARGURA,ALTURA]` | Define recorte lógico com inteiros InSd32 e dimensões não negativas |
| `JanelaSemRecorte[@J]` | Remove o recorte |

Desenhar exige RefJanela. Coordenadas precisam ser finitas e estar entre
−10.000.000 e 10.000.000; raios/espessuras são limitados a 16.384. Métricas e
posicionamento mantêm a relação com a linha de base; largura/altura são da textura,
não equivalem necessariamente ao avanço tipográfico. Para texto vazio, não se
cria textura. A textura de um Visual é preparada uma vez. Alterar posição ou cor
não a recria; alterar seu conteúdo exige criar outro Visual.

Um Visual pertence à janela em que foi criado. Desenhá-lo em outra janela ou
depois de fechar sua proprietária gera erro. Liberar a fonte não invalida um
Visual já preparado. O runtime mantém a proprietária viva até liberar suas
texturas, e o compilador libera recursos lexicalmente após os Defer do usuário.

`FonteCarregar[TAMANHO]` continua carregando DejaVu Sans. Importar `tom/musica`
inclui automaticamente `assets/tom/Bravura.otf` e sua licença SIL OFL 1.1.
A fonte [Bravura 1.482](https://github.com/steinbergmedia/bravura/releases/tag/bravura-1.482)
está versionada no repositório; versão e SHA256 constam de
[`toolchain.json`](../../scripts/toolchain.json) e o build verifica os hashes.
Os significados dos códigos [SMuFL](https://www.smufl.org/) ficam em Tom.

## Mixer e reprodução

Audio e Som são recursos de duração lexical, criados com `DefRecurso`.
`AudioCriar[]` abre o dispositivo padrão e começa com a posição musical pausada
em zero. Isso permite preparar acompanhamento e vozes antes de iniciar.

O mixer usa 48.000 **quadros de amostra por segundo**, cada quadro contendo
esquerda e direita em float32. Todas as posições da API contam quadros estéreo,
não bytes nem valores individuais de cada canal. Há 32 canais, numerados 0..31,
e uma fila prealocada para 256 comandos pendentes por Audio.

Na tabela, A é Audio, S é Som, canal é InSd32, frequência/volume são Fl64,
duração e posição são InSd64, repetir/pausar são Bl. Operações de alteração
exigem RefAudio; Som é emprestado somente para leitura.

| Chamada | Contrato |
|---|---|
| `AudioCriar[]` | Cria mixer e dispositivo; falha de dispositivo é capturável |
| `AudioTom[@A,CANAL,HZ,VOLUME,DURACAO_NS]` | Tom na próxima posição disponível |
| `AudioAgendarTom[@A,CANAL,HZ,VOLUME,DURACAO_NS,AMOSTRA]` | Tom na posição absoluta escolhida |
| `SomCarregarWav[@A,CAMINHO,LIMITE_BYTES]` | Carrega e converte WAV; limite InUd64 explícito |
| `AudioSom[@A,@S,CANAL,VOLUME,REPETIR]` | WAV na próxima posição disponível |
| `AudioAgendarSom[@A,@S,CANAL,VOLUME,REPETIR,AMOSTRA]` | WAV agendado, inclusive acompanhamento em repetição |
| `AudioVolume[@A,VOLUME]` | Volume geral de 0.0..1.0 |
| `AudioVolumeCanal[@A,CANAL,VOLUME]` | Multiplicador de canal de 0.0..1.0 |
| `AudioPararCanal[@A,CANAL]` | Interrompe a voz e cancela comandos futuros desse canal |
| `AudioPausar[@A,PAUSAR]` | Verdadeiro pausa; falso retoma |
| `AudioPosicao[@A]` | InSd64: primeira posição ainda não processada |
| `AudioVerificar[@A]` | Propaga falha assíncrona na thread principal, se houver |

Frequências válidas são finitas e estritamente entre 0 e 24.000 Hz. Duração deve
ser positiva e é convertida em quadros com arredondamento para cima. Tons têm
transições de até 5 ms no início/fim. Substituir/parar a voz de um canal aplica
uma cauda de até 5 ms à voz anterior. O volume é o produto de voz, canal e geral;
a mistura final satura em −1..1. Para sons simultâneos, use canais distintos.

Comandos na mesma posição iniciam no mesmo quadro, independentemente do tamanho
dos blocos solicitados pelo dispositivo. No mesmo canal, comandos empatados
seguem a ordem de inserção e substituem a voz anterior. Agendar antes da posição
processada lança erro 9; exceder 256 comandos lança erro 5 sem alterar a fila.
As variantes imediatas usam a próxima posição disponível; `AMOSTRA=-1` também
seleciona esse comportamento. Valores menores são inválidos. Para garantir
simultaneidade, agende uma posição futura comum ou prepare tudo enquanto pausado.

WAV aceita RIFF little-endian, PCM 8/16/24/32 bits ou float32, mono/estéreo e
8.000..192.000 Hz. Outros formatos, NaN e infinito são rejeitados. O carregamento
valida tamanhos antes de decodificar e converte para o formato interno. O limite
de 1..2147483647 bytes se aplica tanto ao PCM de origem quanto ao PCM convertido,
individualmente; ambos podem coexistir temporariamente. Não é um teto para toda
a memória do processo. Não há acesso a arquivo nem decodificação no callback.
Repetição preserva as amostras WAV; o arquivo deve ter uma junção adequada para
um loop sem estalos. Liberar Som cancela suas vozes e comandos antes de liberar PCM.

## Sincronização e falhas

| Chamada | Contrato |
|---|---|
| `AudioAmostraParaTempoNs[@A,AMOSTRA]` | Estima o horário monotônico da posição |
| `AudioTempoNsParaAmostra[@A,TEMPO_NS]` | Conversão inversa estimada |
| `AudioCompensacaoNs[@A,AJUSTE_NS]` | Compensação InSd64; valor positivo desloca a estimativa para depois |

Posições e horários dessas conversões devem ser não negativos. Aritmética usa
intermediários largos e verifica a faixa de InSd64. Conversões fracionárias
truncam; um percurso de ida/volta pode diferir em uma amostra.

A correlação é atualizada no processamento de áudio e ao retomar. Pausar congela
a posição musical; o dispositivo continua recebendo silêncio. Amostras já entregues
ao SDL/dispositivo podem terminar de tocar. Durante a pausa, a correlação anterior
é apenas histórica; retomar estabelece uma nova origem. A API não promete que a
posição já processada seja a posição ouvida: buffers e dispositivo acrescentam
latência. Calibre a compensação por equipamento para aplicações rítmicas.

O [callback SDL](https://wiki.libsdl.org/SDL3/SDL_AudioStreamCallback) executa
somente código nativo, sem chamar Tom, ler arquivos ou fazer alocações próprias
por bloco. O mixer usa buffers limitados; a sincronização com a thread principal
usa o lock do stream. Falhas assíncronas interrompem o avanço, fornecem silêncio
e ficam disponíveis por AudioVerificar; um Audio em falha deve ser recriado.

Todas as operações públicas de janela/desenho e controle dos recursos são feitas
na thread principal. Inicialização SDL tem referências independentes para vídeo
e áudio; fechar a última janela não interrompe Audio. Destruir Audio sincroniza
com o callback antes de liberar memória. Exceções continuam sendo estados de
erro pela ABI C, com localização da chamada Tom que observou a falha.

## Biblioteca musical

`NotaMusical` é uma estrutura SOA com `letra`, `oitava`, `alteracao` InSd32 e
`ativa` Bl. C/D/E/F/G/A/B têm valores 0..6; bemol/natural/sustenido são −1/0/1.
Oitavas aceitas são −1..9; conversões cromáticas exigem resultado 0..127.

| Função Tom | Resultado |
|---|---|
| `MusicaValidarEscrita[LETRA,OITAVA,ALTERACAO]` | Valida os três campos sem alterar a escrita |
| `MusicaAltura[LETRA,OITAVA,ALTERACAO]` | InSd32 cromático, com C4=60 |
| `MusicaAlturaDaNota[@NOTAS,INDICE]` | Mesmo cálculo via SOA<NotaMusical>, com índice verificado |
| `MusicaFrequencia[ALTURA]` | Fl64, temperamento igual, A4=69=440 Hz |
| `MusicaPosicaoSol[LETRA,OITAVA]` | InSd32 diatônico: E4=0 na linha inferior; cada unidade é meia distância entre linhas |
| `MusicaPrazoNs[ORIGEM,PASSO,NUM,DEN,BPM]` | InSd64: origem + trunc(passo × num × 60.000.000.000 / (den × bpm)) |

Parâmetros de prazo são InSd64: origem/passo não negativos e num/den/BPM positivos.
Uma batida equivale à semínima. Cada prazo parte da mesma origem, evitando somar
durações arredondadas. Inteiros intermediários também têm overflow verificado;
valores excessivos lançam erro mesmo se uma simplificação algébrica coubesse.
Dó sustenido e Ré bemol compartilham altura/frequência, preservando posições
diatônicas e escrita distintas. A biblioteca não define armadura, transposição,
claves adicionais ou interpretação de uma partitura completa.

Constantes `GLIFO_*` cobrem clave de sol, cabeças cheia/mínima/semibreve, acidentes
e pausas. `DURACAO_*_NUM`/`*_DEN` fornecem razões básicas relativas à semínima;
consulte o fonte da biblioteca para os nomes disponíveis.

## Empacotamento

`--assets DIRETORIO` é válido com `--build` ou `--run`. Copia a árvore para
`assets/`, recusando links simbólicos, arquivos especiais e colisões com assets
padronizados. Fontes e WAV usam caminhos relativos a essa pasta ao lado do
executável, independentemente do diretório de trabalho. Caminhos absolutos e
componentes `.`/`..` não são aceitos nas operações de recurso.

O build verifica LLVM, faz link, inclui assets/licenças e só publica após sucesso.
`tom-build.json` registra alvo, otimização, runtimes e assets padronizados. A API
pura expõe essas necessidades sem ler arquivos. Copie a pasta completa de cada
plataforma: não é necessário Node/LLVM para executar. Os [instaladores](../../scripts/README.md)
mantêm os alvos e dependências separados em `.tools/`.

### Apoio à clave de fá

`GLIFO_CLAVE_FA` identifica U+E062 em Bravura. `MusicaPosicaoFa[Letra,Oitava]`
retorna posições diatônicas em meias distâncias entre linhas: G2=0, F3=6 e C4=10.
A interface de `MusicaPosicaoSol` é preservada. O aplicativo
[Musical Tom](../../jogos/musical-tom/README.md) usa ambas as funções.

## Extensão visual aditiva

Escala/rotação de visuais, retângulos arredondados, gradientes e animações em Tom
estão disponíveis no [contrato de desenho 2D](visual-2d.md), usando as mesmas dependências.
