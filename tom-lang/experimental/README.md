# Protótipos experimentais

`tomc.js`, `tom_ir.js` e `tom_to_mlir.js` preservam o compilador anterior à
consolidação. Estes arquivos não são importados pelo compilador estável nem pela
extensão. Não são uma alternativa de produção nem passam pela garantia de correção
do núcleo atual.

O compilador antigo contém execução de JavaScript via `new Function`, geração
parcial de CPU/GPU/MLIR e diagnósticos que não interrompem a publicação de saídas.
Não o utilize como verificador de programas nem execute fontes não confiáveis nele.

Os exemplos de GPU e Comptime em `../exemplos/` permanecem como material de pesquisa.
`examples/teste_legacy.tom` preserva o antigo exemplo misto de orçamento e GPU.
Todos são classificados em `../exemplos/manifest.json`; o compilador estável deve
rejeitá-los. Os documentos de arquitetura antigos e o host GPU em
`../runtime/tom_gpu_host.cpp` também são experimentais. O runtime SDL3 atual em
`../runtime/stable/` pertence ao núcleo suportado e não usa esse host.

Uma funcionalidade só pode migrar para o núcleo depois de ter semântica documentada,
diagnósticos completos e testes de execução com LLVM em Windows e Linux. O caminho
estável não possui opção que desative verificações ou execute estes protótipos.
