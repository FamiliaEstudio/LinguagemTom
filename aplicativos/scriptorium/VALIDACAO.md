# Validação do Scriptorium

Verificação local em 18/09/2026, com Node 24.21.0 e LLVM 21.1.8. Windows x64 executado nativamente via PowerShell; Linux x64 executado em WSL, com arquivos em `/mnt/c`. Os resultados abaixo são medições deste ambiente, não garantias de tempo em outros computadores.

## Resultados reproduzidos

| Verificação | Resultado |
|---|---|
| Regressões compartilhadas de Tom | 222 testes passaram no Linux; incluem as suítes `test:scriptorium` e `test:document-editor`. |
| Testes próprios do aplicativo | 13 testes passaram em Linux e Windows, incluindo casos nativos em O0/O2. |
| Interface simulada | O0/O2 nas duas plataformas: escrever, salvar, cancelar, descartar, editar ficha, atribuir persona, consultar ficha anterior, restaurar versão, continuar sua sequência, dividir importação, exportar, fazer backup, restaurar em outra pasta e recuperar ficha/conteúdo. |
| Desktop real | Pacote de produção em X11/WSLg e Win32: abertura de janela, entrada nativa, salvamento, ficha e redimensionamento. PATH sem ferramentas de desenvolvimento. |
| Área de transferência | Unicode, acentos, grafemas, emoji e múltiplas linhas entre duas instâncias e aplicativo externo, nas duas plataformas. Conteúdo anterior restaurado. |
| Integração da toolchain | Novos módulos compilados e instalados via CMake em Linux e Windows; dependências e licenças incluídas nos pacotes. |
| DOCX da síntese original | Importação de 26.196 caracteres; sete categorias de conversão identificadas na prévia. Original não alterado. |

O piloto técnico usa 20 arquivos gerados: 12 DOCX, quatro TXT e quatro Markdown, incluindo um milhão de caracteres. Verifica Unicode, espaços, estilos, importação repetida por hash, exportação ordenada, reimportação, backup, restauração, corrupção de fontes, cancelamento e retenção. Um caso adicional recusa XML com entidade externa. A síntese fornecida também foi importada pelo conversor real.

Os testes de domínio verificam composição em 2011 com atribuição posterior, histórico preservado, versões imutáveis, restauração com nova revisão, filtros combinados, busca atual/histórica, arquivamento, datas parciais e inválidas, rollback conjunto de ficha/conteúdo/histórico/FTS e proveniência repetida.

O adaptador foi exercitado com contexto capturado por solicitação, alterações de ficha sem alteração textual, recuperação, migração 1→2 e falha de trigger. A suíte reutilizada cobre interrupção do processo, conflitos entre sessões, banco ocupado, somente leitura e falha simulada de disco cheio. Falha simulada não substitui um ensaio físico de esgotamento do disco.

## Escala, O2

Acervo de 10.000 textos; abertura e salvamento de um documento de 1.000.000 de caracteres. Consulta pelo índice FTS com tag, coleção e intervalo de composição. A listagem retorna a página 199 com 50 resultados e total de 10.000.

| Operação | Windows nativo | Linux/WSL em `/mnt/c` |
|---|---:|---:|
| Abrir documento grande | 27,50 ms | 204,55 ms |
| Capturar solicitação de salvamento | 1,64 ms | 1,36 ms |
| Confirmar salvamento, incluindo captura | 38,52 ms | 1.037,03 ms |
| Busca filtrada FTS | 0,90 ms | 4,88 ms |
| Listagem paginada e contagem | 25,61 ms | 196,56 ms |

A consulta força o processamento dos candidatos FTS antes dos registros completos; o ensaio detectou e corrigiu um plano que percorria todas as versões. A diferença de gravação entre plataformas inclui o custo do filesystem montado no WSL. O commit executa na thread de persistência; abertura, captura e consultas são síncronas.

## Reprodução e evidências

Ative a toolchain da plataforma a partir da raiz do repositório:

```text
npm --prefix tom-lang test
npm --prefix tom-lang run test:scriptorium-app
npm --prefix tom-lang run verify:scriptorium-app
node aplicativos/scriptorium/scripts/verify-desktop.js
node scripts/verify-editor-clipboard.js
node aplicativos/scriptorium/scripts/generate-schema.js --check
```

Em CI Linux, execute as verificações de desktop e clipboard dentro de `xvfb-run -a`. A interface simulada usa SDL dummy e é distinta da validação de desktop. Relatórios locais ficam em `.tools/<plataforma>/scriptorium/validation/`: `ui-results.json`, `desktop-O2.json`, `scale-O0.json` e `scale-O2.json`. O clipboard registra seu resultado em `.tools/<plataforma>/validation-editor/clipboard/results.json`.

O EPERM inicialmente encontrado ao iniciar LLVM foi superado neste ambiente por execuções nativas autorizadas; os resultados acima foram efetivamente reproduzidos.

## Aceite ainda manual

- Revisar um conjunto de 20 documentos representativos do acervo pessoal; o piloto automatizado usa arquivos sintéticos e não substitui esse aceite literário.
- Conferir teclado físico ABNT2, composição de acentos e AltGr no equipamento de uso. Eventos automatizados e texto Unicode não comprovam o teclado físico.
- Conferir escalas de tela de 100%, 125%, 150% e 200%, diálogos do sistema e abertura dos DOCX exportados no editor externo escolhido. Redimensionamento automático não comprova todas as configurações de DPI.

As etapas 3–6 permanecem no [roteiro de evolução](ROADMAP.md), conforme o escopo do plano. Não há análise métrica, atribuição automática de autoria, busca semântica ou publicação externa nesta entrega.
