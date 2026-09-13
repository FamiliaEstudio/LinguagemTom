# Musical Tom 0.1.0

Jogo de leitura de partitura escrito em Tom, com rodadas de 20 notas, claves de
sol e fá, acidentes, três modalidades e progresso salvo neste computador.
Faz parte deste repositório em uma pasta própria; usa a linguagem Tom 0.4.

## Jogar

Os pacotes locais já validados ficam em `build/linux/package/musical-tom/` e
`build/windows/package/musical-tom/`. Abra `musical-tom` ou `musical-tom.exe`.
Arquivos para copiar a outro computador ficam em `build/dist/`; extraia a pasta
inteira antes de abrir o jogo. Não é necessário instalar Node ou LLVM para jogar.
Os pacotes atuais de ambas as plataformas foram validados em O2. A variante
Windows O0 também está disponível. Veja a [validação visual atual](VALIDACAO-VISUAL.md).

Na raiz do repositório, ative `source scripts/env.sh` no Linux/WSLg ou
`. ./scripts/env.ps1` no PowerShell Windows. As ferramentas locais são as mesmas
da linguagem; veja [instalação](../../scripts/README.md).

```text
node tom-lang/tomc.js --run --assets jogos/musical-tom/assets jogos/musical-tom/src/musical-tom.tom
```

Comece em **Aprender**, clave de sol. Os botões Modalidade, Clave, Velocidade,
Notas/acidentes e Música percorrem as opções; a seleção informa quando está
bloqueada. Complete rodadas e consulte o próximo objetivo na tela inicial.

| Controle | Ação |
|---|---|
| C D E F G A B | Dó Ré Mi Fá Sol Lá Si |
| Segurar W e pressionar uma letra | Responder com sustenido |
| Segurar R e pressionar uma letra | Responder com bemol |
| F1 / Ajuda | Revelar nome, oitava e teclas da nota ativa; sem pontos nessa nota |
| Escape / Pausar | Pausar e retomar a rodada |
| Tab / Shift+Tab | Navegar pelos controles |
| Enter / Espaço | Ativar o controle com foco |
| Setas | Ajustar o controle deslizante com foco |

Em Configurações, as nove associações podem ser remapeadas para letras A–Z ou
números 0–9 distintos. A legenda e a ajuda acompanham o remapeamento. A oitava é
desenhada e tocada; não exige uma tecla adicional. Segurar W e R ao mesmo tempo
invalida a tentativa. Repetição automática de teclado não responde novas notas.
Perder o foco pausa a partida e limpa teclas mantidas; é preciso retomar explicitamente.

## Modalidades e progressão

- **Aprender:** uma nota parada, sem prazo. Errou? Tente de novo; essa nota deixa
  de conceder pontos, mas continua disponível para aprender a resposta.
- **Movimento:** responda à nota verde antes da linha. As notas vêm **da direita
  para a esquerda**; não é necessário acertar um instante exato.
- **Ritmo:** cada alvo fica ativo uma batida antes da linha. A primeira tentativa
  o julga; são aceitos até 200 ms antes/depois, com indicação de precisão até 80 ms.
  Responder cedo demais à nota ativa, errar a escrita ou perder o prazo conta como erro.

Os modos temporizados começam com quatro batidas preparatórias, usam quatro
batidas de percurso e uma nota a cada duas batidas. Cada nota ocupa um compasso
2/4 próprio, com uma mínima. Avalia-se o início da resposta, sem exigir sustentar a
tecla. Acidentes não passam de um exercício para outro. Os fundos são independentes
das notas sorteadas.

Faixas: Dó4–Dó5 em sol e Dó3–Dó4 em fá. Os conjuntos cromáticos acrescentam C#,
D#, F#, G#, A# e Db, Eb, Gb, Ab, Bb na oitava inferior de cada faixa. C# e Db podem
soar iguais, mas exigem respostas diferentes. Cada saco sorteado contém uma vez
cada escrita; a rodada usa sacos sucessivos até completar 20 notas.

Uma resposta correta na primeira tentativa e sem ajuda vale **10 pontos**.
Somente rodadas concluídas alteram pontos, domínio e estatísticas; abandonar não
retira pontos. **Domínio** requer duas rodadas de pelo menos 18 acertos pontuáveis
na mesma modalidade, clave, velocidade e conjunto. Os requisitos usam notas naturais.

