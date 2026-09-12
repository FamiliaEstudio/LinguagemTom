> Documento de pesquisa/proposta, preservado como histórico. Não descreve o suporte do compilador 0.1. Consulte o [núcleo estável](README.md).

# Análise Exaustiva de Latência de Hardware e Análise de Pior Caso (WCET) para Alocação de Orçamento em Tempo Real (Live Budget) em Compiladores JIT

## 1. Fundamentos da Microarquitetura e a Complexidade do Live Budget

A implementação de um sistema de **"Live Budget"** em um compilador como o `tomc.js` exige uma transição fundamental na forma como o custo computacional é modelado. Diferente da análise estática tradicional, que pode se basear em estimativas médias, um orçamento em tempo real destinado a garantir limites de execução — seja para prevenir denial of service em aplicações web, calcular taxas de gás em máquinas virtuais de blockchain ou garantir deadlines em sistemas de tempo real — necessita de uma compreensão profunda do **Pior Caso de Tempo de Execução (WCET - Worst-Case Execution Time)**. A precisão da Tabela de Custos (`OP_COSTS`) não é apenas uma questão de otimização, mas de integridade sistêmica.

A complexidade reside no fato de que os processadores modernos x86-64, abrangendo desde a microarquitetura Intel Skylake até as recentes Arrow Lake e AMD Zen 5, não executam instruções de maneira linear ou determinística. A execução é **especulativa**, **fora de ordem (OoO - Out-of-Order)** e **superescalar**. O custo de uma instrução não é um valor escalar fixo, mas uma função do estado do pipeline, da localidade dos dados na hierarquia de memória e da contenção de recursos nas portas de execução. Para preencher a `OP_COSTS` com precisão, devemos dissecar a **latência** — o tempo desde que os operandos estão prontos até que o resultado esteja disponível — e distinguir entre latência nominal e latência efetiva no pior cenário.

### 1.1 A Distinção Crítica: Latência vs. Throughput Recíproco

Para o `tomc.js`, a distinção entre **latência** e **reciprocal throughput** é vital:

- **Latência**: Define o atraso que uma instrução introduz em uma cadeia de dependência crítica. Se o algoritmo compilado for serial (e.g., cálculo de hash encadeado), a latência é o limitante absoluto.

- **Throughput Recíproco**: Define a taxa máxima na qual instruções independentes podem ser despachadas.

Em arquiteturas modernas, como o AMD Zen 4 ou Intel Raptor Lake, o throughput para instruções básicas (ADD, SUB) é extremamente alto, frequentemente alcançando 4 a 6 instruções por ciclo devido à multiplicidade de portas de execução (ALUs). No entanto, para fins de orçamento conservador **(WCET)**, a latência deve ser o guia primário. Utilizar o throughput como base para o custo pode levar a uma subestimação perigosa do tempo de execução real em códigos com alta dependência de dados, quebrando a garantia do orçamento.

### 1.2 O Impacto da Decodificação e Micro-operações (µops)

As instruções x86 são complexas e precisam ser traduzidas para **micro-operações (µops)** antes da execução. O custo de decodificação varia:

- **Instruções simples** (MOV, ADD): Decodificam para 1 µop e fluem rapidamente.
- **Instruções complexas**: Como a divisão inteira (IDIV) ou manipulações de string (REP MOVSB), podem disparar sequenciadores de microcódigo, bloqueando o front-end do processador e injetando dezenas de µops no buffer de reordenamento.

A análise a seguir segmenta os custos por classes de instrução, analisando a evolução das latências desde o Skylake (14nm) até o Zen 5 e Arrow Lake, fornecendo os dados brutos necessários para a `OP_COSTS`.

---

## 2. Aritmética Inteira: Do Trivial ao Gargalo Crítico

A aritmética inteira constitui a espinha dorsal da lógica de controle e manipulação de endereços. Enquanto a maioria das operações atingiu um platô de eficiência, a divisão inteira permanece uma fonte de variabilidade extrema que o Live Budget deve acomodar.

### 2.1 Operações Básicas de ALU (ADD, SUB, AND, OR, XOR)

Em todas as microarquiteturas analisadas (Intel Skylake, Rocket Lake, Alder/Raptor/Arrow Lake e AMD Zen 2, Zen 3, Zen 4, Zen 5), as operações lógicas e aritméticas básicas atingiram o limite teórico de eficiência:

| Métrica | Valor |
|---------|-------|
| **Latência** | Consistentemente 1 ciclo |
| **Throughput** | Processadores como o Zen 5 possuem 6 ALUs inteiras, permitindo até 6 operações por ciclo. O Intel Arrow Lake mantém uma capacidade similar de despacho largo |

**Implicação para OP_COSTS**: Estas instruções devem ter o custo base unitário (1). A variação é desprezível.

### 2.2 Multiplicação Inteira (IMUL/MUL)

A multiplicação inteira, historicamente lenta, foi totalmente pipelinizada.

**Latência Padrão**: Em processadores Intel desde o Skylake até o Raptor Lake, e AMD desde o Zen 2 até o Zen 5, a multiplicação de 64 bits (IMUL r64) tem uma latência de **3 ciclos**.

**Variação Arquitetural**:
- **Intel Atom (Gracemont/E-cores)**: Em arquiteturas híbridas como Alder Lake e Raptor Lake, os E-cores mantêm uma latência competitiva de 3 ciclos para multiplicação, não representando um desvio significativo.
- **Zen 5**: Mantém a latência de 3 ciclos, mas com maior disponibilidade de portas de execução.

**Implicação para OP_COSTS**: Custo fixo de 3 ciclos é seguro e preciso para a maioria dos cenários.

### 2.3 O Grande Divisor: Divisão Inteira (IDIV)

A instrução **IDIV** é o componente mais problemático para a análise de WCET devido à sua implementação iterativa e dependência dos valores dos operandos. A evolução desta instrução mostra uma bifurcação drástica entre arquiteturas "Legacy" (como Skylake) e "Modernas" (Ice Lake/Zen 3 em diante).

#### 2.3.1 A Era da Alta Latência: Skylake e Zen 2

Nas arquiteturas mais antigas, a divisão não era totalmente pipelinizada e dependia de microcódigo ou divisores de radix baixo:

- **Intel Skylake (Client/Server)**: A divisão de 64 bits é notoriamente lenta e variável, variando de **35 a 88 ciclos** dependendo dos dados. O throughput é abismal, permitindo uma divisão a cada ~20-80 ciclos.
- **AMD Zen 2**: Apresenta latência variável baseada no tamanho dos operandos. Uma divisão de 64 bits pode custar entre **14 e 45 ciclos**.

