# Calculadora C e benchmark Tom × C

Esta pasta contém uma calculadora C17 escrita manualmente e uma comparação
reproduzível com `tom-lang/exemplos/calculadora.tom`. Ambas usam **o mesmo runtime
Tom**, SDL3, SDL_ttf, fonte DejaVu Sans e libmpdec, com as mesmas regras Dc34.
Python e C# ainda não têm implementações nesta estrutura.

## Preparar e abrir a versão C

Na raiz do repositório, depois dos instaladores já usados pela Tom:

```bash
# Linux / WSLg
source scripts/env.sh
node benchmarks/calculator/run.js --run-c
```

```powershell
# Windows x64 / PowerShell
. ./scripts/env.ps1
node benchmarks/calculator/run.js --run-c
```

`--build` gera os executáveis sem abrir a janela. A aplicação C fica em
`benchmarks/calculator/build/<plataforma>/O2/desktop/calculadora-c[.exe]`.
Copie toda a pasta `desktop/` para manter fonte, bibliotecas e licenças juntas.
Os arquivos `.o` dessa pasta são intermediários e podem ser omitidos na distribuição.
O executável C usa o runtime de produção, sem adaptador de benchmark.

`node benchmarks/calculator/desktop-check.js` abre a aplicação C no desktop real,
envia teclado/mouse/redimensionamento ao processo criado e fecha a janela. Exige
Windows interativo ou Linux X11/WSLg. Esse teste de integração não mede desempenho;
os valores do visor são conferidos pelo roteiro automático descrito abaixo.

Alvos exercitados: Linux x64 GNU/glibc e Windows x64 LLVM-MinGW/UCRT. WSL gera
binários Linux; use Node Windows para gerar `.exe`. Os builds são separados por
plataforma e otimização. Não são necessárias dependências adicionais aos
[instaladores locais](../../scripts/README.md).

## Verificar antes de medir

```text
npm --prefix tom-lang run benchmark:verify
```

Executa os testes do controlador e compila/verifica as versões C/Tom em `-O0` e
`-O2`. Os 38 cenários formam um ciclo de 142 eventos e 135 quadros após o primeiro
quadro inicial. Incluem os 19 botões, limites de clique, escala após resize,
decimais, Unicode, repetição de igual, edição, erros e recuperação.

O oráculo em `workload.js` declara os valores e mensagens esperados, sem executar
uma terceira calculadora para produzi-los. As duas versões devem coincidir com
ele e, no modo gráfico, emitir a mesma sequência de desenho: textos, fontes,
posições, cores e retângulos. Todas as execuções exigem zero objetos rastreados
vivos ao sair. A verificação registra observações em memória e só grava ao final.

A CI está configurada para verificar a **correção** do benchmark em Windows/Linux.
Ela não usa diferenças de tempo de máquinas virtuais como critério de aprovação.

Validação local em 12/09/2026: os 38 cenários passaram nas duas plataformas com
`-O0` e `-O2`, incluindo igualdade das saídas e do desenho e zero objetos
rastreados vivos ao sair. A versão C de produção também abriu, recebeu comandos,
foi redimensionada e fechou em janelas reais no Windows e no Linux/WSLg. Rodadas
`--quick` geraram os três formatos de relatório em ambos os sistemas; são ensaios
da estrutura, sem uma conclusão geral sobre desempenho das linguagens.

## Executar medições

```text
# Verificação + ensaio curto dos três modos, três amostras por versão
node benchmarks/calculator/run.js --quick

# Padrão: nove amostras, lotes calibrados para pelo menos aproximadamente 250 ms
node benchmarks/calculator/run.js

# Ensaio mais longo, com duração-alvo e número de amostras explícitos
node benchmarks/calculator/run.js --samples 15 --target-ms 1000 --idle-ms 2000

# Repetição exata de um lote: 20 ciclos medidos, dois ciclos de aquecimento
node benchmarks/calculator/run.js --mode headless --cycles 20 --warmup 2 --samples 9
```

`--mode` aceita `headless`, `render`, `idle` ou `all`. `--opt O0|O2` escolhe a
otimização; medições usam O2 por padrão. `--seed N` fixa a intercalação da ordem
Tom/C. `--out DIR` escolhe a pasta de relatório. Sem ele, cada rodada cria uma pasta
com data em `build/<plataforma>/<otimização>/results/`.

Não rode medições Linux e Windows simultaneamente no mesmo PC. Feche cargas
concorrentes, mantenha a configuração de energia constante e registre mudanças
de hardware/compilador. Compare repetições e dispersão, não apenas o menor tempo.
O ensaio `--quick` verifica o funcionamento da estrutura; não é uma conclusão de
desempenho para divulgação. Em três amostras, o p95 é apenas o maior valor observado.

## O que cada modo mede

| Modo | Corpo cronometrado | Limites |
|---|---|---|
| `headless` | Entrada, funções, estado, decimal, buffers, formatação e observação de visor/mensagem. | Substitui somente `Desenhar` por `headless-draw.tom`; a versão C faz a mesma redução. Não rasteriza nem mede os rótulos dos botões. |
| `render` | O mesmo roteiro com o fonte Tom original, layout e rasterização SDL completos. | SDL dummy/software: desenho fora da tela, sem composição do desktop ou latência do monitor. VSync desligado. |
| `idle` | Espera real em `SDL_WaitEvent`, depois do primeiro quadro, acordada por timer SDL. | Usa o driver dummy e inclui o custo do despertar. Mede a espera ociosa desta configuração, sem interação física. |

