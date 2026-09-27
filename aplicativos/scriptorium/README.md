# Scriptorium

Aplicativo pessoal de escrita e organização do acervo, implementado em Tom. O MVP reúne fichas, personas, coleções, edição com estilos, versões, pesquisa, importação assistida, exportação e backup. As regras do acervo ficam em `src/`; o runtime fornece capacidades reutilizáveis.

## Executar

No Windows, extraia `Scriptorium-windows-x64.zip` e execute `Instalar-Scriptorium.exe`. Ele instala o pacote em `%LOCALAPPDATA%\Programs\Scriptorium\versions\<identificador>` e cria `Scriptorium.lnk` na área de trabalho com o logo do aplicativo. Não exige administrador. Depois, abra o atalho; novos cliques trazem a janela já aberta para a frente. Também é possível executar `scriptorium.exe` diretamente na pasta extraída; mantenha junto dele as DLLs, fontes e licenças distribuídas. Não é necessário instalar Tom, Node, LLVM ou Word. No Linux, execute `scriptorium` na pasta equivalente.

O acervo fica separado do programa: `%APPDATA%\Tom\Scriptorium\acervo` no Windows; `$XDG_DATA_HOME/Tom/Scriptorium/acervo` no Linux, usando `~/.local/share` quando a variável não está definida. `dados.sqlite` contém os textos; `fontes/` guarda os originais, nomeados pelo SHA-256. A pasta principal também contém `configuracao.json` e, inicialmente, `backups/`. Atualizar o pacote não substitui o acervo.

Para trabalhar com outro acervo, inicie o programa com `TOM_DATA_DIRECTORY` apontando para outra pasta. Cada pasta mantém sua própria configuração. A restauração pela interface cria e abre uma nova pasta, preservando o acervo anterior.

## Uso

- **Novo / Ficha:** clique no título mostrado acima do editor ou em **Ficha** para alterar o título. Edite o campo **Título**, clique em **Aplicar** e depois em **Salvar** para confirmar. Incipit significa as primeiras palavras ou o primeiro verso do texto; é opcional. A ficha também reúne corpus, gênero, estado, idioma, autor empírico, persona, certeza, composição, publicação, tags, coleções, justificativa, notas e motivo da revisão. Persona vazia significa Indeterminado. Tags e coleções são separadas por `;`. Tab percorre os campos; Shift+Enter insere uma quebra em notas.
- **Datas:** vazio para desconhecida; `2011`, `2011-03`, `2011-03-25`, `25/03/2011` ou intervalo de duas datas completas separado por `/`. Datas brasileiras são convertidas para a forma `AAAA-MM-DD` ao aplicar a ficha. Datas impossíveis são rejeitadas com aviso legível, mantendo a edição em memória. Composição e data da decisão de autoria são independentes.
- **Escrita:** negrito, itálico, sublinhado, tamanho entre 8 e 72 pontos e alinhamento. Os botões **−**, **100%** e **+** no rodapé ajustam o zoom visual do texto entre 50% e 200%, sem modificar sua formatação. As barras de rolagem do texto e da ficha podem ser arrastadas com o mouse. Selecione um trecho no editor e clique em **Criar obra da seleção** para copiá-lo, com seus estilos, para um novo texto independente; o texto aberto permanece como estava. Sem seleção, a ação pede que você marque um trecho. **Nova versão desta obra** salva as alterações do texto aberto; sem alterações, informa que não há nova versão a criar. Ctrl+S também salva, Ctrl+B/I/U formata. Ctrl+N cria; Ctrl+F busca; Ctrl+H abre versões; Ctrl+O importa; Ctrl+E exporta. AltGr não aciona esses atalhos.
- **Versões:** compara a atual e uma anterior, permite percorrer o histórico e consultar a ficha anterior. Restaurar prepara uma nova revisão; salvar a confirma sem remover nenhuma versão. Arquivar/reabrir é uma alteração da ficha, confirmada ao salvar.
- **Pesquisa:** corpus na barra lateral; alternância entre personas e coleções cadastradas; filtros combináveis em Buscar. A lista tem páginas de 50 resultados e rolagem. A busca padrão tolera caixa e acentos e consulta apenas versões atuais. A opção exata respeita caixa/acentos e limites de palavra. `rocha` não encontra `rochas`. O histórico e os arquivados exigem opções explícitas.
- **Importação:** escolha ou digite o caminho de DOCX, TXT UTF-8 ou Markdown. O original é copiado e conferido antes da prévia. Leia os avisos, selecione um trecho e use **Criar obra da seleção**; repita para dividir um arquivo. A prévia permanece aberta e mostra a confirmação; **Concluir** abre a última obra criada. Sem seleção, importa o documento inteiro. Na prévia, **Nova versão desta obra** substitui o conteúdo do texto atualmente aberto pelo trecho importado e preserva a versão anterior no histórico. Hashes iguais reutilizam o mesmo original; confirmar trechos continua sendo uma decisão manual.
- **Exportação:** texto atual, coleção por título ou seleção marcada na ordem dos cliques. Escolha DOCX ou saída textual. Markdown preserva sua marcação como texto. A edição externa volta pelo fluxo de importação e revisão.
- **Backup / Ajustes:** backup manual e pasta configurável. O automático verifica alterações diariamente enquanto o aplicativo está aberto, primeiro após um minuto e depois a cada cinco minutos. São preservados os sete dias mais recentes e quatro semanas com cópias disponíveis; manuais e pré-migração não entram na limpeza. A cópia é publicada após conferir banco e arquivos. Restaurar verifica os hashes e cria outra pasta antes de abri-la.