#### 2.3.2 A Era da Baixa Latência: Zen 3, Zen 4, Zen 5 e Intel Core 11ª+

A partir do Intel Ice Lake (e desktop Rocket Lake) e AMD Zen 3, houve uma reformulação nas unidades de divisão, utilizando divisores de radix mais alto (processando mais bits por ciclo):

- **Intel Rocket Lake / Tiger Lake / Alder Lake (P-Cores)**: A latência caiu drasticamente para **14-18 ciclos** para 64 bits.
- **AMD Zen 3 / Zen 4 / Zen 5**: A AMD otimizou agressivamente este caminho. A latência típica para IDIV r64 é de **10 a 19 ciclos**. O Zen 5 mantém essa eficiência, focando em throughput.

#### 2.3.3 O Risco das Arquiteturas Híbridas (E-Cores)

Aqui reside uma armadilha crítica para o `tomc.js`. Em processadores como o i9-12900K ou i9-13900K (Alder/Raptor Lake), o thread pode ser agendado em um **E-core (Gracemont)**.

- **Latência em E-Cores**: A divisão de 64 bits em E-cores varia de **12 a 43 ciclos**. Embora o melhor caso seja rápido, o pior caso é mais que o dobro dos P-cores.

**Implicação para OP_COSTS**: Se o compilador não puder garantir afinidade de thread (pinning) em P-cores, o WCET deve considerar o pior caso dos E-cores ou das arquiteturas legadas (Skylake) se o suporte a hardware mais antigo for necessário.

#### Tabela 1: Análise Comparativa de Latência de Instruções Inteiras (Ciclos)

| Instrução | Skylake (Intel) | Rocket Lake (Intel) | Alder/Raptor Lake (P-Core) | Alder/Raptor Lake (E-Core) | Zen 2 (AMD) | Zen 3 (AMD) | Zen 4 / Zen 5 (AMD) |
|-----------|---|---|---|---|---|---|---|
| **ADD / SUB** | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **IMUL (r64)** | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| **IDIV (r32)** | 26 | 10–15 | 10–15 | 11–27 | 9–12 | 10–13 | 10–13 |
| **IDIV (r64)** | 35–88 | 14–18 | 14–18 | 12–43 | 14–45 | 10–19 | 11–19 |
| **LZCNT / TZCNT** | 3 | 3 | 3 | 3 | 1 | 1 | 1 |
| **POPCNT** | 3 | 3 | 3 | 3 | 1 | 1 | 1 |

**Fontes**: Intel Optimization Reference Manual, AMD Zen 4 / Zen 5 Technical Documentation

---

## 3. Ponto Flutuante e a Complexidade da Precisão Numérica

Para aplicações científicas ou gráficas compiladas via `tomc.js`, o custo de ponto flutuante (FP) é onipresente. As arquiteturas modernas tratam FP quase exclusivamente via extensões vetoriais escalares (SSE/AVX), abandonando a pilha legada x87.

### 3.1 Adição e Multiplicação Escalar (ADDSS, MULSS)

A latência de operações básicas de ponto flutuante diminuiu ligeiramente nas gerações recentes:

- **Intel Skylake**: Latência padrão de **4 ciclos** para ADDSS, ADDSD, MULSS, MULSD.
- **AMD Zen 2 / Zen 3 / Zen 4**: Reduziu a latência de adição para **3 ciclos**, mantendo a multiplicação em **3 ciclos**.
- **Intel Ice Lake / Rocket Lake / Raptor Lake**: Acompanhou a redução, oferecendo latências de **2-3 ciclos** para adição e **3-4 ciclos** para multiplicação em P-cores.

### 3.2 O Custo Oculto dos Denormais (Subnormals)

Um fator crítico para o WCET em ponto flutuante é o tratamento de **números denormais** (valores extremamente próximos de zero, menores que a menor magnitude representável normalizada):

- **Penalidade de Microcódigo**: Em arquiteturas mais antigas ou em certas instruções, o encontro de um denormal pode acionar um **microcode assist**, uma rotina de software/firmware para tratar a precisão extra. Isso causa um flush do pipeline e pode custar mais de **150 ciclos**.

- **Evolução no Hardware**: Arquiteturas modernas (Zen 2+, Skylake+) tratam muitos casos de denormais em hardware, mas operações complexas (divisão, raiz quadrada) ainda podem sofrer penalidades significativas.

- **Estratégia de Custo**: Se o ambiente `tomc.js` não garantir o modo Flush-to-Zero (FTZ) ou Denormals-Are-Zero (DAZ), a `OP_COSTS` deve adicionar uma margem de segurança ou penalidade condicional para operações FP.

### 3.3 Divisão e Raiz Quadrada em Ponto Flutuante

Assim como no inteiro, estas são operações iterativas, mas implementadas em unidades de hardware dedicadas:

- **SQRT (Raiz Quadrada)**:
  - Skylake: **13–19 ciclos**
  - Zen 2/3/4: **14–20 ciclos**. A consistência é maior que no Intel antigo, mas a latência base é similar.

- **FDIV (Divisão)**:
  - Precisão Simples (SS): **~11 ciclos**
  - Precisão Dupla (SD): **~13–18 ciclos**

#### Tabela 2: Latência de Instruções de Ponto Flutuante (Ciclos)

| Instrução | Skylake | Rocket/Ice Lake | Alder/Raptor Lake | Zen 2 | Zen 3 / Zen 4 |
|-----------|---|---|---|---|---|
| **ADDSS / ADDSD** | 4 | 2–3 | 2–3 | 3 | 3 |
| **MULSS / MULSD** | 4 | 3–4 | 3–4 | 3 | 3 |
| **FMA (Fused)** | 4 | 4 | 4 | 5 | 4 |
| **DIVSS (Simples)** | 11 | 11–14 | 11–14 | 10–12 | 10–12 |
| **DIVSD (Dupla)** | 14 | 13–18 | 13–18 | 13–15 | 13–15 |
| **SQRTSS** | 13 | 12–16 | 12–16 | 14–18 | 14–18 |

**Fontes**: Intel Optimization Reference Manual, AgnerFog's Instruction Tables

---

## 4. A Revolução e o Custo do SIMD (Vector Instructions)

A vetorização (SIMD) é essencial para performance, mas introduz comportamentos térmicos e de frequência que complicam o cálculo de WCET.

### 4.1 AVX2 e a Questão do "Double-Pumping"

