# Demonstrações Tom 0.4

Execute na raiz, depois de `source scripts/env.sh` no Linux/WSLg ou
`. ./scripts/env.ps1` no PowerShell Windows. Atualize as bibliotecas nativas com
`node scripts/setup-native.js` para instalar yyjson 0.12.0.

```text
node tom-lang/tomc.js --run tom-lang/exemplos/estado/estado.tom
node tom-lang/tomc.js --run tom-lang/exemplos/estado/entrada-dados.tom
node tom-lang/tomc.js --run tom-lang/exemplos/estado/interface.tom
node tom-lang/tomc.js --run --assets tom-lang/exemplos/multimedia/assets tom-lang/exemplos/estado/laboratorio.tom
```

| Fonte | O que demonstra |
|---|---|
| `estado.tom` | Enumeração, estado compartilhado por `RefRegistro`, campos e `Para`; imprime `Contador: 5`. |
| `entrada-dados.tom` | Cria JSON UTF-8, salva/restaura um vínculo de entrada e o atualiza em Tom. |
| `interface.tom` | Botão que atualiza texto preparado, seletor, controle deslizante, foco, teclado e arraste. |
| `laboratorio.tom` | Pauta animada, monitor de ações, tons e WAV, configurações, calibração e replay. |
| `laboratorio-core.tom` | Biblioteca local do modelo, atualização e configuração, compartilhada pela janela e pelos testes. |

## Usar o laboratório

A janela tem 960 × 720 unidades lógicas e pode ser redimensionada. Tab/ShiftTab
percorrem controles; Enter/Espaço ativam, setas ajustam o volume. O arraste do
controle deslizante termina na soltura ou perda de foco. A–G acionam as sete notas;
W/R são ações adicionais monitoradas. Não há acerto/erro, pontuação nem regras de jogo.

1. **Nova gravação** inicia uma sessão limpa e conserva uma cópia da configuração.
2. **Iniciar / pausar** alterna o relógio dedicado. São preparados 32 pulsos e um
   acompanhamento WAV em repetição; há quatro batidas preparatórias por padrão.
3. Toque teclas, ajuste volume ou compensações. **Remapear primeira ação** aguarda
   uma tecla e encerra os estados antigos; Escape cancela esse remapeamento.
4. **Marcar batida** estima a diferença para o pulso mais próximo. A média inclui
   sua resposta humana. Entrada, áudio e apresentação possuem ajustes separados
   de 5 ms; **Zerar ajustes** limpa as compensações e a média.
5. **Salvar configuração** grava `configuracao.json`, lida na próxima abertura.
6. **Salvar gravação** encerra a captura e escreve `sessao.json`.
7. **Reproduzir** valida todo o arquivo e envia eventos/relógios originais para a
   mesma `LaboratorioAtualizar`. Ao terminar, volta ao áudio real pausado. Feche
   pelo botão da janela a qualquer momento.

Os dados ficam no diretório de preferências SDL de `Tom/Laboratorio04`, normalmente
`~/.local/share/Tom/Laboratorio04` no Linux e `%APPDATA%\Tom\Laboratorio04` no
Windows. Falhas aparecem na linha de mensagem e a janela permanece aberta.
A gravação comporta 1024 entradas; o histórico de sessão e os catálogos também
possuem limites explícitos no fonte. Esgotamento é erro recuperável.

O contador **Ações** é um monitor de ativações, não pontuação. Os tons produzidos
pelo modelo são descritos em SOA; somente o adaptador da janela chama o áudio.
A posição visual é calculada pelo relógio e nunca altera o modelo. `@ULTIMO` é
copiado imediatamente para variáveis quando o valor precisará atravessar blocos.

## Distribuir e verificar

Troque `--run` por `--build` e copie a pasta completa
`tom-lang/exemplos/estado/build/<plataforma-arquitetura-abi>/laboratorio/`.
Ela inclui executável, fontes DejaVu/Bravura, WAV, bibliotecas e licenças. O usuário
final não precisa de Node/LLVM. Faça o build em cada plataforma de destino.

```text
node scripts/verify-state.js
node scripts/verify-state.js --desktop
node scripts/verify-state.js --package
```

O [contrato](../../docs/state-0.4.md) documenta APIs e limites.
Os [testes de replay](../../tests/replay-04.test.js) exercitam o mesmo modelo a
30/60/144 FPS e com atraso de desenho. O áudio em memória tem testes separados de
agendamento por amostra; a chegada ao ouvido continua uma estimativa calibrável.
