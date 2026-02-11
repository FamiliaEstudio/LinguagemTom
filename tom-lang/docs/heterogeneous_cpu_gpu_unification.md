# Computação Heterogênea no Tom: unificação CPU/GPU em `tomc.js`

## Objetivo
Permitir que uma função única (ex.: `DefFuncaoxCalcularFisicax...`) seja compilada para:

- **LLVM IR** (execução CPU, single-thread inicial, com evolução para paralelismo depois);
- **SPIR-V/GLSL** (execução GPU via `GpuDisp`).

A proposta segue um modelo próximo ao Mojo: o programador escreve uma função só, e o backend escolhe CPU/GPU de acordo com tipo de dado, anotações e regras de segurança.

---

## 1) Arquitetura de compilação proposta para o `tomc.js`

## 1.1 Front-end único + IR intermediária única
Adicionar no `tomc.js` uma **HIR/TIR unificada** para funções “baixáveis” para GPU.

Pipeline sugerido:

1. **Parse Tom atual**
2. **Lowering para TIR (Tom Intermediate Representation)**
3. **Análise de capacidade de offload (GPUEligibilityPass)**
4. **Divergência de backends**:
   - TIR -> LLVM IR (CPU)
   - TIR -> SPIR-V (ou TIR -> GLSL -> SPIR-V)

Isso evita manter duas semânticas diferentes (uma para `DefKernel`, outra para função comum).

## 1.2 Novos conceitos de linguagem (mínimo viável)
- `DefFuncao...FimFuncao`: função regular (já existente/expandida).
- Anotação opcional de alvo:
  - `@cpu` (força CPU)
  - `@gpu` (exige GPU; erro se não elegível)
  - `@auto` (default; compilador decide)
- Tipos de dados com “shape” explícito:
  - escalar: `In32`, `Fl32`, ...
  - buffer/vetor: `Buffer<Fl32>`, `Buffer<StructSOA<...>>`

## 1.3 Estrutura interna sugerida em `tomc.js`
Criar módulos/passes (mesmo no arquivo único inicialmente):

- `buildTypedAst()`
- `lowerToTir()`
- `runGpuEligibilityPass(func)`
- `emitLlvmFromTir(func)`
- `emitSpirvFromTir(func)` (ou `emitGlslFromTir` + `glslangValidator`)
- `emitHostStub(func)` para gerar chamada de runtime (`tom_gpu_host.cpp`) e fallback CPU.

---

## 2) Modelo de execução unificado

## 2.1 Mesmo símbolo, múltiplas variantes
Para cada `DefFuncao` elegível, gerar:

- Variante CPU: `@calcular_fisica_cpu`
- Variante GPU kernel: `@calcular_fisica_gpu`
- Stub host: `@calcular_fisica_dispatch`

`dispatch` decide em tempo de compilação (preferencial) ou runtime (fallback):

- Se `@gpu`: usa GPU, erro se indisponível.
- Se `@cpu`: usa CPU.
- Se `@auto`: usa heurística (tamanho de dados + custo estimado + disponibilidade GPU).

## 2.2 Compatibilidade com comandos atuais
- `DefKernel` continua existindo (legado).
- Internamente, `DefKernel` pode ser convertido para a mesma TIR de função GPU.
- `GpuDisp` passa a aceitar função comum elegível, não apenas kernel explícito.

---

## 3) Restrições para função elegível a GPU

Para que **a mesma função** possa gerar código para GPU, restrições (MVP):

1. **Sem I/O**: sem `printf`, leitura de teclado, arquivo, rede.
2. **Sem alocação dinâmica**: sem `malloc/new` implícito; apenas buffers já fornecidos.
3. **Sem ponteiros arbitrários**: apenas acessos indexados em buffers conhecidos.
4. **Sem chamadas externas não anotadas**: só chamar funções também elegíveis (`@gpu` ou `@auto` aprovadas).
5. **Sem estado global mutável compartilhado** (exceto buffers de saída declarados).
6. **Controle de fluxo restrito**:
   - loops com limite determinável ou com guarda de segurança;
   - sem recursão (MVP).
