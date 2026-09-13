# Validação do acabamento visual

Executada localmente em 13/09/2026, Windows x64 e Linux/WSLg, com as dependências
fixadas do projeto. Não houve atualização de SDL, fontes ou outras bibliotecas.

## Resultado

| Verificação | Linux | Windows |
|---|---|---|
| 146 testes anteriores da linguagem | Aprovados | Aprovados |
| 7 novos testes de primitivas, bibliotecas, tema e editor | Aprovados em O0/O2 quando nativos | Aprovados em O0/O2 quando nativos |
| Nova demonstração visual | Aprovada em O0/O2 | Aprovada em O0/O2 |
| 13 testes anteriores + 6 novos testes do jogo | 19 aprovados | 19 aprovados |
| Calculadoras Tom/C | 38 cenários, 142 eventos e 135 quadros iguais em O0/O2 | Mesmo resultado |
| Desktop instrumentado O2 | WSLg/PulseAudio aprovado | Win32/WASAPI aprovado |
| Pacote independente de Node/LLVM | O2 aprovado | O0 e O2 aprovados |

São **173 casos** aprovados por plataforma, contando os testes da linguagem,
exemplos e jogo. Os testes nativos cobrem as duas otimizações dentro desses casos.
Os cenários adicionais do benchmark estão discriminados separadamente na tabela.

A suíte da linguagem executou 154 casos: inicialmente, 153 passaram e a nova
demonstração falhou ao carregar a Bravura. Faltava importar `tom/musica`, que declara
o asset padrão para o build. Após a correção, esse exemplo foi repetido isoladamente
e passou em O0/O2 nas duas plataformas. Os logs originais e os da repetição foram
preservados, sem apresentar a primeira execução como integralmente aprovada.

## Evidências e cobertura

- Comparação de pixels: transformação identidade igual ao desenho anterior,
  gradiente vertical, alfa, recorte, raio limitado e limites geométricos.
- Transformações e métricas sem recriação do visual; IDs removidos, proprietários
  incorretos, janelas encerradas e argumentos inválidos tratados explicitamente.
- Curvas, horários extremos, canais RGBA, transições interrompidas dos controles,
  preferência de movimento reduzido e compatibilidade dos snippets.
- Replay real da lógica Tom em 30/60/144 FPS, com pausa e atraso de 900 ms; a
  mesma rodada produz pontos, julgamentos e comandos de áudio iguais com efeitos
  normais, reduzidos e desligados. O sorteador decorativo usa uma sequência própria.
- Preferência opcional no perfil, leitura de arquivo antigo, erro de tipo sem
  alteração parcial e salvamento/reabertura pelo fluxo real da interface.
- Capturas de acerto preciso na clave de fá, partículas, modo reduzido e cartão
  de conquista. As imagens foram inspecionadas; símbolos não cobrem a legenda do
  cartão, e a decoração preserva a leitura das notas e dos acidentes.
- Cem ciclos de recursos por otimização e plataforma continuam passando. A
  verificação exige zero objetos Tom vivos ao encerrar; o contador não representa
  uma auditoria de todas as alocações internas dos drivers.

O modo Aprender e a pausa reduzem a frequência de atualização quando não há
animação. O áudio continua sendo verificado a cada 250 ms para tratar falhas
assíncronas. Menus sem animação aguardam eventos sem um laço de redesenho contínuo.

## Pacotes e pendência Windows anterior

Os pacotes atuais ficam em `build/dist/`, com SHA-256 ao lado:

- `musical-tom-0.1.0-linux-x64-O2.tar.gz`
- `musical-tom-0.1.0-windows-x64-O2.zip`
- `musical-tom-0.1.0-windows-x64-O0.zip`

A remoção do executável Windows O2 observada na entrega inicial **não se reproduziu
no novo executável**. O pacote O2 atual passou pelo driver de desktop com WASAPI,
sem Node ou LLVM no PATH da aplicação. A causa do incidente anterior permanece
não confirmada; nenhuma proteção foi desativada nem houve exclusão de antivírus.

Recibos com hash do executável estão em
`build/<linux|windows>/<desktop|package|package-O0>/verification.json`.
O empacotador exige correspondência entre esse hash e o executável atual.
As capturas estão em `build/visual/<linux|win32>/<O0|O2>/`.

Os logs ficam em `.tools/visual-work/`: `baseline-<plataforma>.log`,
`example-<plataforma>.log`, `game-<plataforma>-final.log`,
`benchmark-<plataforma>.log`, além dos logs de desktop e pacotes.
Logs produzidos pelo PowerShell usam UTF-16.

## Reproduzir

Ative `source scripts/env.sh` no Linux ou `. ./scripts/env.ps1` no PowerShell.

```text
npm --prefix tom-lang test
node --test --test-concurrency=1 jogos/musical-tom/tests/*.test.js
node benchmarks/calculator/run.js --verify
node jogos/musical-tom/scripts/verify-desktop.js
node jogos/musical-tom/scripts/verify-desktop.js --package
node jogos/musical-tom/scripts/archive.js
npm --prefix tom-lang run package:extension
```

Use `TOM_VERIFY_AUDIO_DRIVER=pulseaudio` no Linux ou
`$env:TOM_VERIFY_AUDIO_DRIVER = 'wasapi'` no Windows para exigir o dispositivo real.
Acrescente `--O0` aos comandos de pacote/arquivo para a variante Windows O0.
O workflow existente coleta os novos testes pelo padrão de nomes e pelo manifesto
de exemplos; nenhuma execução remota de CI foi realizada nesta entrega.
