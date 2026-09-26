# Scriptorium — demonstração da Fase 1

Programa Tom sem interface gráfica que cria um acervo demonstrativo, guarda e
recupera 1.024.000 caracteres, combina filtros com pesquisa FTS5 e verifica
alterações, exclusão, rollback, backup e reabertura. Não é ainda o editor.

A maneira recomendada de executar é, na raiz do repositório, com o ambiente
ativado:

```text
node scripts/verify-scriptorium.js
```

Esse comando prepara pastas exclusivas, gera executáveis independentes em O0/O2,
executa a demonstração duas vezes e mede um segundo acervo de 10.000 textos.
Resultados e pacotes ficam em `.tools/linux/validation-scriptorium/` ou
`.tools/windows/validation-scriptorium/`. O segundo processamento valida que a
carga inicial não é duplicada.

Para compilar somente o exemplo:

```text
node tom-lang/tomc.js --build tom-lang/exemplos/scriptorium/acervo.tom
```

Execute o binário em uma pasta exclusiva. Ele cria ou reutiliza
`acervo-demonstracao.sqlite` e substitui seu backup
`acervo-demonstracao-backup.sqlite` nessa pasta. Distribua a pasta do pacote
completa. SQLite acompanha o executável; Node, LLVM e servidor não são necessários.

Saída esperada:

```text
Scriptorium: cadastro, edição, filtros, FTS5, rollback e backup verificados.
Texto recuperado: 1024000 caracteres.
```

O esquema tem versão 1 e dados fictícios; não define o modelo final do produto.
Consulte o [contrato de texto e SQLite](../../docs/texto-sqlite.md).
