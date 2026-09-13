# Demonstrações Tom 0.3

Quatro programas independentes exercitam os fundamentos para aplicações musicais.
O estado, entrada, disposição e chamadas musicais estão em `.tom`. Não há jogo,
pontuação ou regras pedagógicas. A [referência multimídia](../../docs/multimedia-0.3.md)
explica cada operação e a [biblioteca musical](../../stdlib/musica.tom) preserva a
diferença entre escrita da nota e frequência.

Depois de preparar e ativar o [ambiente local](../../../scripts/README.md), execute
na raiz do repositório, em Linux/WSLg ou PowerShell Windows:

```text
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/animacao.tom
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/teclado.tom
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/catalogo.tom
node tom-lang/tomc.js --run --assets tom-lang/exemplos/multimedia/assets tom-lang/exemplos/multimedia/audio.tom
```

| Fonte | O que demonstra |
|---|---|
| [animacao.tom](animacao.tom) | Posição pelo tempo desde uma origem; linha, elipse, Visual e espera com prazo |
| [teclado.tom](teclado.tom) | A–G/W/R mantidas simultaneamente, soltura, repetição e limpeza ao perder foco |
| [catalogo.tom](catalogo.tom) | Clave de sol, C4–B5, linhas suplementares, acidentes e pausa; Bravura preparada uma vez |
| [audio.tom](audio.tom) | WAV em repetição no canal 31, tríade agendada na mesma amostra, tons por A–G e pausa por Espaço |
| [comum.tom](comum.tom) | Constantes e funções compartilhadas; importar não abre janelas |

Escape ou fechar a janela encerra cada demonstração. No áudio, perder foco pausa
a posição musical; Espaço retoma. A demonstração captura erros durante o laço e
mostra a mensagem mantendo a janela disponível. A–G usam a oitava 4; as teclas
W/R só são observadas no monitor e não aplicam acidentes automaticamente.
O catálogo usa coordenadas lógicas e métricas de origem/linha de base dos glifos.

`@ULTIMO` transporta resultados imediatos dentro de cada bloco. Valores que
atravessam quadros, ramificações ou chamadas são guardados em variáveis. A
coleção de notas passa por `SOA<NotaMusical>` para leitura; os textos/glifos
preparados pertencem à janela e o Som pertence ao Audio. Todos são liberados
depois dos Defer ao encerrar o respectivo escopo.

## Assets e distribuição

`assets/acompanhamento.wav` é um tom de fundo com pulso, sintetizado por
[`generate-demo-audio.js`](../../../scripts/generate-demo-audio.js), em PCM16 mono
48 kHz, duração de 2 segundos. Não usa gravações ou amostras de terceiros.
Execute `node scripts/generate-demo-audio.js` para regenerá-lo. Sua licença é
CC0 1.0, descrita no arquivo que acompanha o asset.

Bravura 1.482 tem licença SIL OFL 1.1 e é incluída automaticamente por `tom/musica`.
DejaVu Sans acompanha as janelas de texto. As licenças e dependências nativas
acompanham o pacote. Substitua `--run` por `--build` e copie toda a pasta
`build/<plataforma-arquitetura-abi>/<nome>/` gerada ao lado dos fontes.
O executável resolve os recursos em relação a sua própria pasta; não depende do
diretório de trabalho nem de Node/LLVM na máquina que o executa.

## Verificação

```text
node scripts/verify-multimedia.js
node scripts/verify-multimedia.js --desktop
node scripts/verify-multimedia.js --package
node scripts/verify-audio-device.js
```

O primeiro comando usa eventos/áudio simulados em O0 e O2. Os demais abrem janelas
ou dispositivo reais e produzem sons. Logs, capturas e relatórios ficam em
`.tools/<plataforma>/validation-03/`. A suíte `npm --prefix tom-lang test` também
verifica os cálculos Tom e as amostras do mixer. A chegada do som ao ouvido exige
calibração; os testes medem separadamente a posição do mixer e o dispositivo.

## Acabamento visual

`visual.tom` demonstra formas arredondadas, gradientes, transformação de glifos,
partículas e controles com tema. Use Celebrar para emitir partículas e Reduzir
movimento para desativar a decoração animada. [Contrato](../../docs/visual-2d.md).