O suporte a instruções de 256 bits (AVX2) varia na implementação física:

- **Intel (Skylake em diante)**: Possui unidades nativas de 256 bits. Latência de ADDPS (256-bit) é **4 ciclos**.

- **AMD Zen 2**: Implementava AVX2 via **"double-pumping"** — executando uma instrução de 256 bits como duas micro-operações de 128 bits. Isso dobrava o uso da porta de execução, efetivamente dobrando o custo de throughput, embora a latência nominal permanecesse competitiva.

- **AMD Zen 3 / Zen 4**: Passou para unidades nativas de 256 bits, eliminando a penalidade de throughput e igualando-se à Intel em IPC vetorial.

### 4.2 AVX-512 e a "Licença para Matar" (Frequency Throttling)

O conjunto de instruções **AVX-512** apresenta um desafio único para o Live Budget:

- **O Fenômeno do Downclock**: Em processadores Intel Skylake-X e Ice Lake (Client), a execução de instruções pesadas de 512 bits aciona uma redução agressiva na frequência de clock do núcleo (e às vezes de todos os núcleos) para proteger o chip de danos térmicos/elétricos. Isso significa que, embora a instrução termine em poucos ciclos, cada ciclo dura mais tempo em nanossegundos (**"License to Kill Latency"**).

- **Zen 4**: Suporta AVX-512, mas utiliza a técnica de **"double-pumping"** (2x 256-bit). A vantagem crucial aqui é que isso não causa o downclock severo visto na Intel. O custo em ciclos é maior (throughput menor), mas a frequência do sistema permanece estável, tornando o WCET mais previsível.

- **Zen 5**: Introduz um datapath completo de 512 bits, dobrando o throughput de vetores em relação ao Zen 4 e competindo diretamente com implementações de servidor da Intel, sem as penalidades severas de frequência das gerações antigas.

---

## 5. O Subsistema de Memória: O Grande Equalizador

Para o `tomc.js`, o custo de acesso à memória é a variável mais volátil. Enquanto uma operação de ALU custa 1 ciclo, um cache miss pode custar centenas. A topologia do processador (Chiplets vs Monolítico) desempenha um papel fundamental aqui.

### 5.1 Latências da Hierarquia de Cache (L1, L2, L3)

A latência de cache é a primeira linha de defesa contra a lentidão da RAM:

- **L1 Cache (32KB-48KB)**: Extremamente rápido
  - Intel: Tipicamente **4-5 ciclos** para cargas simples. Endereçamento complexo adiciona 1 ciclo.
  - AMD (Zen 2-5): **4 ciclos** padrão.

- **L2 Cache (512KB-2MB)**: O tamanho do L2 cresceu, aumentando ligeiramente a latência
  - Skylake: **~12 ciclos**
  - Zen 3/4: **~14 ciclos**
  - Raptor Lake / Arrow Lake: Com L2 de 2MB por núcleo, a latência subiu para **~16 ciclos**, uma troca aceitável pela maior taxa de acerto (Hit Rate).

- **L3 Cache (Last Level Cache)**: A topologia define o custo
  - Intel Monolítico (Skylake/Rocket): **~42-44 ciclos**
  - AMD Zen 2: Design de CCX dividido. Acesso local **~40 ciclos**; acesso remoto (outro CCX) penalizava severamente.
  - AMD Zen 3/4: Unificou o L3 por CCD (8 núcleos). Latência de **~46-50 ciclos**, eliminando a penalidade intra-chiplet.
  - Intel Arrow Lake: A desagregação dos tiles (Tile-based architecture) introduziu latências de anel (Ring Bus) e L3 mais altas, reportadas acima de **80 ciclos** em testes preliminares, afetando negativamente a performance em jogos e latência sensível.

### 5.2 Latência da Memória Principal (DRAM) e o Conflito DDR4 vs. DDR5

A transição para DDR5 trouxe largura de banda, mas aumentou a latência CAS absoluta em ciclos:

**Conversão para Ciclos**: Para a tabela `OP_COSTS`, a latência em nanossegundos (ns) deve ser convertida para ciclos do processador.

$$\text{Ciclos} = \text{Latência\_ns} \times \text{Frequência\_GHz}$$

**Cenários Típicos**:
- **DDR4 (Zen 2/3, Skylake)**: Latência de sistema ~50-60ns. Em 4GHz → **200-240 ciclos**
- **DDR5 (Zen 4/5, Raptor/Arrow Lake)**: Latência de sistema ~70-90ns. Em 5GHz → **350-450 ciclos**

**O Problema do Arrow Lake**: Devido à controladora de memória estar em um tile separado (SoC Tile), a latência de memória observada pode ultrapassar 100ns (ou até 180ns em casos de má otimização de BIOS), resultando em um custo massivo de **500+ ciclos** por miss.

### 5.3 Falha de Encaminhamento Store-to-Load (STLF)

Um caso de borda crítico para compiladores: se um load tenta ler dados recém-escritos por um store com alinhamento ou tamanho incompatível, o store buffer não consegue encaminhar o dado. O load deve esperar o store ser comitado no cache L1.

**Penalidade**: **~10-20 ciclos** adicionais. O `tomc.js` deve ser cauteloso com type-punning ou acessos desalinhados.

#### Tabela 3: Latência do Subsistema de Memória (Ciclos Estimados @ ~4-5GHz)

| Nível Hierárquico | Skylake | Raptor Lake | Zen 2 | Zen 3 / Zen 4 | Arrow Lake (Est.) |
|---|---|---|---|---|---|
| **L1 Load** | 4 | 5 | 4 | 4 | 5 |
| **L2 Load** | 12 | 16 | 14 | 14 | 16+ |
| **L3 Load** | 42 | 50–60 | 40 (local) | 46–50 | 70-80+ |
| **RAM (Miss)** | ~200 | ~350 (DDR5) | ~220 (DDR4) | ~300 (DDR5) | 400–500+ |

**Fontes**: Agner Fog's Instruction Tables, Intel/AMD Datasheets

---

## 6. Controle de Fluxo: O Custo da Incerteza

Em códigos complexos, a latência das instruções ALU é irrelevante comparada ao custo de errar uma **previsão de desvio (Branch Misprediction)**. O processador executa especulativamente; quando erra, deve descartar todo o trabalho e recomeçar.

### 6.1 Profundidade do Pipeline e Penalidade

A penalidade é proporcional à profundidade do pipeline (quantos estágios a instrução percorreu antes do erro ser detectado):

