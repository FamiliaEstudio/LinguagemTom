# Validação inicial de Musical Tom 0.1.0

Este documento preserva os resultados da entrega inicial. Consulte a
[validação do acabamento visual](VALIDACAO-VISUAL.md) para os testes e pacotes
atuais, incluindo a abertura bem-sucedida do novo executável Windows O2.

Execução local em 12–13/09/2026, Windows x64 e Linux/WSLg, usando as ferramentas
fixadas do repositório: Node 24, LLVM 21.1, SDL 3.4.16, SDL_ttf 3.2.2, libmpdec
4.0.1 e yyjson 0.12.0. Os comandos abaixo partem da raiz do repositório.

## Resultado observado

| Verificação | Linux/WSLg | Windows |
|---|---|---|
| 146 testes existentes da linguagem | Aprovados | Aprovados |
| 13 testes novos do jogo | Aprovados | Aprovados |
| LLVM e execução do jogo em `-O0` e `-O2` | Aprovados | Aprovados |
| Calculadoras Tom/C: 38 cenários, 142 eventos, 135 quadros por otimização | Iguais em O0/O2 | Iguais em O0/O2 |
| Janela instrumentada: entrada, ajuda, pausa, foco, redimensionamento e fechamento | Aprovada em WSLg | Aprovada em Win32 |
| Dispositivo de áudio real | PulseAudio: 28.647 amostras processadas | WASAPI: 28.800 amostras processadas |
| Pacote final de produção, sem Node/LLVM no PATH da aplicação | Aprovado em O2 | Aprovado em O0 |

Os 13 testes do jogo foram executados como a suíte de 11 casos, seguida dos dois
casos adicionais de 100 ciclos de recursos, nas duas plataformas. Nenhum caso
foi ignorado. Os testes nativos usam os mesmos módulos `.tom` da aplicação.

**Pendência do pacote Windows O2:** a última versão instrumentada O2 e o pacote
de produção O0 abriram e passaram pelo driver de desktop com WASAPI. O build de
produção O2 terminou, mas a tentativa de abri-lo
retornou `EPERM`/`EBUSY` e o arquivo `.exe` desapareceu. Há Kaspersky instalado;
a consulta dos eventos disponíveis não confirmou a causa da remoção. Nenhuma
proteção foi desativada, nem foi criada exclusão. Uma versão anterior do pacote
abriu, mas isso não valida o executável O2 final. O recibo anterior foi removido
para evitar confundir essas versões. A distribuição Windows desta entrega usa
O0, com a mesma lógica e os recursos de produção. O pacote Windows O2 continua
pendente da resolução desse bloqueio e de uma nova execução de
`verify-desktop.js --package`. Não foi aplicado ajuste à proteção do computador.

## Cobertura do jogo

- Distribuição PCG32 equilibrada e reproduzível; posições nas duas claves,
  acidentes, grafias enarmônicas e projeção independente do desenho.
- Tentativas, ajuda, pontuação e limites inclusivos de 200/80 ms; requisitos
  imediatamente antes/depois dos pontos necessários; campanha com todos os
  desbloqueios, 100 rodadas concluídas e retenção dos últimos 50 resultados.
- Modificadores, repetição, remapeamento, perda de foco e origem de eventos
  recebidos após pausa/retomada. Cada evento julga no máximo um alvo.
- A mesma gravação passa por `JogoEntrada` a 30, 60 e 144 FPS, incluindo atraso
  de desenho de 900 ms, pausa de dois segundos e eventos com o mesmo horário.
  Pontos, acertos, comandos sonoros e checksum dos julgamentos permanecem iguais.
- Perfil reaberto, JSON inválido e versão desconhecida; validação antes da
  substituição do estado; arquivo inválido preservado. Uma falha real de escrita
  é provocada após carregar o perfil; a nova tentativa salva sem duplicar pontos.
- UI compilada com dispositivos simulados: rodada completa, ajuda/erro,
  remapeamento C→Z, calibração, histórico e exercícios de fá com acidentes nos
  modos Movimento/Ritmo a 120 BPM. Imagens BMP permitem inspecionar a pauta.
