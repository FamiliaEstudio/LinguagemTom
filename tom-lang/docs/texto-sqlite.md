# Texto dinâmico e SQLite — fundação do Scriptorium

Esta extensão do núcleo 0.4 fornece texto UTF-8 redimensionável e SQLite 3.53.4
com FTS5. As operações são gerais e podem ser usadas por qualquer aplicação Tom.
O exemplo `exemplos/scriptorium/acervo.tom` valida um acervo; ainda não é o editor
ou o modelo definitivo do Scriptorium.

## Texto

```tom
DefRecursoxDocumentoyTextoCriar[l'Olá',67108864]
AnexarTxt[@Documento,l', escritora!']
InserirTxt[@Documento,0,l'Bem-vinda. ']
SubstituirTrechoTxt[@Documento,0,9,l'Bom dia.']
LocalizarTxt[@Documento,l'escritora',0]
DefVarInSd64xPosicaoy@ULTIMO
GerarTxtxDocumento
```

`TextoCriar[Txt,InUd64]` cria um recurso `Texto` independente. O limite é de
1 a 2147483647 **bytes, incluindo NUL**. A capacidade inicial é pequena e cresce
geometricamente até o limite; o exemplo usa 64 MiB. O conteúdo deve ser UTF-8
válido sem NUL embutido. Não há truncamento nem normalização automática.

`Texto` é aceito onde operações nativas recebem `Txt`, `Buffer` ou `RefBuffer`:
impressão, comparações, cópia, concatenação, limpeza, recorte, conversões,
desenho/medição, JSON, arquivos e mensagens. Os limites próprios de JSON, eventos
e canais continuam valendo. `DadosLer` considera o limite do texto dinâmico,
não apenas sua capacidade já alocada.

| Operação | Parâmetros e comportamento |
|---|---|
| `TextoCriar` | `[ConteudoInicial,LimiteBytes]` → recurso `Texto` |
| `InserirTxt` | `[Destino,Inicio,Texto]`, insere antes da posição indicada |
| `RemoverTrechoTxt` | `[Destino,Inicio,Quantidade]`, remove o intervalo |
| `SubstituirTrechoTxt` | `[Destino,Inicio,Quantidade,Texto]`, substitui o intervalo |
| `LocalizarTxt` | `[Texto,Procurado,Inicio]` → `InSd64`, posição ou `-1` |

Índices e quantidades dessas operações são `InUd64`, começam em zero e contam
**pontos de código Unicode**. Início igual ao comprimento permite inserção,
remoção vazia e busca vazia; início além do comprimento ou intervalo excedente
produz erro. Busca é literal, sensível a maiúsculas e acentos, e devolve índice
absoluto. Uma busca vazia encontra a própria posição inicial.

Acentos combinantes e emojis compostos podem conter vários pontos de código.
A segmentação visual para o cursor pertence à fase do editor. Os bytes originais
são preservados. Inserções no meio deslocam o sufixo; não há promessa de custo
constante para editar um livro.

Erros de intervalo, UTF-8, capacidade ou memória preservam o conteúdo do destino.
Origem e destino podem ser o mesmo texto, inclusive em inserção, substituição,
concatenação e recorte que provoquem realocação. Os buffers `FBnC` continuam
fixos; parâmetros `RefFB64C`, por exemplo, não aceitam `Texto`.

### Empréstimos e duração

```tom
DefFuncaoxAcrescentar[RefTextoxDestino,TxtxVista]yVazio
AnexarTxt[@Destino,l' — continuação']
GerarTxtxVista
FimFuncao
DefRecursoxDocumentoyTextoCriar[l'Capítulo',67108864]
ChamarxAcrescentar[@Documento,@Documento]
```

`Texto` como parâmetro permite leitura; `RefTexto` permite mutação. `Txt` é uma
vista emprestada do **conteúdo atual**, não uma cópia: no exemplo, a impressão
inclui a continuação. Funções Tom passam descritores indiretos; resolver o
conteúdo no momento da leitura evita ponteiros inválidos após crescimento.
As chamadas nativas recebem a string resolvida imediatamente antes da chamada.

Os recursos têm limpeza lexical automática, inclusive em `Retornar`, laços,
`Interromper` e propagação de erro. Não podem escapar da chamada, ser retornados
por funções ou embutidos em registros. Para uma cópia independente, crie outro
recurso com `TextoCriar[@Documento,LimiteBytes]`.

A representação C de `TomText` e a ABI interna dos parâmetros `Txt` mudaram;
recompile o runtime e todos os módulos ao atualizar. Executáveis já distribuídos
continuam utilizando seus próprios runtimes.

## SQLite

