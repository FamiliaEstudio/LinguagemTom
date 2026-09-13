# Validação local Tom 0.3

Verificação em 12/09/2026 no mesmo checkout, com ferramentas nativas de cada
plataforma. Não representa uma execução remota do GitHub Actions.

| Ambiente | Configuração |
|---|---|
| Linux x64 / WSLg | Node 24.21.0, LLVM 21.1.8, ABI GNU; X11/XWayland e renderizador software |
| Windows x64 | Node 24.21.0, LLVM-MinGW 21.1.8/UCRT e opt 21.1.8; janelas Win32 |
| Dependências | SDL3 3.4.16, SDL_ttf 3.2.2, libmpdec 4.0.1, Bravura 1.482 |
| Áudio real | PulseAudio no WSLg; WASAPI no Windows; mixer interno 48 kHz estéreo |

## Resultados

| Verificação | Linux | Windows |
|---|---|---|
| Suíte de regressão | 110 aprovados, zero ignorados | 110 aprovados, zero ignorados |
| LLVM e execução dos novos recursos | O0/O2 aprovados | O0/O2 aprovados |
| Quatro demonstrações com eventos e dispositivos simulados | 8 execuções O0/O2 aprovadas | 8 execuções O0/O2 aprovadas |
| Janelas reais: animação, teclado, catálogo e áudio | 4 aprovadas | 4 aprovadas |
| Pacotes de produção com ambiente de desenvolvimento removido | 4 aprovados | 4 aprovados |
| Reprodução real de WAV e tom, seguida de limpeza | PulseAudio aprovado | WASAPI aprovado |
| Reconstrução dos instaladores/bibliotecas locais | Aprovada | Aprovada |
| Equivalência da calculadora Tom/C, O0/O2 | 38 cenários, 142 eventos e 135 quadros aprovados | 38 cenários, 142 eventos e 135 quadros aprovados |

A suíte preserva os casos anteriores e inclui classificação dos novos exemplos,
importações, constantes, SOA com Bl e empréstimos, conversões, potência, PCG,
foco/teclas simultâneas, métricas de glifos, limites e limpeza de recursos.
Editor e CLI resolvem arquivos importados com posição correta, incluindo fontes
não salvos. O teste Windows identificou duplicação de diagnóstico por separadores
de caminho; a normalização foi corrigida e a suíte repetida com sucesso.
Os quatro testes da infraestrutura de benchmark também passaram nos dois sistemas.
O pacote VSIX foi conferido contra os fontes e seu compilador conseguiu resolver
`tom/musica` usando os módulos contidos no próprio pacote extraído.

O mixer é testado em memória com os mesmos fontes do callback. Os testes
verificam início na amostra prevista, frequência, duração, volume, mistura,
repetição, pausa, cancelamento, capacidade, agendamento atrasado, correlação de
relógio e compensação. Comparam os mesmos sons renderizados com blocos de tamanhos
diferentes, incluem tons simultâneos sobre WAV e uma sessão simulada de dez
minutos sem deslocar o início agendado. Arquivos ausentes/corrompidos, PCM não
finito, limite de memória e dispositivo indisponível produzem erros recuperáveis.

Os harnesses exigem zero recursos Tom vivos ao finalizar. Visuais são redesenhados
repetidamente sem criar novos objetos. Há verificações de fechamento de dono antes
da dependência na ABI C, cancelamento de Som e continuidade do áudio ao fechar
a última janela. Testes gerais de Defer continuam cobrindo retorno, laços,
propagação e preservação do primeiro erro durante limpeza.

Os testes de desktop direcionam eventos apenas às janelas criadas pelo processo:
teclado, redimensionamento, perda/recuperação de foco e fechamento. Capturas do
catálogo e do áudio foram inspecionadas para conferir glifos, pauta, textos e
escala. Pacotes de produção usam o mesmo fonte Tom nas duas plataformas, sem
instrumentação de injeção e sem Node/LLVM no PATH do programa.

## Reproduzir

Ative `scripts/env.sh` no Linux ou `scripts/env.ps1` no Windows, na raiz do
repositório. Instale as dependências conforme [scripts/README.md](../../scripts/README.md).

```text
node --test --test-concurrency=4 tom-lang/tests/*.test.js
node scripts/verify-multimedia.js
node scripts/verify-multimedia.js --desktop
node scripts/verify-multimedia.js --package
node scripts/verify-audio-device.js
npm --prefix tom-lang run benchmark:verify
npm --prefix tom-lang run package:extension
```

`npm --prefix tom-lang test` também executa toda a suíte, usando a concorrência
padrão do Node. As duas primeiras verificações não exigem tela/dispositivo reais.
Execute os testes reais sequencialmente em sessão gráfica; eles reproduzem sons.
Windows e WSL devem usar seu próprio Node, LLVM e dependências, sem misturar ABIs.

Relatórios, capturas e pacotes ficam em `.tools/<plataforma>/validation-03/`:
`verification.json`, `desktop.json`, `packages.json`, arquivos `.bmp`/`.trace` e
`device/result.txt`. Logs desta execução usam o prefixo `tom03-` em cada plataforma.
Esses artefatos locais são ignorados pelo Git. A extensão é empacotada em
`tom-lang/build/tom-lang-0.3.0.vsix`, incluindo os módulos padrão para diagnósticos.

## Limites da evidência

A precisão por amostra foi medida na saída do mixer. Não foi medida a latência
acústica até o ouvido, nem feita calibração com microfone. A correlação temporal
do dispositivo permanece uma estimativa com compensação configurável. PulseAudio
e WASAPI foram abertos de fato; ALSA está habilitado/distribuído, mas não houve
teste com uma placa ALSA física separada no WSLg.

São testes de regressão e demonstrações; não constituem garantia de tempo real
duro, ausência de qualquer falha possível de hardware ou suporte a todo desktop
Linux. Os pacotes Linux exigem glibc e bibliotecas básicas do desktop compatíveis
com o sistema em que foram construídos. A CI está configurada para Ubuntu 24.04
e Windows 2022; seu resultado remoto deve ser consultado no GitHub Actions.

O jogo, sua pontuação e regras de aprendizagem não integram esta entrega.
