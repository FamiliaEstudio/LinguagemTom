# Runtimes Tom

A versão 0.2 usa o [runtime estável SDL3](stable/README.md) para aplicativos 2D.
Ele é independente do host GPU descrito abaixo.

# Host gráfico experimental

Este runtime não integra o núcleo estável. O compilador atual rejeita comandos GPU
até que seu caminho de execução esteja completo. Para programas CPU/texto, siga o
[README principal](../../README.md); SDL não é necessário.

## Limitações conhecidas

O host preserva código de pesquisa que força `VideoBuf` e resolução 320×200,
faz chamadas OpenGL fora da thread que possui o contexto e descarrega o módulo sem
aguardar a thread Tom. Os comandos GPU do compilador legado nem sempre emitem chamadas
efetivas ao host. A biblioteca local `stb_image.h` é um adaptador de BMP, não oferece
suporte a PNG/JPEG. A medição de budget mistura contadores com frequências diferentes.

Essas limitações impedem tratar o host como implementação correta da linguagem.
A consolidação 0.1 isola essa camada e não declara seus exemplos gráficos funcionais.

## Dependências e build de pesquisa

Linux: compilador C++17, Make, pkg-config, SDL2, GLEW, OpenGL e nlohmann/json.
Em Debian/Ubuntu, as dependências de desenvolvimento são `build-essential pkg-config
libsdl2-dev libglew-dev libgl-dev nlohmann-json3-dev`.
Windows: use um ambiente MSYS2/MinGW coerente, com as versões correspondentes dessas
bibliotecas; não misture objetos MSVC e MinGW.

```sh
cd tom-lang/runtime
make host
make print-config
```

O loader padrão é GLEW. GLAD exige arquivos fornecidos pelo desenvolvedor:

```sh
make host GL_LOADER=glad GLAD_SRC=third_party/glad/src/glad.c GLAD_INCLUDE=third_party/glad/include
```

O alvo `module` recebe explicitamente um LLVM de pesquisa, sem selecionar um
`output.ll` obsoleto por padrão:

```sh
make module MODULE_INPUT=../experimental/artifacts/generated/exemplos/output.ll MODULE_OUT=build/legacy.so
```

No Windows use `OS=Windows_NT`, `MODULE_OUT=build/legacy.dll` e o Clang do
mesmo ambiente MinGW. O host gera uma biblioteca de importação em `build/libtomhost.a`;
ela é usada pelo alvo `module` no Windows.

Artefatos atuais ficam em `runtime/build/`. O caminho do módulo e do manifesto
deve ser passado explicitamente ao host; compilar esses arquivos não comprova a
correção do programa gráfico.