- **Skylake**: Pipeline de **~14-19 estágios**. Penalidade: **~16-20 ciclos**
- **Zen 2**: **~19 estágios**. Penalidade: **~18 ciclos**
- **Zen 3 / Zen 4**: Embora tenham preditores de desvio muito mais precisos (TAGE/ITTAGE), a estrutura interna profunda mantém a penalidade alta, em torno de **19-20 ciclos**
- **Arrow Lake / Raptor Lake**: A altas frequências, a penalidade em ciclos permanece na faixa de **15-20 ciclos**, mas o impacto temporal é mitigado pelo clock alto.

### 6.2 Desvios Indiretos

Desvios indiretos (chamadas de função virtual, switch cases grandes) são historicamente difíceis:

- **Zen 5**: Introduz um preditor **"2-ahead"**, capaz de prever dois desvios à frente, aumentando o throughput de branches tomados. Isso reduz a frequência de erros, mas não o custo do erro em si.

---

## 7. Arquiteturas Híbridas e Heterogêneas: O Novo Desafio

A introdução de arquiteturas híbridas pela Intel (Big.LITTLE no x86) com Alder Lake, Raptor Lake e Arrow Lake cria uma bifurcação no modelo de custos. O `tomc.js` não pode assumir que está rodando em um núcleo de alta performance (P-core).

### P-Cores (Performance)
- Otimizados para latência e execução especulativa agressiva
- Baixa latência em divisões e acesso à memória

### E-Cores (Efficiency)
- Otimizados para área e throughput
- **Divisão Inteira**: Muito mais lenta (~2x a 3x latência dos P-cores)
- **Latência de Memória**: Frequentemente maior devido à topologia de anel e caches menores

**Implicação**: Se o thread do `tomc.js` migrar para um E-core, o orçamento de tempo real calculado para um P-core será violado imediatamente. O WCET deve considerar o E-core como o "Pior Caso" arquitetural moderno.

---

## 8. Síntese de Dados e Construção da Tabela OP_COSTS

Com base na pesquisa exaustiva, apresento a estratégia consolidada para popular a `OP_COSTS`. Os valores são normalizados em ciclos de CPU, representando uma estimativa conservadora (segura) compatível com o Pior Caso em hardware moderno (considerando Zen 2 e E-cores como limitantes).

### 8.1 Estratégia "Híbrida Segura" (Hybrid Safe)

A tabela a seguir assume que o código pode rodar em qualquer microarquitetura moderna discutida. O custo escolhido é o maior entre as arquiteturas relevantes para evitar estouro de orçamento.

### 8.2 Tabela Mestra de Custos Recomendados (OP_COSTS)

| Classe de Instrução | Custo Recomendado (Ciclos) | Justificativa do Pior Caso (Driver) |
|---|---|---|
| **Nops / Zero-latency** | 0 | Renomeação no front-end (e.g., XOR EAX, EAX) |
| **Int Simples (ADD, SUB, AND)** | 1 | Universalmente 1 ciclo. Throughput alto |
| **Int Complexo (MUL, LEA)** | 3 | Latência padrão Zen/Skylake |
| **Divisão Int (32-bit)** | 26 | Baseado no legado Skylake. Modernos são ~12 |
| **Divisão Int (64-bit)** | 60 | Compromisso entre Skylake (88) e Zen 2 (45). Valor seguro para evitar underestimation |
| **Load (L1 Hit)** | 5 | Latência conservadora (Zen/Intel) |
| **Store** | 4 | Latência de visibilidade |
| **Load (RAM / Miss)** | 400 | Penalidade DDR5 + Latência Arrow Lake + Margem de segurança |
| **FP Add/Mul (Escalar)** | 5 | Latência FMA Zen 2 / Skylake |
| **FP Div (Double)** | 20 | Latência típica de FDIV |
| **FP Sqrt** | 24 | Ligeiramente maior que DIV |
| **Branch (Not Taken)** | 1 | Custo zero/baixo se previsto corretamente |
| **Branch (Miss/Taken)** | 20 | Penalidade de misprediction Zen 3 / Raptor Lake |
| **SIMD Float Add (AVX2)** | 6 | Considera throughput reduzido (double-pumping) do Zen 2 |
| **SIMD Float Div (AVX2)** | 24 | Alta latência, não pipelinizada em algumas uarchs |

### 8.3 Recomendação de Implementação para o tomc.js

Dado que a latência de memória (RAM) é variada e massiva (400 ciclos vs 4 ciclos de L1), recomenda-se que a `OP_COSTS` trate operações de memória com um **Custo Dinâmico** ou **Custo Estático Elevado**.

**Abordagem Estática**: Atribuir 20 ciclos a cada LOAD. Isso superestima hits L1, mas cria uma "poupança" para pagar os ocasionais misses de RAM.

**Abordagem de Perfil**: Se o `tomc.js` suportar **profile-guided optimization (PGO)**, identifique cargas com alta taxa de miss e aplique o custo de 400 ciclos apenas a elas.

---

## Conclusão

Esta análise fornece os dados brutos e o contexto arquitetural necessário para transformar a `OP_COSTS` de uma lista de palpites em uma ferramenta de precisão para sistemas de tempo real.

---

# Relatório de Pesquisa: Implementação de Calibração de Runtime Consciente de Hardware e Orçamentação Dinâmica em Node.js

## 1. Introdução e Contextualização do Problema

No cenário contemporâneo de desenvolvimento de software de alta performance, especialmente em aplicações de servidores de jogos, simulações físicas em tempo real e processamento de dados massivos, a abstração de hardware fornecida por ambientes de execução gerenciados, como o Node.js, apresenta um paradoxo fundamental.

Por um lado, a **"opacidade do hardware"** — a capacidade do runtime V8 de isolar o desenvolvedor das complexidades do conjunto de instruções e da gestão de memória — acelera significativamente o ciclo de desenvolvimento e garante a compatibilidade entre plataformas.

Por outro lado, essa mesma abstração oculta as disparidades abismais de desempenho que existem entre a estação de trabalho de alto nível do desenvolvedor e o vasto espectro de ambientes de implantação, que variam desde laptops de entrada e servidores legados até dispositivos portáteis especializados como o Steam Deck e consoles de próxima geração baseados em arquitetura ARM.

A premissa deste relatório é estabelecer uma arquitetura robusta para o **"tomc.js" (Task Optimization & Microarchitecture Calibration)**, um sistema projetado para perfurar essa camada de abstração. O objetivo não é apenas identificar a CPU, mas compreender suas capacidades intrínsecas — sua microarquitetura, seu orçamento térmico implícito e seu throughput efetivo — para calibrar um **"Live Budget" (Orçamento Vivo)**.

