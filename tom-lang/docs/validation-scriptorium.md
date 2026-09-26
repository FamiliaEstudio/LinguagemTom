# Validação da fundação do Scriptorium

Validação local em Linux x64/WSL e Windows x64, em 18/09/2026 UTC.

## Resultados confirmados

- Núcleo: 206 testes aprovados em cada plataforma, sem falhas ou testes ignorados.
- Fundação, após a revisão final: 20 testes aprovados em cada plataforma, cobrindo texto, SQLite e falhas nativas.
- Pacotes independentes: demonstração em O0/O2, duas execuções por pacote, com PATH sem ferramentas de desenvolvimento.
- Persistência e backup: 1.024.000 pontos de código Unicode preservados integralmente.
- Pesquisa e escala: 10.000 documentos gravados; 100 consultas FTS5 verificadas.
- Runtimes C reconstruídos e instalados localmente nas duas plataformas pelo CMake.
- Musical: 19 testes aprovados em cada plataforma, incluindo interface, perfis e capturas gráficas em O0/O2.
- Companion: 91 testes aprovados no Windows, sem falhas ou testes ignorados.
- Comparação C/Tom: 38 cenários, 142 eventos e 135 quadros equivalentes em O0/O2 nas duas plataformas; os quatro testes do executor também passaram.

## Medições locais

| Plataforma | Gravar 10.000 textos | Executar 100 pesquisas |
|---|---:|---:|
| Linux x64/WSL | 366.791 ms | 300.539 ms |
| Windows x64 | 259.697 ms | 151.037 ms |

Uma amostra por plataforma, incluindo início dos processos; não constitui garantia
de desempenho nem comparação controlada entre sistemas. As consultas verificam
contagens sobre o mesmo corpus e utilizam SQLite 3.53.4 com FTS5.

## Reprodução e evidências

Com o ambiente local ativado:

```text
npm --prefix tom-lang run test:scriptorium
node scripts/verify-scriptorium.js
```

Relatórios, logs, bancos e pacotes locais ficam em
`.tools/<plataforma>/validation-scriptorium/`: `results.json`, `core-tests.tap`,
`foundation-tests.tap`, `musical-tests.log`, `benchmark-tests.log` e `packages/`.
O log adicional do Companion no Windows é `companion-tests.log`.
A CI foi atualizada para repetir a validação
e publicar os artefatos; nenhuma execução remota da CI foi iniciada nesta tarefa.

A suíte da fundação injeta falhas de alocação, valida referências após crescimento,
rejeita tipos/índices incorretos, verifica rollback por exceção e recupera um banco
após saída imediata do processo com escrita pendente e páginas descarregadas.
Os testes de execução Tom verificam também contadores de recursos ao terminar.

Esta entrega não inclui editor gráfico, segmentação por grafemas, sincronização
ou exportação DOCX. Consulte o [contrato](texto-sqlite.md) e a
[demonstração](../exemplos/scriptorium/README.md).
