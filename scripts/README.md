# Ferramentas locais Tom 0.4

Execute na raiz do repositório. Os instaladores mantêm ferramentas, downloads e
bibliotecas em `.tools/`, ignorada pelo Git. Não alteram PATH global, registro,
serviços ou instalações existentes. `env.sh`/`env.ps1` afetam somente o terminal.

## Windows x64

PowerShell x64 do Windows 10/11, com `curl.exe` e `tar.exe` do sistema:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-windows.ps1
. ./scripts/env.ps1
npm.cmd ci --prefix tom-lang --ignore-scripts
npm.cmd --prefix tom-lang test
node tom-lang/tomc.js --run tom-lang/exemplos/calculadora.tom
```

Se necessário, abra uma sessão `powershell -NoProfile -ExecutionPolicy Bypass`
antes de carregar `env.ps1`; a mudança de política vale só para esse processo.
O instalador usa Node 24.21.0, LLVM-MinGW 20251216 com LLVM 21.1.8 e UCRT, o arquivo
completo LLVM 21.1.8 para obter `opt.exe`, CMake 4.2.3 e Ninja 1.13.2.
Não exige Visual Studio nem Windows SDK adicional. O alvo nativo é MinGW:
bibliotecas MSVC não podem ser misturadas com as DLLs/import libraries distribuídas.
`env.ps1` também completa PATHEXT se faltarem extensões como `.EXE`/`.CMD`, para
que `node` e os scripts npm funcionem em sessões iniciadas via WSL. Isso altera
somente o ambiente do terminal, sem modificar configurações persistentes.

## Linux / WSL x64

```bash
bash scripts/setup-linux.sh
source scripts/env.sh
npm ci --prefix tom-lang --ignore-scripts
npm --prefix tom-lang test
node tom-lang/tomc.js --run tom-lang/exemplos/calculadora.tom
```

Pré-requisitos: Ubuntu/Debian x64, `python3`, `curl`, `ca-certificates`, `xz-utils`,
`tar`, APT, `dpkg-deb`, `build-essential`, as bibliotecas dinâmicas exigidas pelo
LLVM e índices APT com LLVM **21.1.8**. O instalador foi exercitado em Ubuntu 26.04.
Em Ubuntu 24.04, configure o [repositório LLVM oficial](https://apt.llvm.org/) para
LLVM 21; a CI registra esse procedimento. A versão encontrada é verificada; o
instalador falha se os índices oferecerem uma versão diferente.

Os pacotes são **baixados e extraídos**, sem `sudo` nem registro pelo dpkg. LLVM,
headers X11, pkg-config e dependências FreeType devem corresponder à distribuição.
As versões/hashes efetivos ficam em `.tools/linux/llvm/.tom-packages` e
`.tools/linux/build-tools/root/.complete`. Esses pacotes de sistema variam por
ABI; os arquivos Node/CMake/Ninja/SDL/SDL_ttf/libmpdec têm versões e hashes fixados
no manifesto versionado. Não copie `.tools/linux` entre distribuições diferentes.

O setup nativo pode ser executado isoladamente depois de disponibilizar Node,
Clang 21 e opt 21: `node scripts/setup-native.js`. Variáveis `CLANG` e `LLVM_OPT`
selecionam ferramentas externas; caso contrário, os caminhos locais são usados.
O instalador gráfico usa CMake 4.2.3 e Ninja 1.13.2, também locais.

Para uma janela real, é preciso `DISPLAY` e um servidor X11/XWayland. No WSL, use
WSL2 com WSLg; abrir o programa no WSL gera uma janela Linux. Para obter um `.exe`,
execute o instalador/build pelo Node **Windows**, em PowerShell. Os dois ambientes
usam pastas separadas e podem coexistir no mesmo checkout.

## Dependências nativas fixadas

[`toolchain.json`](toolchain.json) fixa URLs e SHA256 de:

- Node 24.21.0 e LLVM Windows 21.1.8;
- CMake 4.2.3 e Ninja 1.13.2;
- SDL3 3.4.16 e SDL_ttf 3.2.2;
- libmpdec 4.0.1, compilada localmente em C portátil para cada ABI.
- yyjson 0.12.0, biblioteca C estática com licença MIT;
- Bravura 1.482 e sua licença, versionadas em `tom-lang/runtime/stable/assets/tom/`.

SDL Linux usa X11 e renderização por software. A construção SDL_ttf usa FreeType
da distribuição, sem HarfBuzz/PlutoSVG; o pacote Windows oficial inclui seu suporte
a fontes. Ambos usam a mesma DejaVu Sans versionada, com licença. Bibliotecas Tom
`tom_text`, `tom_decimal`, `tom_ui`, `tom_platform`, `tom_math`, `tom_audio`, `tom_data` e `tom_json` são construídas via CMake. A CLI também compila
os fontes do runtime necessários a cada programa, mantendo o alvo coerente.

A configuração SDL Linux habilita `SDL_AUDIO`, ALSA e PulseAudio. O instalador
baixa headers, clientes libasound/libpulse e dependências de libsndfile/codec
exigidas pela distribuição; copia as bibliotecas para `native/lib`, ajusta RPATH
local com patchelf e inclui configuração ALSA e licenças. Os pacotes de sistema
têm versões e hashes efetivos registrados em `build-tools/root/.complete`;
não são substitutos portáveis da glibc. Para atualizar uma instalação 0.2, execute
novamente `node scripts/setup-native.js`. No WSLg, preserve o `PULSE_SERVER` da
sessão. Windows usa WASAPI, disponibilizado pelo SDL oficial fixado no manifesto.

Reserve cerca de 10 GB; o arquivo completo do LLVM responde pela maior parte.
Downloads são validados por SHA256; uma falha interrompe o setup. Remova somente
o arquivo corrompido apontado antes de repetir. Instalações são reaproveitadas;
o runtime é reconstruído quando o instalador é executado novamente.

## Build, distribuição e testes

```text
node tom-lang/tomc.js --build tom-lang/exemplos/calculadora.tom
node scripts/verify-desktop.js
node scripts/verify-desktop.js --package
```

O build verifica o LLVM, faz o link numa pasta temporária, inclui fonte, DLLs/SOs
e licenças e só então publica `build/<plataforma-arquitetura-abi>/calculadora/`. Uma falha preserva o último
build válido. `--run` compila e executa; sem essas opções a CLI gera somente LLVM.
O destinatário recebe a pasta completa e não precisa de Node/LLVM. Linux exige
uma glibc compatível com a máquina de build e as bibliotecas básicas do desktop
X11. Para um alvo Linux mais antigo, construa nesse alvo (a CI usa Ubuntu 24.04).

`npm --prefix tom-lang test` inclui testes SDL com driver dummy/software, sem
exigir um desktop. `verify-desktop.js` exige janela real, direciona entradas ao
processo criado, valida visor/erros/fechamento e salva capturas em
`.tools/<plataforma>/validation/`. [Resultados da validação local](../tom-lang/docs/validation-0.2.md).

Para validar a 0.3:

```text
node scripts/verify-multimedia.js
node scripts/verify-multimedia.js --desktop
node scripts/verify-multimedia.js --package
node scripts/verify-audio-device.js
```

O primeiro comando usa áudio/vídeo dummy e software em O0/O2, apropriado à CI.
Os seguintes exigem sessão gráfica e dispositivo de áudio reais e reproduzem
sons curtos. `--package` abre executáveis de produção sem variáveis de injeção,
sem LLVM/Node no PATH e sem LD_LIBRARY_PATH. Evidências ficam em
`.tools/<plataforma>/validation-03/`. Execute testes reais sequencialmente para
não disputar foco. WASAPI/PulseAudio reais não são requisitos da CI headless;
seus resultados locais ficam separados dos testes de amostras em memória.

`--assets` empacota arquivos próprios, como o WAV gerado por
`generate-demo-audio.js`. O [guia das demonstrações](../tom-lang/exemplos/multimedia/README.md)
mostra os comandos de abertura. [Resultados 0.3](../tom-lang/docs/validation-0.3.md).

Carregue o arquivo de ambiente a cada novo terminal. Os temporários ficam em
`.tools/<plataforma>/tmp`. Para remover a instalação, feche processos relacionados
e apague `.tools/`; o cache `.tools/downloads/` pode ser removido separadamente.

## Validação da 0.4

Depois de atualizar as dependências com `node scripts/setup-native.js`:

```text
node scripts/verify-state.js
node scripts/verify-state.js --desktop
node scripts/verify-state.js --package
```

O primeiro verifica quatro demonstrações em O0/O2 com dispositivos simulados.
Os demais abrem interface e laboratório, enviam entrada nativa e validam o pacote
sem ferramentas de desenvolvimento no PATH. Execute os testes de desktop de cada
sistema separadamente para não disputar foco. No Linux, o driver dirigido à janela
usa eventos X11 core (`SDL_VIDEO_X11_XINPUT2=0` somente no processo de teste).
No Windows, envia movimento antes do clique, como exige o caminho de eventos SDL.
Capturas, traces, arquivos de teste e recibos ficam em
`.tools/<plataforma>/validation-04/`. Os testes de desenvolvimento isolam as
preferências nessa pasta; o executável de produção usa o diretório SDL normal.
Veja [contrato](../tom-lang/docs/state-0.4.md),
[demonstrações](../tom-lang/exemplos/estado/README.md) e
[resultados](../tom-lang/docs/validation-0.4.md).
