# Validação local da Tom 0.4.0

Execução em 12/09/2026, no mesmo checkout usado no Windows x64 e no Linux x64/WSLg.
Node 24.21.0, LLVM 21.1.8, CMake 4.2.3, Ninja 1.13.2, SDL3 3.4.16, SDL_ttf 3.2.2,
libmpdec 4.0.1 e yyjson 0.12.0. Windows usa LLVM-MinGW/UCRT; Linux usa glibc,
X11/XWayland e PulseAudio do WSLg. As dependências e os oito runtimes estáticos
foram reconstruídos/instalados pelo fluxo local em ambas as ABIs.

## Resultados

| Verificação | Linux | Windows |
|---|---|---|
| Suíte completa, incluindo os 110 testes anteriores | 146 passaram, zero ignorados | 146 passaram, zero ignorados |
| Quatro demonstrações 0.4, LLVM e execução O0/O2 | 8 execuções passaram | 8 execuções passaram |
| Interface e laboratório em janelas reais, O2 | 2 passaram | 2 passaram |
| Pacotes de produção sem Node/LLVM no PATH | Interface e laboratório passaram | Interface e laboratório passaram |
| Equivalência calculadora Tom/C, O0 e O2 | 38 cenários, 142 eventos, 135 quadros em cada otimização | Mesmos resultados |
| Testes do executor de benchmark | 4 passaram | 4 passaram |
| Pacote VSIX 0.4.0 | Gerado; compilador e módulos extraídos verificados | Mesmo pacote instalável |

A CI foi ampliada para incluir as demonstrações 0.4 e produzir pacotes. Esta tabela
registra execuções **locais**, não uma execução remota do GitHub Actions.

## O que foi exercitado

- Registros aninhados, enumerações nominais, cópias `Dc34`, empréstimos e retorno
  preservado antes de `Defer`. Uma falha de memória provocada na segunda cópia
  decimal comprova preservação integral do destino e liberação do resultado parcial.
- Iteração, índice somente leitura, reinicialização, retorno e propagação de erro,
  limites signed64 e incremento terminal128. LLVM verificado antes de executar.
- JSON inteiro acima de 2^53, limites signed/unsigned64, decimal, Unicode, `%`,
  JSON Pointer, chaves duplicadas, documentos incompletos, NUL, capacidade e
  repetidas substituições. Leitura/escrita inválida preservam os destinos.
- Combinações, alternativas, repetição sem nova ativação, pressionar/soltar rápido,
  perda de foco, remapeamento, foco da UI, seletor, deslizante e soltura fora da área.
- Catálogos com proprietário errado, ID expirado, substituição, capacidade e
  cancelamento de vozes/comandos WAV. A soltura SDL sem `windowID` também encerra
  o estado mantido da janela de origem.
- Relógio coerente de áudio, pausas, eventos atrasados, calibração, configuração
  versionada e prazos racionais desde uma origem comum.
- Reprodução da mesma `LaboratorioAtualizar` usada pela janela, a 30, 60 e 144 FPS,
  incluindo 900 ms de atraso de desenho. Estados, frequências, comandos e posições
  em instantes comuns permanecem iguais. Empates de horário conservam a ordem.
  Relógios maiores que 2^53 e sementes unsigned64 sobrevivem ao JSON sem perda.
- O mixer em memória mantém seus testes 0.3 de frequência, simultaneidade,
  agendamento exato, tamanhos de bloco, pausas e sessões longas; os catálogos 0.4
  acrescentam remoção de WAV ativo e agendado.

As demonstrações instrumentadas verificam **zero objetos Tom vivos ao encerrar**
e um pico limitado a 256 objetos. Testes específicos repetem cópias, substituições
e ciclos de catálogo com limites menores. Essa contagem é uma verificação de
propriedade/limpeza dos objetos administrados pelo runtime, não uma medição de
RSS do processo nem uma auditoria de toda alocação interna do driver SDL.

No laboratório real, os scripts exercitam início/pausa, A/C/E, ajustes de entrada,
volume, remapeamento para Z, salvamento de configuração e gravação, reprodução,
redimensionamento e fechamento. Um segundo processo lê a configuração salva.
O pacote de produção é aberto sem os mecanismos de injeção compilados nos testes.

O driver X11 dirigido à janela desativa XI2 **somente no processo de teste**, pois
`XSendEvent` usa eventos core. No Windows, cada gesto é enfileirado em um bloco
nativo para evitar que a reconciliação com o mouse físico antecipe a soltura.
O teste Windows também evita tomar o foco do usuário. Testes determinísticos de
ponteiro injetam eventos no SDL e cobrem separadamente os estados lógicos.

A imagem visível e a saída de áudio foram exercitadas nas sessões reais; a precisão
sonora continua sendo comprovada nas amostras do mixer. Não se infere latência
física do dispositivo nem qualidade de calibração humana a partir desses testes.

## Reproduzir

Na raiz, ative `scripts/env.sh` ou `scripts/env.ps1` conforme a plataforma:

```text
node scripts/setup-native.js
npm --prefix tom-lang test
node --test benchmarks/calculator/runner.test.js
node benchmarks/calculator/run.js --verify
node scripts/verify-state.js
node scripts/verify-state.js --desktop
node scripts/verify-state.js --package
npm --prefix tom-lang run package:extension
```

Execute testes de desktop sequencialmente. Os testes headless usam drivers SDL
dummy/software. Na CI de desktop sem áudio físico, `TOM_VERIFY_AUDIO_DRIVER=dummy`
seleciona explicitamente o dispositivo simulado; isso não conta como áudio real.

Os recibos estão em `.tools/<plataforma>/validation-04/verification.json`,
`desktop.json` e `packages.json`. Logs locais: `tests-04-all.log` no Linux,
`tests-04-all-final.log` no Windows, `benchmark-04.log` e `verify-state-*.log`.
Capturas BMP, traces e arquivos JSON dos testes ficam na mesma pasta de validação.
Linux também tem as verificações posteriores `tests-04-runtime-final.log` e
`tests-04-cli-final.log` para as correções encontradas no desktop/publicação.

Os pacotes independentes usados na validação estão em
`.tools/<plataforma>/validation-04/packages/{interface,laboratorio}/`.
Copie a pasta completa, incluindo fontes, WAV, bibliotecas e licenças. O build normal
pela CLI usa `tom-lang/exemplos/estado/build/<plataforma-arquitetura-abi>/`.
`tom-build.json` identifica versão 0.4.0, alvo LLVM, otimização, runtimes e assets.
A extensão gerada fica em `tom-lang/build/tom-lang-0.4.0.vsix`.

Veja o [contrato da linguagem](state-0.4.md) e as
[instruções das demonstrações](../exemplos/estado/README.md). Outras arquiteturas,
outros ambientes gráficos e outros formatos de áudio não foram validados nesta entrega.