Este orçamento atua como um regulador dinâmico da complexidade da aplicação, permitindo que o software escale sua fidelidade de simulação ou frequência de atualização em resposta direta às capacidades do silício subjacente, garantindo uma experiência consistente de taxa de quadros ou latência de resposta, independentemente do hardware.

A necessidade de tal sistema é exacerbada pela **fragmentação do ecossistema x86 e ARM**. A simples leitura da "velocidade do clock" tornou-se uma métrica enganosa. Um núcleo "Jaguar" de 1.6 GHz em um console da geração passada possui um desempenho por ciclo (IPC) radicalmente inferior a um núcleo "Zen 2" de mesma frequência em um dispositivo portátil moderno. Além disso, a introdução de topologias híbridas, como os processadores Intel de 12ª geração (Alder Lake) com núcleos de Performance (P-cores) e Eficiência (E-cores), introduz uma variabilidade de desempenho estocástica dependendo de onde o sistema operacional decide agendar a thread do Node.js.

Este relatório detalha a metodologia para implementar a detecção automática dessas nuances, combinando análise estática de assinaturas CPUID com calibração dinâmica via micro-benchmarking sintético.

---

## 2. Fundamentos da Heterogeneidade Microarquitetural

Para implementar uma detecção eficaz, é imperativo compreender primeiro o que diferencia as microarquiteturas e por que a identificação puramente baseada no nome do modelo é insuficiente.

A performance de um processador é governada pela equação fundamental:

$$\text{Desempenho} = \text{Frequência} \times \text{IPC} \times \text{Contagem de Núcleos}$$

Enquanto a frequência e a contagem de núcleos são facilmente consultáveis, o **IPC (Instruções Por Ciclo)** é uma propriedade intrínseca da microarquitetura que dita a eficiência do processamento.

### 2.1 A Evolução do IPC e o Impacto no Node.js

O runtime do Node.js, sendo single-threaded em seu loop de eventos principal, é desproporcionalmente sensível ao desempenho de um único núcleo (**single-thread performance**). A evolução do IPC nas últimas décadas mostra que processadores com frequências nominais idênticas podem ter disparidades de desempenho superiores a 50%.

#### 2.1.1 O Legado da Intel: De Skylake a Golden Cove

Durante um longo período, a Intel manteve a microarquitetura "Skylake" (14nm) como base para múltiplas gerações de processadores (6ª a 10ª geração em desktops), resultando em um estagnação do IPC onde os ganhos vinham apenas de clocks mais altos.

Para o desenvolvedor Node.js, isso significa que um código otimizado para um i7-6700K rodará de forma muito semelhante em um i9-9900K se a frequência for normalizada, permitindo agrupar essas CPUs em uma única "Classe de IPC".

No entanto, a transição para arquiteturas mais recentes como "Cypress Cove" (11ª Gen) e "Golden Cove" (12ª Gen P-Cores) trouxe **saltos de IPC de aproximadamente 19%**, alterando fundamentalmente o "Live Budget" disponível para cada tick de simulação.

A detecção precisa deve distinguir entre um "Comet Lake" (10ª Gen) e um "Rocket Lake" (11ª Gen), apesar de ambos poderem operar nas mesmas frequências.

#### 2.1.2 A Revolução Zen da AMD

No lado da AMD, a nomenclatura "Ryzen" abrange quatro microarquiteturas distintas com perfis de desempenho radicalmente diferentes.

- **Zen 1**: Focou em contagem de núcleos, mas sofria em latência de memória e IPC single-thread, prejudicando o desempenho em workloads sensíveis à latência como servidores de jogos em Node.js.
- **Zen 3** (Série 5000): Unificou o cache L3, reduzindo drasticamente a latência de comunicação entre núcleos e elevando o IPC em cerca de **19%** sobre o Zen 2.

Um sistema de "Live Budget" que não diferencie um Ryzen 7 2700 (Zen+) de um Ryzen 7 5800X (Zen 3) alocará recursos de forma ineficiente, subutilizando o segundo ou sobrecarregando o primeiro.

### 2.2 O Desafio das Arquiteturas Híbridas

A introdução de processadores híbridos x86, seguindo a filosofia big.LITTLE da ARM, cria um cenário onde a "capacidade da CPU" não é mais uma constante, mas uma variável dependente do agendamento.

Em um processador Intel Core i9-12900K, a execução de um script Node.js em um **P-core** oferece desempenho máximo, enquanto a migração para um **E-core (Gracemont)** pode reduzir o throughput em 40% ou mais, assemelhando-se ao desempenho de processadores de várias gerações anteriores.

O `tomc.js` deve, portanto, não apenas detectar o modelo da CPU, mas idealmente monitorar ou influenciar a afinidade da thread para garantir que o "Live Budget" calculado corresponda ao núcleo onde o código está efetivamente sendo executado.

---

## 3. Metodologias de Detecção Estática: Mapeamento de CPUID

A detecção estática é o processo de identificar a microarquitetura do processador através de consultas diretas ao hardware, sem executar carga de trabalho. Este é o primeiro passo para calibrar o Live Budget, fornecendo uma **"linha de base teórica"**.

### 3.1 Limitações da API Padrão do Node.js

O módulo nativo `os` do Node.js oferece o método `os.cpus()`, que retorna um array de objetos contendo informações sobre cada núcleo lógico. Embora útil, a propriedade `model` retorna apenas a string de marca comercial (Brand String), como `"Intel(R) Core(TM) i7-8550U CPU @ 1.80GHz"`.

Esta string apresenta diversas limitações críticas para uma detecção precisa:

- **Ambiguidade de Geração**: Em algumas linhas de produtos, especialmente Xeons e chips móveis, a string de marca pode não revelar explicitamente a geração da microarquitetura sem uma tabela de consulta (Lookup Table - LUT) exaustiva e complexa análise de regex.

- **Frequência Enganosa**: O campo `speed` retornado pelo `os.cpus()` frequentemente reflete o clock base ou o clock atual no momento da chamada, que pode estar em estado de economia de energia (e.g., 800 MHz), não representando a capacidade de pico do processador sob carga (Turbo Boost).

- **Falta de Detalhes de Recursos**: A string não confirma a presença de conjuntos de instruções específicos como AVX2, AVX-512 ou BMI2, que são vitais para otimizar operações matemáticas intensivas no `tomc.js`.

### 3.2 Implementação de Acesso Nativo ao CPUID

