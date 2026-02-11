# TomGPU Runtime (SDL2)

Runtime host mínimo para executar o `output.ll` compilado da Linguagem Tom e apresentar um buffer de pixels em janela real.

## Build do host (`tom_gpu_host.cpp`)

Foi adicionado um `Makefile` para centralizar build em Linux/Windows, incluindo SDL2, OpenGL do sistema e suporte opcional a GLAD.

### Linux (padrão: GLEW)

```bash
cd tom-lang/runtime
make host
```

### Linux usando GLAD (em vez de GLEW)

```bash
cd tom-lang/runtime
make host GL_LOADER=glad GLAD_SRC=third_party/glad/src/glad.c GLAD_INCLUDE=third_party/glad/include
```

> Ao usar `GL_LOADER=glad`, o build define `-DTOM_GPU_USE_GLAD` e compila o `glad.c` indicado em `GLAD_SRC`.

### Windows (MinGW/clang ou g++)

```bash
cd tom-lang/runtime
make host OS=Windows_NT SDL_LIBS="-lmingw32 -lSDL2main -lSDL2" GL_LOADER=glew
```

No Windows, o `Makefile` faz link com `opengl32` automaticamente (`-lopengl32`).

## Geração da biblioteca dinâmica carregada pelo jogo

### Linux (`.so`)

```bash
cd tom-lang/runtime
make module
```

Isso gera `tom-lang/exemplos/output.so`.

### Windows (`.dll`)

```bash
cd tom-lang/runtime
make module OS=Windows_NT
```

Isso gera `tom-lang/exemplos/output.dll`.

## Pipeline completo

1. Compilar `.tom` para LLVM IR:
```bash
node ../tomc.js ../exemplos/gpu_blit.tom
```
2. Transformar `output.ll` em módulo compartilhado:
```bash
make module
```
3. Executar host SDL2:
```bash
./tom_gpu_host ../exemplos/output.so ../exemplos/output.gpu.json
```

> `-rdynamic` é obrigatório para que o símbolo `TomGpu_Present` definido no host possa ser resolvido pelo módulo carregado via `dlopen`.


## Base para backend GPU real (GLSL/SPIR-V)

Além do `output.ll`, o compilador agora gera `output.gpu.json` quando encontra comandos `Gpu*` no `.tom`.

Esse manifesto descreve:
- buffers, uploads/downloads e dispatches;
- lista de operações por kernel;
- `backends.glsl_compute.source` com GLSL computável inicial;
- bloco `backends.spirv` preparado para a próxima etapa de compilação para SPIR-V.

Uso rápido:

```bash
node ../tomc.js ../exemplos/gpu_blit.tom
cat ../exemplos/output.gpu.json
```

Esse arquivo é a ponte para um runtime futuro que fará compilação e execução real na GPU (Vulkan/OpenGL/WebGPU), sem depender do raster sequencial em CPU.
