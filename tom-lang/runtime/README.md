# TomGPU Runtime (SDL2)

Runtime host mínimo para executar o `output.ll` compilado da Linguagem Tom e apresentar um buffer de pixels em janela real.

## Build do host

```bash
g++ -std=c++17 tom_gpu_host.cpp -o tom_gpu_host -lSDL2 -lGLEW -lGL -ldl -rdynamic
```

## Pipeline completo

1. Compilar `.tom` para LLVM IR:
```bash
node ../tomc.js ../exemplos/gpu_blit.tom
```
2. Transformar `output.ll` em módulo compartilhado:
```bash
clang -shared -fPIC ../exemplos/output.ll -o ../exemplos/output.so
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