| Conteúdo | Pontos acumulados | Domínio necessário |
|---|---:|---|
| Aprender em sol / Estrelinha | 0 | Inicial |
| Movimento, 60 BPM | 300 | Aprender na clave selecionada |
| Frère Jacques | 500 | Aprender em sol |
| Clave de fá | 600 | Movimento em sol a 60 BPM |
| Acidentes | 1.000 | Aprender em fá |
| Ode à Alegria | 1.200 | Aprender em fá |
| Ritmo, 60 BPM | 1.400 | Movimento na clave selecionada a 60 BPM |
| 90 BPM | 1.800 | Ritmo na clave selecionada a 60 BPM |
| 120 BPM | 2.600 | Ritmo na clave selecionada a 90 BPM |

Pontos não são gastos. Conteúdo conquistado permanece disponível. Velocidades
liberadas valem para Movimento e Ritmo naquela clave. O balanceamento está nas
constantes de [conteudo.tom](src/conteudo.tom).

## Acabamento visual e acessibilidade

A interface usa papel claro, cartões arredondados, sombras discretas e transições
nos controles. Acertos mostram halo e confirmação; **+10** aparece apenas quando
a nota realmente concedeu pontos. Respostas precisas recebem destaque dourado e
partículas. Resultados têm contador e barra animados; novos conteúdos recebem um
cartão com símbolo musical.

Em Configurações, **Reduzir movimento** remove partículas, deslocamentos
decorativos e pulsações. Texto, símbolos, foco e as regras das modalidades são
preservados. A preferência é salva automaticamente; perfis anteriores usam o
padrão desativado. Os efeitos da rodada congelam na pausa. O modo Aprender
continua com a nota parada até a resposta correta.

As animações usam horários explícitos. O sorteador decorativo é independente do
sorteador das notas. Há 128 slots de partículas, com reciclagem da mais antiga;
a decoração não acumula recursos nem interfere em pontos ou áudio. A interface
aguarda eventos quando está ociosa. Com áudio aberto, verifica falhas assíncronas
a cada 250 ms mesmo durante a ociosidade.

## Perfil, erros e som