Headless ainda cria recursos SDL e carrega fontes antes da medição; isso mantém a
estrutura de inicialização e a ABI, mas esse custo não entra no lote medido.
O teste de AST garante que a adaptação não altera nenhum outro bloco da Tom.

O adaptador carrega e interpreta todo o roteiro **antes** de chamar a aplicação.
Em seguida, executa os ciclos de aquecimento. O cronômetro começa imediatamente
antes da entrega do primeiro evento medido e termina ao voltar para esperar após
o último quadro. Exclui leitura de arquivo, aquecimento, impressão de resultados,
evento final de fechamento e liberação final dos recursos persistentes.

Durante a medição não há log de cada chamada, captura de imagem ou gravação em
disco. Há uma observação compartilhada do visor/mensagem e um checksum de saída.
Cada amostra, inclusive aquecimento, roda em processo novo. O checksum de **todas**
as saídas medidas é confrontado com o roteiro esperado repetido pelo mesmo número
de ciclos. Os resultados precisam ser consumidos, mesmo com otimização ativada.

## Relatórios e interpretação

- `report.md`: mediana, p95, CPU, memória e aquisições de objetos por modo/versão.
- `samples.csv`: amostras individuais para planilhas e gráficos.
- `report.json`: amostras, calibração, oráculo, ambiente, ferramentas e hashes.
- `build.json`: fontes, LLVM, binários de bibliotecas/fontes e objetos do runtime.
- `verification.json`: observações da rodada de correção.

Um ciclo é o roteiro inteiro de 142 eventos, não uma operação aritmética isolada.
`elapsed_ms` mede tempo decorrido com o contador de alta resolução SDL.
`cpu_ms` soma CPU de usuário e sistema do processo. O contador Windows pode ser
grosseiro em intervalos curtos: zero não significa ausência de trabalho.

`first_frame_ms` vai da entrada instrumentada até a primeira apresentação; não
inclui criação/carregamento do processo pelo sistema nem leitura do roteiro.
`process_wall_ms` é observado pelo Node e inclui lançamento, execução e término.
São métricas diferentes de tempo até uma janela física aparecer no desktop.

`peak_resident_bytes` é o pico residente de **todo o processo**, incluindo início e
aquecimento: `ru_maxrss` no Linux e `PeakWorkingSetSize` no Windows. Não é um pico
restrito ao trecho cronometrado. Compare Tom/C dentro de cada sistema.

`tracked_acquisitions` conta novos objetos administrados pelo runtime Tom durante
a fase medida. Não conta todos os mallocs internos de SDL/libmpdec, não mede bytes
alocados e não equivale a vazamentos. `peak_tracked_objects` inclui toda a execução;
`live_objects_at_exit` deve ser zero.

## Equivalência e escolhas da implementação C

As duas calculadoras usam 34 dígitos, arredondamento com empate para par, conversão
integral, limites de texto, operação sequencial e o mesmo histórico de `=`. Usam
inclusive os mesmos comportamentos atuais, como trocar sinal sem desarmar a
repetição de igualdade. A captura cobre processamento de evento; falhas na criação
da janela, no desenho ou durante a própria recuperação encerram a aplicação.

Cada configuração compila os objetos do runtime uma vez e liga **os mesmos `.o`**
às duas aplicações, com o mesmo Clang e otimização, sem LTO. O C usa `switch`, uma
tabela de botões e pode escrever o resultado decimal diretamente no destino;
não reproduz todas as cópias temporárias emitidas pela Tom. Assim, diferenças
incluem escolhas de implementação e de gerenciamento de valores. Esse C não é
um limite teórico nem uma medição isolada da qualidade do backend LLVM.

O benchmark não otimiza antecipadamente o runtime: ambos ainda pagam o custo de
criar texturas para rótulos e objetos decimais. A estrutura permite medir mudanças
nesses custos posteriormente, preservando o mesmo roteiro e a correção.

## Arquivos e extensão futura

| Arquivo | Papel |
|---|---|
| `calculadora.c` | Aplicação C completa, com limpeza explícita e ABI Tom. |
| `headless-draw.tom` | Substituição de desenho exclusiva da medição sem renderização. |
| `workload.js` | Entradas e resultados esperados. |
| `build.js` | LLVM verificado, compilação e objetos compartilhados por plataforma. |
| `ui_adapter.c` | Entrega eventos de memória e observa saída/desenho. |
| `bench_support.c` | Cronômetros, contadores, protocolo JSON e verificação de recursos. |
| `run.js` | Verificação, calibração, amostras intercaladas e relatórios. |
| `runner.test.js` | Protege configuração, estatísticas, checksum e adaptação do fonte. |
| `desktop-check.js` | Exercita a versão C de produção numa janela real, usando os drivers existentes. |

Uma implementação futura Python/C# deve primeiro reproduzir o contrato decimal,
eventos e resultados do mesmo roteiro. O protocolo dos executáveis é
`EVENTS CYCLES WARMUP VERIFY` ou `--idle MS`, devolvendo um objeto JSON de esquema 1
depois de encerrar. `VERIFY=1` adiciona as observações; `VERIFY=0` só agrega métricas.
Registrar uma nova linguagem exige implementar seu build/entrada no controlador;
não há adaptador Python/C# já pronto ou resultados implícitos para essas linguagens.

Referências dos instrumentos: [contador SDL](https://wiki.libsdl.org/SDL3/SDL_GetPerformanceCounter),
[CPU do processo Windows](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes),
[memória do processo Windows](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo)
e [boas práticas de benchmarking](https://benchmarkdotnet.org/articles/guides/good-practices.html).
