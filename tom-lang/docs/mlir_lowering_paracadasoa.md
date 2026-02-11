# Lowering de `ParaCadaSOA` para TomIR + MLIR (Affine)

## 1) Diagnóstico do `tomc.js` atual

Hoje o compilador ainda emite LLVM IR diretamente dentro de `emitDataOperation`, incluindo o caso `ParaCadaSOA...Somar...`.

- O parser detecta `ParaCadaSOA` via regex e valida instância/propriedade/tipo (`i32`).
- Depois gera duas regiões LLVM no mesmo passo:
  - loop vetorizado de 4 elementos (`<4 x i32>`),
  - loop de cauda escalar.
- Isso funciona, mas acopla parsing + semântica + geração de backend em uma etapa só.

## 2) Estrutura proposta (TomIR)

Foi adicionada uma AST tipada intermediária em `tom_ir.js` para representar operações antes da emissão textual:

- `TomIrModule`
- `TomIrFunction`
- `TomIrAffineFor`
- `TomIrSoaAddScalar`

Fluxo do nó principal para `ParaCadaSOA`:

1. `buildParaCadaSoaTomIr(...)` cria uma função com:
   - argumento `memref<?xi32>` para a propriedade SoA,
   - argumento `index` para tamanho (`%n`),
   - `affine.for %i = 0 to %n step 1`.
2. O corpo do loop usa:
   - `affine.load`,
   - `arith.addi`,
   - `affine.store`.
3. `renderTomIrModuleAsMlir(...)` serializa para `.mlir`.

## 3) Exemplo de saída `.mlir`

Para `ParaCadaSOAxgrupoxSomarhp2`:

```mlir
module {
  func.func @paracadasoa_grupo_hp(%hp_buffer: memref<?xi32>, %n: index) {
    affine.for %i = 0 to %n step 1 {
      %addcst = arith.constant 2 : i32
      %loaded = affine.load %hp_buffer[%i] : memref<?xi32>
      %sum = arith.addi %loaded, %addcst : i32
      affine.store %sum, %hp_buffer[%i] : memref<?xi32>
    }
    return
  }
}
```

## 4) Integração no fluxo atual

Pipeline integrada:

`Tom Code -> Tom AST -> TomIR -> MLIR (Affine/SCF) -> LLVM IR`

No estado atual deste patch:

- `ParaCadaSOA` mantém geração LLVM existente (compatibilidade imediata).
- Em paralelo, o compilador agora também materializa um módulo TomIR e exporta MLIR affine para `output.mlir`.
- A lista de módulos MLIR agora agrega:
  - módulos vec4 existentes (`SomarVec4In32`),
  - módulos novos de `ParaCadaSOA`.

Isso permite evoluir para um lowering completo no futuro (substituindo gradualmente o caminho de string LLVM por um pipeline orientado a IR).