O instalador baixa a amalgamação oficial 3.53.4, verifica SHA-256 e a compila com
`SQLITE_ENABLE_FTS5`, `SQLITE_THREADSAFE=1` e `SQLITE_OMIT_LOAD_EXTENSION`.
A versão e os hashes estão em `scripts/toolchain.json`; o recibo de compilação
fica em `.tools/<plataforma>/native/build/sqlite/receipt.json`.

SQLite é vinculado estaticamente apenas quando necessário. Texto e SQLite
sozinhos não exigem janela, SDL, servidor, shell sqlite3, Node ou LLVM no
computador que executa o pacote.

```tom
Importar[l'tom/sqlite']
DefRecursoxBancoySQLiteAbrir[l'acervo.sqlite']
ChamarxSQLiteExecutar[@Banco,l'CREATE TABLE IF NOT EXISTS textos(id INTEGER PRIMARY KEY, conteudo TEXT NOT NULL)']
EscopoInixGravacao
DefRecursoxTransacaoySQLiteTransacaoIniciar[@Banco]
DefRecursoxConsultaySQLitePreparar[@Banco,l'INSERT INTO textos(conteudo) VALUES(?1)']
SQLiteVincularTexto[@Consulta,1,l'A memória da biblioteca.']
SQLiteAvancar[@Consulta]
SQLiteTransacaoConfirmar[@Transacao]
EscopoFimxGravacao
DefRecursoxConsultaySQLitePreparar[@Banco,l'SELECT conteudo FROM textos ORDER BY id']
SQLiteAvancar[@Consulta]
DefVarBlxTemLinhay@ULTIMO
Enquantox@TemLinha
DefRecursoxTextoyTextoCriar[l'',67108864]
SQLiteColunaTexto[@Consulta,0,@Texto]
GerarTxtxTexto
SQLiteAvancar[@Consulta]
SetVarBlxTemLinhay@ULTIMO
FimEnquanto
```

### Operações públicas

| Operação | Parâmetros → resultado |
|---|---|
| `SQLiteAbrir` / `SQLiteAbrirLeitura` | `[Caminho]` → `BancoSQLite` |
| `SQLitePreparar` | `[RefBancoSQLite,SQL]` → `ConsultaSQLite` |
| `SQLiteVincularTexto/InSd64/Fl64/Bl` | `[RefConsultaSQLite,Indice,Valor]` |
| `SQLiteVincularNulo` | `[RefConsultaSQLite,Indice]` |
| `SQLiteAvancar` | `[RefConsultaSQLite]` → `Bl` |
| `SQLiteReiniciar` | `[RefConsultaSQLite]`, reinicia e limpa todos os parâmetros |
| `SQLiteQuantidadeColunas` | `[ConsultaSQLite]` → `InSd32` |
| `SQLiteColunaTipo` | `[ConsultaSQLite,Indice]` → `InSd32` |
| `SQLiteColunaTexto` | `[ConsultaSQLite,Indice,Destino]`, copia para `Texto` ou `FBnC` |
| `SQLiteColunaInSd64/Fl64/Bl` | `[ConsultaSQLite,Indice]` → valor tipado |
| `SQLiteTransacaoIniciar` | `[RefBancoSQLite]` → `TransacaoSQLite` |
| `SQLiteTransacaoConfirmar/Reverter` | `[RefTransacaoSQLite]` |
| `SQLiteBackup` | `[BancoOrigem,RefBancoDestino]` |
| `SQLiteErroCodigo` | `[BancoSQLite]` → último código SQLite registrado (`InSd32`) |
| `SQLiteErroMensagem` | `[BancoSQLite,Destino]`, copia a última mensagem SQLite registrada |

`SQLiteExecutar[RefBancoSQLite,Txt]` e `SQLiteColunaNula[ConsultaSQLite,InSd32]`
são funções da biblioteca e exigem `Chamarx`. A primeira executa uma instrução
sem resultados e sem parâmetros; consultas e valores do usuário devem utilizar
a API preparada. A segunda retorna `Bl`.

### Contrato

- Abertura usa caminhos UTF-8; relativos partem do diretório de execução.
  `SQLiteAbrir` cria o arquivo quando necessário, sem criar pastas intermediárias.
  `SQLiteAbrirLeitura` exige arquivo existente. `:memory:` cria banco em memória.
- Conexões ativam chaves estrangeiras, sincronização `FULL` e espera de até
  1000 ms por bloqueio. Abertura gravável seleciona journal `DELETE`; somente
  leitura não tenta modificar o modo de journal do arquivo.
- Preparação admite exatamente uma instrução, com comentários e terminadores
  finais. Uma segunda instrução é rejeitada sem preparar o restante. SQLite pode
  executar determinados PRAGMAs durante a preparação, conforme seu contrato.