Para superar as limitações do `os` module, o `tomc.js` deve implementar ou utilizar bindings nativos (C++) para executar a instrução assembly **CPUID**. Esta instrução, disponível em processadores x86, permite consultar diretamente os registradores do processador para obter a Família, Modelo e Stepping (FMS), que constituem a "impressão digital" exata do silício.

#### 3.2.1 Decodificando a Assinatura FMS

A execução de CPUID com EAX=1 retorna nos registradores EAX uma estrutura de bits que deve ser decodificada:

- **Family ID (Bits 8-11)**: Identifica a "família" macro da arquitetura (e.g., Família 6 para a maioria das CPUs Intel modernas, Família 23/25 para AMD Zen).

- **Model ID (Bits 4-7) + Extended Model ID (Bits 16-19)**: Estes campos combinados formam o identificador do modelo, que distingue, por exemplo, um núcleo "Skylake" (Modelo 94 ou 0x5E) de um núcleo "Ice Lake" (Modelo 126 ou 0x7E).

- **Stepping ID (Bits 0-3)**: Indica a revisão do silício, útil para identificar correções de hardware específicas (como mitigações de Spectre).

O `tomc.js` deve manter uma tabela de mapeamento interna (hash map) que correlaciona estas tuplas `(Vendor, Family, Model)` com nomes de microarquitetura legíveis (e.g., `INTEL_ALDER_LAKE`, `AMD_ZEN_3`).

#### Tabela de Mapeamento CPUID

| Vendor | Family | Model (Hex) | Microarquitetura | Notas |
|--------|--------|---|---|---|
| GenuineIntel | 6 | 0x5E | Skylake (Client) | Base para 6ª Gen |
| GenuineIntel | 6 | 0x8E | Kaby Lake / Coffee Lake | Otimizações 14nm |
| GenuineIntel | 6 | 0x9E | Coffee Lake Refresh | Mitigações de Hardware |
| GenuineIntel | 6 | 0xA7 | Rocket Lake | Backport de 10nm para 14nm |
| GenuineIntel | 6 | 0x97 | Alder Lake | Híbrido (P+E Cores) |
| AuthenticAMD | 23 | 0x01 | Zen 1 | Ryzen 1000 |
| AuthenticAMD | 23 | 0x31 | Zen 2 | Ryzen 3000 / Steam Deck |
| AuthenticAMD | 25 | 0x21 | Zen 3 | Ryzen 5000 |

#### 3.2.2 Detecção de Topologia Híbrida (Leaf 0x1A)

Para processadores Intel modernos, é crucial determinar se a CPU é híbrida. A execução de CPUID com EAX=0x1A (Hybrid Information Leaf) fornece essa informação.

O registrador EAX (bits 24-31) retorna o tipo de núcleo:
- `0x20` para Intel Atom (E-core)
- `0x40` para Intel Core (P-core)

O `tomc.js` pode usar essa informação para criar perfis de orçamento distintos dependendo de qual núcleo a thread está executando, embora a migração de threads pelo SO torne isso dinâmico.

### 3.3 Parsing Heurístico de Strings

Em ambientes onde módulos nativos não podem ser compilados ou executados (como certas restrições de PaaS), o fallback para análise de string (Regex) é necessário. A estratégia de parsing deve ser hierárquica:

1. **Extração de SKU**: Isolar a sequência numérica após os identificadores de marca (i3, i5, Ryzen 5, etc.).

2. **Determinação de Geração**:
   - **Intel**: Identificar o prefixo numérico (e.g., 13 em i9-13900K indica 13ª geração/Raptor Lake).
   - **AMD**: Identificar o milhar (e.g., 5 em Ryzen 5600 indica Série 5000). Cuidado especial com a série móvel, onde a série 5000 contém tanto Zen 2 (5500U) quanto Zen 3 (5600U). Uma LUT específica para SKUs móveis é obrigatória para precisão.

3. **Análise de Sufixo de Potência**: Suffixos como U, Y (Intel) ou e (AMD) indicam restrições térmicas severas (TDP < 15W). O Live Budget deve aplicar um **"fator de penalidade"** (e.g., 0.7x ou 0.8x) ao orçamento base detectado, antecipando o throttling térmico que não aparecerá em um benchmark curto.

---

## 4. Calibração Dinâmica: A Ciência do Micro-Benchmarking

A detecção estática fornece o "teto teórico" do hardware. No entanto, ela não consegue capturar o estado momentâneo do sistema: o processador está sofrendo throttling térmico? Existe um antivírus consumindo 30% dos ciclos em background? O sistema está em modo de economia de energia?

Para responder a essas perguntas e calibrar o "Live Budget" com precisão, o `tomc.js` deve implementar uma etapa de **Dynamic Calibration**.

### 4.1 Desafios de Benchmarking em Ambientes JIT (V8)

Criar benchmarks em JavaScript é notoriamente difícil devido à natureza adaptativa do compilador JIT (Just-In-Time) do V8 (TurboFan e Ignition). Um benchmark mal construído pode ser otimizado para zero (Dead Code Elimination) ou apresentar resultados inconsistentes devido a transições de "Hidden Classes" ou desotimizações.

#### 4.1.1 Aquecimento (Warm-up) e Tiering-up

O V8 utiliza um pipeline de compilação em estágios. O código começa sendo interpretado (Ignition) e, se executado frequentemente ("hot"), é compilado para código de máquina otimizado (TurboFan).

Um benchmark de calibração deve incluir uma **fase de "warm-up" obrigatória** — executar o loop de teste por pelo menos 100ms sem medir o tempo — para garantir que o código medido seja a versão otimizada, refletindo o desempenho real da aplicação em regime estacionário.

#### 4.1.2 Prevenção de Dead Code Elimination (DCE)

Compiladores modernos são excelentes em identificar código que não produz efeitos colaterais. Um loop que realiza cálculos complexos mas não retorna ou utiliza o resultado pode ser inteiramente removido.

**Estratégia**: O `tomc.js` deve acumular os resultados de cada iteração em uma variável externa ao escopo do loop ou usar operações bitwise (`^=`) para combinar resultados, garantindo que o compilador não possa prever o resultado final sem executar as instruções.

### 4.2 Arquitetura do Loop de Calibração

O benchmark deve ser composto por testes sintéticos que mimetizem a carga de trabalho real do "Live Budget" (e.g., física, IA, processamento de entidades).

#### 4.2.1 Teste de Throughput Inteiro (ALU)

Simula lógica de jogo, máquinas de estado e manipulação de bits.