7. **Tipos suportados**:
   - escalares numéricos (`In32`, `Fl32`, etc.);
   - vetores/matrizes simples;
   - structs POD/SOA sem campos dinâmicos.
8. **Sem exceções** ou erro por side-channel; usar códigos de status.
9. **Operações determinísticas por elemento** (ideal para map/reduce local).
10. **Sem dependência de ordem global** entre threads, salvo primitivas explícitas (fase posterior).

---

## 4) Como o compilador identifica se pode “baixar” para GPU

## 4.1 `GPUEligibilityPass` (estático)
Para cada função:

- constrói grafo de chamada;
- verifica instruções proibidas;
- valida tipos e assinaturas;
- classifica memória (`read-only`, `write-only`, `read-write`);
- detecta padrão de paralelismo (map, stencil, redução simples).

Saída da análise:

```txt
eligible: true|false
reasons: [..]
parallelShape: elementwise|reduction|unknown
estimatedCost: N
```

Se `@gpu` e `eligible=false`: erro de compilação com diagnósticos.
Se `@auto` e `eligible=false`: compila só CPU + warning opcional.

## 4.2 Heurística de decisão (`@auto`)
Mesmo elegível, GPU só é usada quando compensa:

- tamanho de buffer acima de limiar (`N >= threshold`);
- custo aritmético por elemento alto o suficiente;
- overhead de upload/download amortizado;
- GPU/runtime disponível.

Função de custo simples inicial:

```txt
score_gpu = ops_per_element * N - (upload_cost + dispatch_cost + download_cost)
```

Se `score_gpu > score_cpu`: usa GPU; caso contrário CPU.

---

## 5) Design de assinatura recomendado para função unificada

Exemplo conceitual:

```tom
@auto
DefFuncaoxCalcularFisicax(
  dt: Fl32,
  pos: Buffer<Fl32>,
  vel: Buffer<Fl32>,
  acc: Buffer<Fl32>,
  n: In32
)
  Para i de 0 ate n
    vel[i] = vel[i] + acc[i] * dt
    pos[i] = pos[i] + vel[i] * dt
  FimPara
FimFuncao
```

- CPU backend: loop clássico.
- GPU backend: `global_id = i` e atualização element-wise.

---

## 6) Integração com runtime atual

No runtime (`tom_gpu_host.cpp`), adicionar API de despacho unificado:

- `tom_dispatch_auto(func_id, buffers..., n)`
- cache de pipeline SPIR-V por hash da função TIR;
- fallback automático para CPU se criação de pipeline falhar.

No `tomc.js`, gerar manifesto estendido:

- função origem;
- variantes geradas (cpu/gpu);
- requisitos de binding;
- metadados de custo para decisão `@auto`.

---

## 7) Roadmap incremental de implementação

1. **Fase 1 (MVP)**
   - TIR unificada;
   - `GPUEligibilityPass`;
   - geração CPU e GLSL compute para padrão element-wise;
   - `@auto/@cpu/@gpu`.

2. **Fase 2**
   - redução simples;
   - melhor inferência de layout SOA;
   - cache persistente de kernels.

3. **Fase 3**
   - subgrupos, memória compartilhada, otimizações avançadas;
   - autotuning de heurística.

---

## 8) Diagnósticos que melhoram experiência de uso

Quando não elegível, emitir mensagens acionáveis, por exemplo:

- “Função `CalcularFisica`: chamada de `LerEntrada...` impede backend GPU (I/O não suportado).”
- “Loop `Para`: limite não determinável em compilação para modo GPU MVP.”
- “Tipo `Texto` em parâmetro 2 não suportado para offload.”

Isso aproxima a ergonomia de “mesmo código, múltiplos alvos” sem sacrificar previsibilidade.