- Parâmetros usam índices `InSd32` a partir de **1**; colunas usam índices a partir
  de **0**. Texto vinculado é copiado (`SQLITE_TRANSIENT`); alterar ou liberar a
  origem não altera o valor vinculado. Parâmetros não vinculados são `NULL`.
- Vincule parâmetros antes do primeiro avanço ou após reiniciar. Avanço retorna
  verdadeiro para uma linha e falso ao concluir, inclusive INSERT/UPDATE/DELETE
  sem RETURNING. Chamadas após conclusão continuam retornando falso, sem repetir
  a instrução. Após erro de execução, reinicie antes de reutilizar a consulta.
- Somente uma linha corrente pode ter suas colunas lidas. Tipos são estritos:
  inteiro exige INTEGER; `Fl64` exige REAL finito; booleano exige INTEGER 0/1;
  texto exige TEXT UTF-8 sem NUL. `NULL` é distinto de vazio/zero. Não há leitura
  BLOB nesta fase. `Dc34` e inteiros unsigned fora da faixa signed podem ser
  armazenados como texto mediante conversão explícita.
- `SQLITE_INTEIRO=1`, `SQLITE_REAL=2`, `SQLITE_TEXTO=3`, `SQLITE_BLOB=4` e
  `SQLITE_NULO=5` identificam tipos. A leitura textual copia os dados e preserva
  o destino se houver erro; a cópia permanece válida depois de avançar.
- Transações usam `BEGIN IMMEDIATE`; há uma ativa por conexão, sem aninhamento.
  BEGIN/COMMIT/ROLLBACK/SAVEPOINT por SQL preparado são rejeitados. O recurso
  confirma apenas com `SQLiteTransacaoConfirmar`; saída sem confirmação reverte.
  Uma falha de confirmação mantém a proteção para reversão na saída do escopo.
- Consultas e transações retêm a conexão nativa até serem liberadas. Não existe
  fechamento manual capaz de invalidar um filho ainda vivo.
- Backup usa a API SQLite entre duas conexões distintas, sem transações explícitas
  ativas. Substitui o conteúdo do destino em transação. Falhas são reportadas;
  o chamador só deve considerar a cópia válida após sucesso e verificação.
- Erros Tom: `10` SQLite, `11` ocupado/bloqueado, `12` somente leitura e `13`
  restrição de integridade; erros de memória, capacidade, tipo e índice reutilizam
  os códigos existentes. A localização acompanha `Tentar/Capturar`. Informações
  SQLite detalhadas ficam na conexão, quando ela existe; mensagens são limitadas
  a 511 bytes UTF-8. Operações bem-sucedidas não apagam o último erro registrado.

## Pesquisa e demonstração

O exemplo cria textos, categorias e associações, com esquema `user_version=1`.
Autor, heterônimo, gênero, data e rascunho são dados demonstrativos; a data é uma
string ISO, sem introduzir um tipo de calendário nesta fase.

FTS5 indexa título e conteúdo com `unicode61 remove_diacritics 2`. Gatilhos
atualizam o índice na mesma transação das inserções, atualizações e exclusões.
Os filtros combinam categoria, autoria, heterônimo, gênero, data, rascunho e
busca `coracao`, que encontra `coração`. Isso não altera o texto original e não
implica busca por radical em português nem pesquisa arbitrária por substring.

A carga inicial é feita apenas quando ausente. A execução verifica atualização,
exclusão de um texto temporário, rollback, backup e reabertura. Uma versão de
esquema desconhecida é rejeitada; a demonstração não migra acervos do usuário.

## Preparação e validação

Depois de instalar/atualizar as dependências com os scripts habituais:

```sh
source scripts/env.sh
npm --prefix tom-lang run test:scriptorium
node scripts/verify-scriptorium.js
```

No Windows, use `. ./scripts/env.ps1` e os mesmos comandos Node/npm.
A verificação gera pacotes O0/O2, executa duas vezes o acervo em pastas próprias,
valida 1.024.000 pontos de código e mede gravação de 10.000 textos mais 100 buscas.
Os processos executam com PATH sem ferramentas de desenvolvimento.

Resultados, bancos e pacotes ficam em `.tools/<plataforma>/validation-scriptorium/`.
As medições incluem inicialização do processo; não são garantias de desempenho.
Testes nativos exercitam falhas de alocação, limites, aliases, consultas tipadas,
bloqueios, leitura somente, recuperação após `_Exit` com transação pendente e
contadores de recursos. A CI executa as regressões e publica a validação nas duas
plataformas.

Os resultados locais e as medições estão no
[relatório de validação](validation-scriptorium.md).

Referências: [SQLite C](https://www.sqlite.org/cintro.html),
[FTS5](https://www.sqlite.org/fts5.html),
[transações](https://www.sqlite.org/lang_transaction.html),
[backup](https://www.sqlite.org/backup.html).