Ao fechar ou mudar de texto com alterações, escolha salvar, descartar ou cancelar. Uma ficha nova ainda vazia fecha sem aviso. A recuperação automática é separada das versões confirmadas. Mensagens de falha permanecem no rodapé; uma falha não confirma o salvamento. Após conflito entre sessões, preserve o conteúdo da edição e reabra a versão mais recente antes de reaplicá-lo.

## Limites do DOCX

Preserva texto, versos, espaços, tabulações simples, negrito, itálico, sublinhado, tamanho e alinhamento. A fonte visual é a do editor. Tabelas e listas são convertidas em parágrafos; imagens, objetos, comentários, notas, cabeçalhos, rodapés e outros recursos avançados permanecem no original. A prévia informa as conversões detectadas. Não há fidelidade de paginação ou equivalência completa ao Word. O original integral permanece disponível em `fontes/`.

## Desenvolvimento

Comandos a partir da raiz do repositório, após `source scripts/env.sh` no Linux ou `. ./scripts/env.ps1` no PowerShell:

```text
node scripts/build-docx.js
node aplicativos/scriptorium/scripts/generate-schema.js --check
npm --prefix tom-lang run test:scriptorium-app
npm --prefix tom-lang run verify:scriptorium-app
npm --prefix tom-lang run package:scriptorium
node aplicativos/scriptorium/scripts/verify-desktop.js
```

O build usa as versões e hashes de `scripts/toolchain.json`. `setup-native.js` inclui as dependências DOCX no preparo completo. `package.js` gera pacotes independentes em `.tools/<plataforma>/scriptorium/packages/O2/scriptorium/`; `--zip` acrescenta ZIP no Windows ou tar.gz no Linux, com arquivo SHA-256; o comando npm já inclui essa opção. O instalador Windows confere o manifesto SHA-256 antes de copiar os arquivos, publica cada versão em uma pasta própria e só então atualiza o atalho. O acervo não é copiado nem substituído. `--debug` gera O0. `--test-ui` cria um pacote de teste separado, com eventos simulados. Para atualizar o logo SVG, PNG e ICO, execute `node aplicativos/scriptorium/scripts/generate-logo.js` antes de empacotar.

Consulte [contratos](CONTRATOS.md), [validação](VALIDACAO.md) e [evolução posterior ao MVP](ROADMAP.md).