O perfil `perfil.json` fica no diretório SDL de `PipimStudios/MusicalTom`, normalmente
`~/.local/share/PipimStudios/MusicalTom/` no Linux e
`%APPDATA%\PipimStudios\MusicalTom\` no Windows. Há um perfil local, sem conta ou nuvem.
São guardados pontos, domínio, últimas 50 rodadas, estatísticas por escrita/clave/modo,
associações, volumes, calibração, semente e identificação da última rodada consolidada.

Acertos nas estatísticas são os pontuáveis. Erros e ajudas são contados por nota;
uma mesma nota pode ter ambos. O tempo médio considera a primeira tentativa, e
no Ritmo o desvio médio usa o valor absoluto da diferença para a linha. As
estatísticas por escrita agregam velocidades; o domínio mantém cada velocidade separada.

Salvar novamente repete somente a gravação, sem conceder pontos outra vez.
Um perfil inválido é preservado: o jogo permite praticar em memória. Corrija o
arquivo e use Recarregar perfil para restabelecer a persistência. Recarregar
substitui o estado em memória por todo o perfil validado do disco. Uma falha de
escrita mantém o progresso em memória e oferece nova tentativa.

Falha de áudio ou recurso interrompe a rodada e devolve à tela inicial com uma
mensagem. Começar rodada tenta novamente desde o início; o perfil fica preservado.
Rodadas interrompidas não concedem pontos. Fechar a janela durante uma rodada
completa ainda consolida o resultado, se a última nota já tiver sido julgada.

Os volumes de fundo, notas e metrônomo são separados, incluindo silêncio.
Compensações de entrada, áudio e apresentação vão de -500 a +500 ms, em passos
de 5 ms. O relógio do mixer é a referência musical; a chegada efetiva do som ao
ouvido depende do dispositivo e da calibração. Veja os [créditos dos fundos](assets/CREDITOS.md).

## Como o código se relaciona

| Módulo | Responsabilidade |
|---|---|
| [musical-tom.tom](src/musical-tom.tom) | Recursos da aplicação, navegação, configurações, carregar e salvar |
| [conteudo.tom](src/conteudo.tom) | Constantes, registros, faixas e distribuição PCG32 |
| [rodada.tom](src/rodada.tom) | Início, alvo ativo, respostas, ajuda, expiração e projeção da posição |
| [perfil.tom](src/perfil.tom) | Requisitos de desbloqueio, consolidação idempotente e JSON transacional |
| [apresentacao.tom](src/apresentacao.tom) | Controles, visuais, nomes, pauta, claves, acidentes e linhas suplementares |
| [painel.tom](src/painel.tom) | Textos das telas, progresso, resultados, histórico e estatísticas |
| [visual.tom](src/visual.tom) | Observação dos julgamentos, halos, partículas, pulso e apresentação de conquistas |
| [audio.tom](src/audio.tom) | Áudio lexical da rodada, agendamento e adaptação dos eventos nativos |

`JogoEntrada` recebe eventos normalizados e um relógio explícito; os testes de
reprodução chamam a mesma função. `JogoResponder` julga uma nota, `JogoExpirar`
consolida prazos e `JogoPosicaoX` apenas projeta o desenho. A janela esvazia eventos
pendentes antes de consolidar notas vencidas. Cada prazo deriva da origem comum.

`@ULTIMO` guarda somente o último resultado válido no bloco. Por exemplo, a
frequência retornada por `MusicaFrequencia` é imediatamente copiada para
`Estado.frequencia`; o estado persistente fica em registros e variáveis explícitas.
Recursos da rodada vivem em `JogoJogar` e são liberados nas saídas normais e de erro.
Fontes e visuais preparados duram a janela; mover notas reutiliza as texturas.

Limites explícitos: 20 notas, 18 escritas por clave, 36 combinações de domínio,
108 linhas de estatísticas, 50 resultados, 9 associações, 64 visuais, 128 partículas, um fundo
carregado de até 64 MiB e 1.024 trechos de pausa por rodada. Esgotamento é erro
recuperável. A aplicação não contém ponteiros nem lógica nativa específica do jogo.

## Build, testes e distribuição

```text
node jogos/musical-tom/scripts/build.js
node --test --test-concurrency=1 jogos/musical-tom/tests/*.test.js
node jogos/musical-tom/scripts/verify-desktop.js
node jogos/musical-tom/scripts/verify-desktop.js --package
node jogos/musical-tom/scripts/archive.js
```

O build usa `-O2`; `--O0` escolhe a outra otimização. Copie a pasta inteira
`jogos/musical-tom/build/<linux|windows>/O2/musical-tom/` para distribuir.
O destinatário abre `musical-tom.exe` ou `./musical-tom`, com os assets, fontes,
bibliotecas e licenças ao lado. Node e LLVM são necessários somente para desenvolver.
Linux exige um desktop X11/XWayland e glibc compatível; WSL usa WSLg.

Para produzir também a variante Windows O0, acrescente `--O0` aos
comandos `build.js`, `verify-desktop.js --package` e `archive.js`. O arquivo final
recebe plataforma, versão e otimização no nome, acompanhado de seu SHA-256.
O empacotador usa o CMake local e exige um recibo de produção aprovado que
corresponda ao executável atual.

`verify-desktop.js` abre uma janela real e usa os drivers locais da linguagem.
`--package` abre o pacote de produção com Node/LLVM removidos do PATH do aplicativo.
Na CI sem dispositivo de áudio, `TOM_VERIFY_AUDIO_DRIVER=dummy` seleciona áudio
simulado explicitamente. Resultados reais e simulados são distinguidos nos recibos.
Execute testes de desktop sequencialmente.

Para reconstruir os nove WAVs: `node jogos/musical-tom/scripts/generate-music.js`.
O manifesto inclui as transcrições, fontes, durações e hashes. Não há download na
execução normal do jogo. [Validação inicial](VALIDACAO.md) e [validação do acabamento atual](VALIDACAO-VISUAL.md).

## VS Code

A extensão Tom continua oferecendo cores e diagnósticos aos módulos do jogo.
A biblioteca musical ganhou `MusicaPosicaoFa`; gere e reinstale o VSIX local com
`npm --prefix tom-lang run package:extension` para atualizar também a cópia da
biblioteca usada pela extensão. O arquivo é `tom-lang/build/tom-lang-0.4.0.vsix`.

## Próximas versões

Acordes, outras claves, leitura de figuras rítmicas variadas, importação de
partituras e execução das melodias completas pelo jogador. A versão 0.1 trabalha
notas isoladas e ataques em uma grade regular; não avalia a duração sustentada.

A camada visual reutilizável é documentada no [contrato da Tom](../../tom-lang/docs/visual-2d.md).