- Nove WAVs: SHA-256, PCM16 estéreo/48 kHz, duração, alinhamento do ciclo,
  amplitude e licença. O mixer e o agendamento por amostra também permanecem
  cobertos pela suíte existente da linguagem.
- Cem chamadas reais a `JogoJogar`, por otimização e plataforma, carregando e
  liberando WAV/áudio com a janela e os visuais reutilizados. Todas terminam com
  zero objetos Tom vivos; o pico fica abaixo do limite de 256 objetos do teste.

A repetição de 100 chamadas nativas encerra cada rodada pela entrada simulada de
fechamento, para exercitar sua limpeza. A campanha de 100 rodadas completas é um
teste separado da lógica. O contador de objetos verifica os recursos administrados
pela Tom; não equivale a uma auditoria de todo o RSS ou das alocações do driver.

Durante os testes foi corrigido um tempo de resposta negativo causado por ajuste
da correlação estimada do áudio entre callbacks: a reação mínima é zero, incluindo
respostas instantâneas nas estatísticas. Também foram cobertos eventos anteriores
à pausa entregues depois dela e eventos originados durante a pausa entregues após
a retomada. O julgamento usa o instante de origem.

## Reprodução e evidências locais

Ative `source scripts/env.sh` no Linux ou `. ./scripts/env.ps1` no PowerShell.

```text
npm --prefix tom-lang test
npm --prefix tom-lang run benchmark:verify
node --test --test-concurrency=1 jogos/musical-tom/tests/*.test.js
node scripts/verify-audio-device.js
node jogos/musical-tom/scripts/verify-desktop.js
node jogos/musical-tom/scripts/verify-desktop.js --package
node jogos/musical-tom/scripts/verify-desktop.js --package --O0
```

Para exigir o dispositivo real, defina `TOM_VERIFY_AUDIO_DRIVER=pulseaudio` no
Linux ou `$env:TOM_VERIFY_AUDIO_DRIVER = 'wasapi'` no Windows. Execute os drivers
de desktop sequencialmente. Na CI, áudio `dummy` é indicado explicitamente;
essa execução verifica a janela e os comandos, não um dispositivo físico.

Os logs locais ficam em `.tools/<linux|windows>/musical-*.log`:
`baseline`, `final`, `resources`, `benchmark` e `device`. Os logs PowerShell são
UTF-16. Recibos de desktop ficam em
`jogos/musical-tom/build/<linux|windows>/<desktop|package>/verification.json`.
O verificador remove o recibo anterior antes de começar e só publica outro após
aprovação; os novos recibos incluem SHA-256 do executável.

O pacote Linux validado está em `build/linux/package/musical-tom/`. O pacote
Windows validado está em `build/windows/package-O0/musical-tom/`. A janela
Windows instrumentada O2 está em `build/windows/desktop/musical-tom/`; ela é
uma versão para diagnóstico, distinta do pacote de produção O2 pendente.
`scripts/archive.js` cria arquivos em `build/dist/` somente quando o SHA-256 do
executável corresponde ao recibo aprovado; no Windows desta entrega, use `--O0`.
Os arquivos gerados foram conferidos por leitura: Linux O2, 59,6 MiB, e Windows
O0, 47,2 MiB. Os hashes dos executáveis correspondem aos recibos; ambos contêm
os nove WAVs, Bravura, DejaVu e licenças. O tar preserva a permissão de execução
Linux, e a integridade de todas as entradas do ZIP foi verificada.
Os diretórios de build e os logs são locais e ignorados pelo Git.

O workflow `.github/workflows/core.yml` foi ampliado com testes do jogo, desktop
e publicação dos pacotes como artifacts nas duas plataformas. Não houve execução
remota desse workflow nesta entrega. Os testes locais de áudio confirmam o
processamento e a abertura do dispositivo; a latência até o ouvido continua sendo
uma estimativa sujeita à calibração, conforme o contrato da Tom.
