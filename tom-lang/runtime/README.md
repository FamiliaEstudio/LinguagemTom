# TomGPU Runtime (SDL2)

Runtime host mínimo para executar o `output.ll` compilado da Linguagem Tom e apresentar um buffer de pixels em janela real.

## Build do host

```bash
g++ -std=c++17 tom_gpu_host.cpp -o tom_gpu_host -lSDL2 -ldl -rdynamic
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
./tom_gpu_host ../exemplos/output.so
```

> `-rdynamic` é obrigatório para que o símbolo `TomGpu_Present` definido no host possa ser resolvido pelo módulo carregado via `dlopen`.