```javascript
// Exemplo conceitual de loop de calibração ALU
function benchmarkALU(iterations) {
    let acc = 0;
    for (let i = 0; i < iterations; i++) {
        // Xorshift simplificado para gerar carga inteira e dependência de dados
        acc ^= (acc << 13);
        acc ^= (acc >>> 17);
        acc ^= (acc << 5);
        acc = (acc + i) | 0; // Força operação 32-bit integer
    }
    return acc;
}
```

Este teste estressa a unidade lógico-aritmética e a capacidade de previsão de saltos (branch prediction) se condicionais forem adicionadas.

#### 4.2.2 Teste de Ponto Flutuante (FPU/SIMD)

Simula física, colisões e transformações espaciais. Embora o JavaScript use double (64-bit) por padrão, o V8 pode utilizar instruções SIMD (AVX/SSE) para otimizar operações matemáticas.

**Implementação**: Multiplicação de matrizes ou cálculos de vetores (produto escalar/vetorial). Evitar funções transcendentais complexas (`Math.sin`, `Math.cos`) como base principal do benchmark, pois suas implementações podem variar drasticamente entre plataformas e versões de OS/Libc, introduzindo ruído não relacionado à capacidade bruta da CPU.

#### 4.2.3 Teste de Latência de Memória

Muitas cargas de trabalho modernas são **limitadas pela memória (memory-bound)** e não pela CPU. Um teste que percorre um `ArrayBuffer` grande (excedendo o tamanho típico do cache L3, e.g., > 64MB) de forma pseudo-aleatória ou linear pode medir a largura de banda efetiva da memória, crucial para dispositivos com memória unificada como o Steam Deck.

### 4.3 Medição e Normalização

A medição deve usar `performance.now()` (High Resolution Time) em vez de `Date.now()` para precisão de sub-milissegundos.

**Cálculo da Pontuação**: O resultado deve ser uma métrica de "Operações por Segundo" (OPS).

**Fator de Calibração** ($F_{cal}$): O OPS medido é comparado com uma "Máquina de Referência" (e.g., Intel i7-8700K = 1.0).

$$F_{cal} = \frac{OPS_{Medido}}{OPS_{Referencia}}$$

Este fator $F_{cal}$ será o multiplicador principal no Live Budget. Se a máquina do usuário for 50% tão rápida quanto a referência, o orçamento de entidades deve ser reduzido proporcionalmente.

---

## 5. O Framework "Live Budget": Modelagem Matemática

O "Live Budget" é a aplicação prática dos dados coletados. É um contrato de desempenho entre o motor do jogo/aplicação e o hardware. Diferente de um limite estático, ele respira com o sistema.

### 5.1 A Fórmula do Orçamento

O orçamento total disponível por frame (ou tick de simulação) pode ser modelado da seguinte forma:

$$\text{Budget}_{Total} \text{ (ms)} = T_{frame} - T_{overhead} - T_{gc\_reserva}$$

Onde:
- $T_{frame}$ é o tempo alvo do frame (e.g., 16.6ms para 60 FPS ou 33.3ms para 30 FPS).
- $T_{overhead}$ é o custo fixo do sistema (rendering, I/O).
- $T_{gc\_reserva}$ é uma margem de segurança para o Garbage Collector.

O número máximo de entidades ou complexidade permitida ($N_{max}$) é então derivado do fator de calibração:

$$N_{max} = N_{base} \times F_{cal} \times F_{thermal} \times F_{arch}$$

Onde:
- $N_{base}$: Número de entidades suportadas na máquina de referência.
- $F_{cal}$: Fator derivado do benchmark dinâmico (Seção 4.3)
- $F_{thermal}$: Fator de depreciação térmica. Se a CPU for detectada como modelo móvel ('U', 'Y') ou portátil (Steam Deck), este fator inicia em 1.0 mas pode decair para 0.8 ou 0.7 ao longo do tempo se o frame time começar a exceder o alvo consistentemente.
- $F_{arch}$: Multiplicador de eficiência arquitetural. CPUs mais novas (Zen 3, Golden Cove) podem ter um $F_{arch} > 1.0$ devido a melhores preditores de salto e caches maiores, permitindo que elas processem mais lógica por milissegundo do que CPUs antigas, mesmo com pontuações de benchmark sintético similares.

### 5.2 Estratégias de Escalonamento (Scaling)

Com base no $N_{max}$ calculado, o `tomc.js` deve orquestrar a degradação graciosa da aplicação:

| Nível de Orçamento | Fator (F_cal) | Ações de Adaptação |
|---|---|---|
| **Ultra** | > 1.2 | Física em alta precisão, IA com árvores de comportamento complexas, partículas completas |
| **Padrão** | 0.8 - 1.2 | Configuração base. Física padrão |
| **Econômico** | 0.5 - 0.8 | Redução da taxa de tick de IA (update a cada 2 frames), física simplificada (apenas bounding box) |
| **Crítico ("Potato")** | < 0.5 | Física desabilitada para objetos decorativos, IA mínima, redução de cap de entidades |

### 5.3 O Loop de Feedback (Budget Control Loop)

A calibração inicial não é suficiente. O sistema deve monitorar o tempo real gasto em cada frame (`frameTime`). Se `frameTime > Budget_{Total}` por X frames consecutivos, o sistema deve acionar um evento de **"Throttle"**, reduzindo dinamicamente o $N_{max}$ (reduzindo $F_{thermal}$), assumindo que o hardware está sob estresse térmico ou competindo por recursos.

---

## 6. Arquitetura Híbrida e o Problema do Escalonamento (P-Cores vs E-Cores)

A heterogeneidade introduzida pelos processadores Intel de 12ª geração em diante (Alder Lake, Raptor Lake) e designs ARM big.LITTLE apresenta um risco crítico para aplicações Node.js: a **inconsistência de desempenho baseada na thread**.

### 6.1 O Fenômeno da Migração de Thread

O agendador do SO (Windows 11 Scheduler ou Linux Kernel 5.18+) tenta alocar tarefas de background em E-cores e tarefas de foreground em P-cores. No entanto, threads de `worker_threads` do Node.js ou tarefas assíncronas no pool do libuv podem ser inadvertidamente classificadas como "background" e movidas para E-cores, resultando em uma queda súbita de desempenho que viola o "Live Budget" calculado.

### 6.2 Estratégias de Mitigação no tomc.js

**Afinidade de CPU (CPU Affinity/Pinning)**: O `tomc.js` deve oferecer a capacidade de "pinar" processos críticos. Utilizando bibliotecas nativas ou chamadas de sistema (como `sched_setaffinity` no Linux ou APIs do Windows), a aplicação pode solicitar explicitamente execução nos núcleos P.

**Detecção de Máscara**: O sistema deve identificar quais IDs lógicos correspondem aos P-cores. Em sistemas Intel híbridos, os P-cores geralmente ocupam os primeiros índices lógicos (e.g., 0-15 em um i9-12900K) e suportam Hyper-Threading, enquanto E-cores estão nos índices superiores e não têm HT.

**Algoritmo**: Se Detectado_Hibrido E Plataforma_Linux, ler `/sys/devices/cpu_core/cpus` para obter a máscara dos P-cores e aplicar afinidade à thread principal do Node.js.

**Orçamento Conservador em Híbridos**: Se a afinidade não puder ser garantida, o Live Budget deve ser calculado assumindo o "Pior Caso" (E-core) ou uma média ponderada, para evitar gagueiras (stuttering) se a thread for migrada.

---

## 7. Estudos de Caso e Perfil de Hardware Alvo

A eficácia do `tomc.js` depende de sua capacidade de lidar com perfis de hardware específicos que são comuns no mercado atual.

### 7.1 Steam Deck (Arquitetura Van Gogh - Zen 2)

O Steam Deck da Valve é um alvo primário para jogos e aplicações interativas em Node.js/Electron.

- **Perfil**: CPU Zen 2, 4 Cores / 8 Threads, Clock 2.4-3.5 GHz.
- **Análise de Budget**: Apesar de ser "Zen 2" (uma arquitetura de desktop capaz), o envelope térmico de 15W é compartilhado com a GPU. Sob carga gráfica pesada, a CPU raramente sustentará 3.5 GHz.
- **Estratégia tomc.js**: Detectar a string "AMD Custom APU 0405". Aplicar um $F_{thermal}$ preventivo de 0.8x. O benchmark dinâmico deve confirmar se a CPU está livre ou sufocada pela GPU. A memória é LPDDR5 quad-channel, oferecendo alta largura de banda, favorecendo testes de memória.

### 7.2 Nintendo Switch 2 (Especulativo - NVIDIA T239)

Baseado em vazamentos confiáveis, o sucessor do Switch usará um SoC NVIDIA T239 com núcleos ARM Cortex-A78C.

- **Perfil**: 8 Cores ARM Cortex-A78C. Arquitetura eficiente, mas clocks baixos (~1-2 GHz esperados).
- **Comparação**: O Cortex-A78C tem um IPC respeitável, comparável a CPUs de desktop Skylake em certas cargas, mas opera a frequências muito menores.
- **Estratégia tomc.js**: A detecção provavelmente indicará arquitetura aarch64. O desafio será diferenciar do Switch original (Tegra X1 / Cortex-A57). O benchmark de ponto flutuante será crucial aqui, pois a unidade FPU do A78 é significativamente mais robusta que a do A57. O Live Budget deve ser configurado para alta paralelelização (8 cores disponíveis) mas baixo throughput por thread.

### 7.3 PC de Baixo Custo ("Potato PC")

Muitos usuários tentam rodar aplicações em laptops antigos com gráficos integrados e CPUs dual-core (e.g., Celeron N4000).

**Estratégia**: Se a detecção estática encontrar "Celeron", "Pentium" ou clocks base < 2.0 GHz combinados com falta de AVX, o sistema deve entrar automaticamente no modo "Low-End", desativando sistemas não essenciais antes mesmo de rodar o benchmark, para garantir que a aplicação ao menos inicialize.

---

## 8. Arquitetura de Implementação do tomc.js

A implementação do `tomc.js` deve ser modular, separando a detecção dependente de plataforma da lógica de negócios de calibração.

### 8.1 Estrutura do Módulo

O módulo deve expor uma API simples, escondendo a complexidade da detecção:

```javascript
// Exemplo de API
import { HardwareInspector, LiveBudget } from 'tomc.js';

async function init() {
    const hardwareProfile = await HardwareInspector.detect();
    console.log(`Hardware Detectado: ${hardwareProfile.microarchitecture} (${hardwareProfile.coreConfig})`);

    const calibrationScore = await HardwareInspector.calibrate();
    LiveBudget.initialize(hardwareProfile, calibrationScore);

    console.log(`Fator de Escala: ${LiveBudget.getScalingFactor()}`);
}
```

### 8.2 Componentes Internos

**NativeBinding (C++/N-API)**:
- Função `getCPUID(eax, ecx)`: Executa a instrução ASM e retorna os registradores.
- Função `getAffinity()`: Retorna a máscara de afinidade atual.
- Função `setAffinity(mask)`: Tenta fixar a thread a núcleos específicos.

**ArchParser**:
- Contém as LUTs (Look-up Tables) para Intel Family 6 e AMD Family 23/25.
- Lógica de Regex para fallback de string model name.

**SyntheticBench**:
- Implementa loops de teste para ALU, FPU e Memória.
- Controla o tempo de execução usando `perf_hooks` (Node.js) para precisão.
- Executa em Worker Thread isolada para não bloquear o loop de eventos principal durante a inicialização, se possível, ou executa em fatias de tempo (time-slicing) no main thread.

### 8.3 Tratamento de Segurança e Privacidade

A coleta de dados granulares de CPU pode ser usada para **"fingerprinting"** (rastreamento de usuários). O `tomc.js` deve ser projetado para uso ético, idealmente em aplicações instaladas ou servidores controlados pelo usuário.

Se usado em um contexto web/distribuído, deve-se considerar anonimizar os dados brutos de CPUID antes de enviá-los para telemetria, mantendo apenas a **"Classe de Performance"** (e.g., "High-End Desktop 2022").

---

## 9. Conclusão

A implementação do `tomc.js` para calibração de Live Budget representa uma evolução necessária no desenvolvimento de aplicações Node.js de alto desempenho. Ao abandonar a suposição de homogeneidade de hardware e abraçar a realidade heterogênea do silício moderno, desenvolvedores podem entregar experiências mais robustas e fluidas.

A combinação de **Detecção Estática** (para entender o potencial teórico e a arquitetura) com **Calibração Dinâmica** (para medir a capacidade efetiva momentânea) oferece a única defesa viável contra a variabilidade introduzida por tecnologias como throttling térmico e escalonamento híbrido.

Este sistema transforma o Node.js de um runtime passivo em um **orquestrador ativo**, capaz de negociar recursos com o hardware para maximizar a utilidade da aplicação para o usuário final, seja ele um jogador em um Steam Deck ou um analista processando dados em um servidor Xeon.
