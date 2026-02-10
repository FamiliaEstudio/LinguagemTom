# LinguagemTom
Linguagem de programação brasileira do Pipim Studios
https://docs.google.com/document/d/1BKKPbTfWUxLySt-RUWz_zM-K9jHbEtoUR-tEPRoUowY/edit?usp=sharing
<img width="1008" height="1024" alt="image" src="https://github.com/user-attachments/assets/3d5b30aa-bde5-47cf-a3d2-cab1d96caf81" />

Para consulta dos Agentes

Paradigma: Imperativo, Baixo Nível, Orientado a Performance. Filosofia: "Código de Barras Legível" – Instruções lineares, tipagem explícita e controle manual de memória.
1. Sistema de Tipos Numéricos
A linguagem exige declaração explícita de sinal e tamanho de bits.
Sintaxe Base: [Operação]xy[Tipo][Modo][Bits]x[Val1]y[Val2]
Inteiros: In + Sd (Signed) ou Ud (Unsigned) + 32 ou 64.
Ex: SomarxyInSd32... (Soma Int 32 com sinal)
Ex: DividxyInUd64... (Divisão Int 64 sem sinal)
Ponto Flutuante: Fl + 32 (Float) ou 64 (Double).
Ex: SomarxyFl32... (Precisão simples)
Ex: MultixyFl64... (Dupla precisão)
2. Sistema de Strings e Memória
A linguagem oferece três estratégias de alocação de texto.
Raw Byte (Velocidade Máxima/Heap): SomarlI8
Trata strings como arrays de bytes (ASCII puro). Sem verificação de codificação.
Universal (Compatibilidade/Heap): SomarlUT
Trata strings como UTF-8. Garante caracteres válidos (acentos, emojis).
Fixed Buffer (Stack - Zero Allocation):
Safe (Padrão): SomarlFB64 ou SomarlFB64C
Aloca 64 bytes na Stack. Verifica limites (Checked). Emite erro se estourar.
Unsafe (Turbo): SomarlFB64U
Aloca 64 bytes na Stack. Não verifica nada. Performance de Assembly puro. Risco de Buffer Overflow.
3. Otimizações de Hardware (Advanced)
SIMD (Vetorização): Processamento paralelo de dados.
Sintaxe: SomarVec4In32x[10,20,30,40]y[1,2,3,4]
Efeito: Realiza 4 somas em 1 ciclo de CPU.
Branch Prediction (Dicas ao Processador):
SEProv... (Provável/Likely): Otimiza assumindo que a condição será VERDADEIRA.
SEImpr... (Improvável/Unlikely): Otimiza assumindo que a condição será FALSA (ex: tratamento de erros).
Aritmética de Ponteiros Direta:
Suporte a endereços hexadecimais literais: x@0xFF00AA

Exemplos de Uso:
Em LLVM IR
SomarxyInSd32x1000y5000
SomarxyFl[no caso float, ou db no caso de double]SomarxyFlUd[Ud no caso de unsigned Division], sendo o 32 ou 64 o número de bits
SubtrxyInSd32x1000y5000
MultixyInSd32x1000y5000
DividxyInSd32x1000y5000
SomarlI8xyxl'Meriadok'yl'Aiko'
SomarlUTxyxl'Meriadok'yl'Aiko'
SomarlFB64Uxyxl'Meriadok'yl'Aiko'

Se o programador usar SomarlFB64xyxl'Meriadok'yl'Aiko', o compilador entende que será Checked, priorizando segurança, agora
SomarlFB64Uxyxl'Meriadok'yl'Aiko' significará Unchecked, SomarlFB64xyxl'Meriadok'yl'Aiko' é igual SomarlFB64Cxyxl'Meriadok'yl'Aiko' sendo
C o checked
Implantemos também A. SIMD (Single Instruction, Multiple Data);
SomarVec4In32x[10,20,30,40]y[1,2,3,4]
B. Branch Prediction Hints;
SEProvSomarxyInSd32x1000y5000 
SEImprSomarxyInSd32x1000y5000
C. Aritmética de Ponteiros Direta (Sem Variáveis);
SEProvSomarxyInSd32x@0xFF00AAy@0xFF00AB
SEProvVec4In32x[@0xFF00AAy,@0xFF00AAy,@0xFF00AAy,@0xFF00AAy]y[@0xFF00AB,@0xFF00AB,@0xFF00AB,@0xFF00AB]
________________________________________
Exemplos de Gerenciamento de Lifetime

No primeiro caso:

AlocHpInSd64xptrXy1000-SomarxyInSd64x@ptrXy500-SEProvMaiorxyInSd64x@ptrXy1000-LiberHpxptrX

No segundo caso:

EscopoInixLogicA-DefStkFB64CxstrMsgyl'Player1-SomarlFB64CxstrMsgyl'Joined'-SEImprEscopoFimxLogicA-EscopoFimxLogicA

E no terceiro:
ZonaDefxArena1y4096-ZonaDefxArena1y4096-DefZnVec4In32xVetorAy[10,20,30,40]zArena1-DefZnVec4In32xVetorBy[1,1,1,1]zArena1-SomarVec4In32xVetorAyVetorB-DefZnInSd32xHardValy@0xFF00AAzArena1-ZonaRstxArena1-ZonaMatarxArena1


Onde temos:
[CMD]: Comando Fixo (A "palavra-chave" da linguagem).
{OPC}: Opção Selecionável (Onde você escolhe o tipo/modo/tamanho).
<INP>: Input do Programador (Nomes, valores, literais).
CASO A:
AlocHpInSd64xptrXy1000

Alocar: "Sistema Operacional, me dê um espaço na memória RAM (Heap) para guardar um número Inteiro de 64 bits. Vou chamar esse endereço de ptrX e quero que ele comece valendo 1000."
Componente
Categoria
Descrição / Opções
Aloc
[CMD]
Comando de alocação de memória.
Hp
{OPC}
Estratégia de Memória. Opções: {Hp} (Heap), {Stk} (Stack), {Zn} (Zona).
In
{OPC}
Tipo de Dado. Opções: {In} (Inteiro), {Fl} (Float).
Sd
{OPC}
Modo Numérico. Opções: {Sd} (Signed), {Ud} (Unsigned).
64
{OPC}
Tamanho em Bits. Opções: {32}, {64}.
x
[CMD]
Separador fixo do primeiro parâmetro.
ptrX
<INP>
Nome da variável/ponteiro definido pelo usuário.
y
[CMD]
Separador fixo do segundo parâmetro.
1000
<INP>
Valor inicial definido pelo usuário.


SomarxyInSd64x@ptrXy500
Somar: "Vá até o endereço de memória apontado por ptrX. Pegue o valor que está lá e some 500. Guarde o resultado (1500) no mesmo lugar."
SEProvMaiorxyInSd64x@ptrXy1000
Branch Prediction (Se Provável): "Processador, prepare-se para o cenário mais provável: verifique se o valor dentro de ptrX é Maior que 1000. (Dica: Aposte que será verdade para otimizar o fluxo)."

Componente
Categoria
Descrição / Opções
Somar
[CMD]
Operação matemática.
xy
[CMD]
Indicador de que a operação usa dois operandos (x e y).
InSd64
{OPC}
(Conjunto de Tipo/Modo/Bits explicado acima).
x
[CMD]
Separador.
@ptrX
<INP>
Referência de ponteiro (Input com prefixo @).
y
[CMD]
Separador.
500
<INP>
Valor literal.


LiberHpxptrX
Liberar: "Acabei. Pode destruir o endereço ptrX e devolver essa memória para o sistema. Se eu tentar usar ptrX de novo, dê erro."

Componente
Categoria
Descrição
Liber
[CMD]
Comando de liberação de memória.
Hp
{OPC}
Estratégia alvo. Opções: {Hp} (Heap).
x
[CMD]
Separador.
ptrX
<INP>
Nome da variável a ser liberada.

CASO B:
EscopoInixLogicA
Início de Escopo: "Estou abrindo um novo bloco de execução na Pilha (Stack) chamado LogicA. Tudo que acontecer agora é temporário."

Componente
Categoria
Descrição
EscopoIni
[CMD]
Inicia um novo stack frame lógico.
x
[CMD]
Separador.
LogicA
<INP>
Nome/Label deste escopo.


DefStkFB64CxstrMsgyl'Player1
Definir String: "Reserve 64 bytes aqui na pilha para um texto. O nome é strMsg. Escreva 'Player1' nele. Ative a verificação de segurança (Checked)."

SomarlFB64CxstrMsgyl'Joined
Concatenar: "Adicione o texto 'Joined' ao final de strMsg. (O resultado será 'Player1Joined'). Verifique se não estourou os 64 bytes."

Componente
Categoria
Descrição / Opções
Def
[CMD]
Definição de variável.
Stk
{OPC}
Estratégia. Opções: {Stk} (Stack), {Zn} (Zona).
FB
{OPC}
Tipo String. Opções: {FB} (Fixed Buffer), {I8} (Raw), {UT} (UTF).
64
{OPC}
Tamanho do Buffer. Opções: {64}, {128}, {256}...
C
{OPC}
Segurança. Opções: {C} (Checked/Safe), {U} (Unchecked/Turbo).
x
[CMD]
Separador.
strMsg
<INP>
Nome da variável.
y
[CMD]
Separador.
l'Player1
<INP>
Valor literal string (prefixo l').

SEImprEscopoFimxLogicA
Branch Prediction (Se Improvável - Erro): "Se algo deu errado na instrução anterior (improvável), encerre o escopo LogicA imediatamente e limpe a bagunça."
EscopoFimxLogicA
Fim de Escopo: "Fim do bloco LogicA. Destrua tudo que foi criado aqui dentro (a variável strMsg deixa de existir agora). Volte a pilha ao estado anterior."

Componente
Categoria
Descrição / Opções
SEImpr
{OPC}
Dica de Branch Prediction. Opções: {SEImpr} (Improvável), {SEProv} (Provável).
EscopoFim
[CMD]
Comando de encerramento de escopo (Pop da Stack).
x
[CMD]
Separador.
LogicA
<INP>
Label do escopo a fechar.

3. Caso Arena (Zones / Turbo)
ZonaDefxArena1y4096
Definir Zona: "Reserve um bloco contínuo de 4096 bytes na memória e chame de Arena1. O ponteiro de uso está no zero."

Componente
Categoria
Descrição
ZonaDef
[CMD]
Define uma nova Arena de memória.
x
[CMD]
Separador.
Arena1
<INP>
ID/Nome da Zona.
y
[CMD]
Separador.
4096
<INP>
Tamanho em bytes da zona.

DefZnVec4In32xVetorAy[10,20,30,40]zArena1
Definir Vetor A: "Dentro da Arena1, grave 4 inteiros de 32 bits lado a lado: [10, 20, 30, 40]. Chame de VetorA."
DefZnVec4In32xVetorBy[1,1,1,1]zArena1
Definir Vetor B: "Logo em seguida na Arena1, grave mais 4 inteiros: [1, 1, 1, 1]. Chame de VetorB."

Componente
Categoria
Descrição / Opções
Def
[CMD]
Definição.
Zn
{OPC}
Estratégia: Zona.
Vec4
{OPC}
Estrutura de Dados. Opções: {Vec4} (SIMD 4), {Vec8} (SIMD 8), {Esc} (Escalar/Normal).
In32
{OPC}
Tipo base dos elementos do vetor (Int 32 bits).
x
[CMD]
Separador.
VetorA
<INP>
Nome da variável vetor.
y
[CMD]
Separador.
[...]
<INP>
Array literal de valores.
z
[CMD]
Separador especial para Zonas (Link).
Arena1
<INP>
Nome da Zona onde será alocado.

SomarVec4In32xVetorAyVetorB
Somar SIMD: "Use a instrução vetorial da CPU. Pegue os 4 números de A e some com os 4 de B ao mesmo tempo. O VetorA agora vale [11, 21, 31, 41]."
DefZnInSd32xHardValy@0xFF00AAzArena1
Ponteiro Direto: "Vá no endereço físico hexadecimal 0xFF00AA, copie o valor que está lá e grave como um Inteiro na Arena1 com o nome HardVal."
ZonaRstxArena1
Resetar Zona: "Mova o ponteiro de uso da Arena1 de volta para o zero. Considere todos os dados (VetorA, VetorB, HardVal) como 'lixo' lógico. A memória está pronta para ser reescrita."

Componente
Categoria
Descrição
ZonaRst
[CMD]
Reseta o ponteiro da zona (limpa memória logicamente).
x
[CMD]
Separador.
Arena1
<INP>
ID da Zona a resetar.


ZonaMatarxArena1
Matar Zona: "Devolva os 4096 bytes da Arena1 para o Sistema Operacional. Fim."

Componente
Categoria
Descrição
ZonaMatar
[CMD]
Libera a memória da zona do SO (fim do programa/nível).
x
[CMD]
Separador.
Arena1
<INP>
ID da Zona a destruir.


TomGPU
Exemplo: 
GpuBufCriarFl32x4000000yBufPos-GpuBufCriarFl32x4000000yBufVel-GpuEnvFl32xRamPosXBufPos-GpuEnvFl32xRamVelxBufVel-DefKernelxAtualizaParticula-GpuIdObtIn32xMeuId-    GpuLerVec4Fl32xBufVelyMeuIdzVelAtual-    SomarVec4Fl32xPosAtualyVelAtualzNovaPos- GpuEscrVec4Fl32xBufPosyMeuIdzNovaPosFimDef-GpuDispxAtualizaParticulax1000000y1z1-GpuRecFl32xBufPosyRamPos
1. Preparação de Memória (VRAM)
GpuBufCriarFl32x4000000yBufPos
Alocar VRAM: "GPU, reserve um bloco contínuo na sua memória de vídeo (VRAM) suficiente para armazenar 4 milhões de números de Ponto Flutuante de 32 bits. Dê a este bloco o nome de referência BufPos."

Componente
Categoria
Descrição
GpuBufCriar
[CMD]
Comando para solicitar alocação na memória da GPU.
Fl
{OPC}
Tipo de dado: Float (Ponto Flutuante).
32
{OPC}
Tamanho: 32 bits (Precisão Simples).
x
[CMD]
Separador de parâmetros.
4000000
<INP>
Quantidade de elementos a alocar.
y
[CMD]
Separador de parâmetros.
BufPos
<INP>
Nome do handle/ponteiro para o buffer na GPU.

Instrução: Transferência CPU -> GPU
GpuEnvFl32xRamPosXBufPos
Tradução Natural:
Upload de Dados: "Pegue os dados que estão na memória RAM do sistema (no array RamPos) e envie-os através do barramento PCI-Express para o buffer BufPos que acabamos de criar na GPU. Trate os bits como Floats de 32 bits durante a cópia."

Componente
Categoria
Descrição
GpuEnv
[CMD]
Enviar (Upload) da Host (CPU) para Device (GPU).
Fl
{OPC}
Tipo de dado a ser transferido.
32
{OPC}
Tamanho em bits.
x
[CMD]
Separador.
RamPos
<INP>
Fonte: Variável/Array na memória RAM.
x
[CMD]
Separador.
BufPos
<INP>
Destino: Buffer na memória VRAM.

Aqui está a especificação técnica detalhada para o módulo TomGPU, seguindo rigorosamente o padrão de documentação do seu arquivo original ("Linguagem Tom").

1. Preparação de Memória (VRAM)
Esta etapa ocorre antes do loop principal. É o momento de alocar recursos na placa de vídeo.
Instrução: Criação de Buffer
GpuBufCriarFl32x4000000yBufPos
Tradução Natural:
Alocar VRAM: "GPU, reserve um bloco contínuo na sua memória de vídeo (VRAM) suficiente para armazenar 4 milhões de números de Ponto Flutuante de 32 bits. Dê a este bloco o nome de referência BufPos."
Componente
Categoria
Descrição
GpuBufCriar
[CMD]
Comando para solicitar alocação na memória da GPU.
Fl
{OPC}
Tipo de dado: Float (Ponto Flutuante).
32
{OPC}
Tamanho: 32 bits (Precisão Simples).
x
[CMD]
Separador de parâmetros.
4000000
<INP>
Quantidade de elementos a alocar.
y
[CMD]
Separador de parâmetros.
BufPos
<INP>
Nome do handle/ponteiro para o buffer na GPU.


Instrução: Transferência CPU -> GPU
GpuEnvFl32xRamPosXBufPos
Tradução Natural:
Upload de Dados: "Pegue os dados que estão na memória RAM do sistema (no array RamPos) e envie-os através do barramento PCI-Express para o buffer BufPos que acabamos de criar na GPU. Trate os bits como Floats de 32 bits durante a cópia."
Componente
Categoria
Descrição
GpuEnv
[CMD]
Enviar (Upload) da Host (CPU) para Device (GPU).
Fl
{OPC}
Tipo de dado a ser transferido.
32
{OPC}
Tamanho em bits.
x
[CMD]
Separador.
RamPos
<INP>
Fonte: Variável/Array na memória RAM.
x
[CMD]
Separador.
BufPos
<INP>
Destino: Buffer na memória VRAM.


2. Definição do Kernel (Compute Shader)
Aqui definimos o micro-programa que rodará em paralelo. O código dentro deste bloco não é executado sequencialmente pela CPU, mas sim por milhares de núcleos CUDA/Stream Processors.
DefKernelxAtualizaParticula ... FimDef
Tradução Natural:
Registrar Shader: "Compilador, inicie a definição de uma função de GPU chamada AtualizaParticula. Tudo o que estiver abaixo até encontrar FimDef será compilado para bytecode de GPU (SPIR-V/PTX)."

Componente
Categoria
Descrição
DefKernel
[CMD]
Início de bloco de código GPU.
x
[CMD]
Separador.
AtualizaParticula
<INP>
Nome do Kernel para chamada posterior.

nstrução: Identidade da Thread
GpuIdObtIn32xMeuId
Tradução Natural:
Auto-Conhecimento: "Quem sou eu neste exército de threads? Obtenha o meu índice global único (Global Invocation ID) e guarde-o na variável inteira MeuId. Se houver 1 milhão de threads, eu serei um número entre 0 e 999.999."

Componente
Categoria
Descrição
GpuIdObt
[CMD]
Obter ID da thread atual (coordenada X linearizada).
In
{OPC}
Tipo do ID: Inteiro.
32
{OPC}
Tamanho: 32 bits.
x
[CMD]
Separador.
MeuId
<INP>
Nome da variável local para guardar o ID.

Instrução: Leitura Vetorizada (VRAM -> Registrador)
GpuLerVec4Fl32xBufPosyMeuIdzPosAtual
Tradução Natural:
Fetch de Memória: "Vá até o buffer global BufPos. Pule para a posição indicada por MeuId. Leia 4 valores de uma vez (x, y, z, w) e coloque-os no meu registrador local chamado PosAtual."

Componente
Categoria
Descrição
GpuLer
[CMD]
Ler da VRAM para registrador da Thread.
Vec4
{OPC}
Modo: Leitura de 4 componentes (Vetor).
Fl
{OPC}
Tipo: Float.
32
{OPC}
Bits: 32.
x...y...z
[CMD]
Separadores de argumentos.
BufPos
<INP>
Buffer de origem.
MeuId
<INP>
Índice (Offset) de leitura.
PosAtual
<INP>
Variável local de destino.

nstrução: Operação Aritmética (ALU)
SomarVec4Fl32xPosAtualyVelAtualzNovaPos
Tradução Natural:
Cálculo SIMD: "Utilize a unidade lógica aritmética da GPU para somar o vetor PosAtual com o vetor VelAtual. Faça as 4 somas (x+x, y+y...) em um único ciclo de clock e guarde o resultado em NovaPos."

Componente
Categoria
Descrição
Somar
[CMD]
Operação matemática básica.
Vec4
{OPC}
Modo: Vetorial (SIMD 4-wide).
Fl
{OPC}
Tipo: Float.
32
{OPC}
Bits: 32.
x...y...z
[CMD]
Operandos e Destino.

Instrução: Escrita (Registrador -> VRAM)
GpuEscrVec4Fl32xBufPosyMeuIdzNovaPos
Tradução Natural:
Commit de Memória: "Pegue o valor calculado NovaPos e escreva-o de volta no buffer global BufPos, exatamente na posição MeuId. Isso atualiza o estado do mundo."

Componente
Categoria
Descrição
GpuEscr
[CMD]
Escrever de registrador local para VRAM global.
Vec4
{OPC}
Modo: Escrita de 4 componentes.
Fl
{OPC}
Tipo: Float.
32
{OPC}
Bits: 32.
BufPos
<INP>
Buffer de destino.
MeuId
<INP>
Índice de escrita.
NovaPos
<INP>
Valor a escrever.

3. Execução (Dispatch)
O momento em que a CPU ordena que a GPU comece a trabalhar.
Instrução: Despacho de Trabalho
GpuDispxAtualizaParticulax1000000y1z1
Tradução Natural:
Launch: "Driver de Vídeo, pegue o kernel AtualizaParticula e execute-o agora. Crie uma grade de threads unidimensional com 1 milhão de itens no eixo X (e apenas 1 no Y e Z). Libere a CPU imediatamente após enviar o comando; não espere terminar."

Componente
Categoria
Descrição
GpuDisp
[CMD]
Dispatch/Launch Compute Shader.
x
[CMD]
Separador.
AtualizaParticula
<INP>
Nome do Kernel a executar.
x
[CMD]
Separador dimensão X.
1000000
<INP>
Número de grupos de trabalho/threads em X.
y...z...
[CMD]
Separadores dimensões Y e Z.

4. Recuperação (Opcional)
Trazer os dados de volta para a CPU, caso necessário.
Instrução: Download GPU -> CPU
GpuRecFl32xBufPosyRamPos
Tradução Natural:
Readback: "CPU, pare e espere a GPU terminar tudo o que está fazendo. Quando ela acabar, copie o conteúdo atualizado do buffer BufPos de volta para o array RamPos na memória principal."

Componente
Categoria
Descrição
GpuRec
[CMD]
Receber (Download) do Device para Host. Bloqueante.
Fl
{OPC}
Tipo de dado.
32
{OPC}
Tamanho em bits.
BufPos
<INP>
Origem (VRAM).
RamPos
<INP>
Destino (RAM).

____________________________________________
FEATURES FUTURAS, TALVEZ SEJA INTERESSANTE ME CONCENTRAR EM Comptime (Execução na Compilação).
Essa abordagem de "Liberdade com Padrões Eficientes" (Sensible Defaults) é exatamente o que linguagens modernas como Zig, Odin e Jai (a linguagem do Jonathan Blow) estão fazendo. Elas rejeitam a "mão pesada" do Java/C# (GC obrigatório) e a "anarquia perigosa" do C antigo.
Como você está usando LLVM e focando em performance (Bullet Hell/Jogos), aqui estão 5 sugestões de recursos "Gold Standard" — misturando conceitos ultramodernos e ideias antigas resgatadas — que fariam o Tom brilhar:

1. Defer (Adiar Execução)
Origem: Go, Swift, Zig, Odin.
Isso é uma das melhores invenções de qualidade de vida para linguagens sem Garbage Collector. Em vez de lembrar de liberar a memória no final da função (e esquecer se tiver um if ou return no meio), você declara a limpeza logo após a criação.
Como funciona: O comando Defer agenda uma instrução para rodar apenas quando o escopo atual (bloco {}) terminar.
No Tom:
Snippet de código
AlocIn32xPonteiro
DeferLiberarxPonteiro  <-- Garante a limpeza, não importa o que aconteça abaixo
...código perigoso...
...retorno antecipado...
(O compilador insere o 'Liberar' aqui automaticamente)




Vantagem: Evita Memory Leaks sem tirar o controle manual do programador.
2. "Comptime" (Execução em Tempo de Compilação)
Origem: Zig, Jai (Moderno) / Lisp (Antigo).
E se o Tom pudesse rodar código Tom enquanto compila?
Para um Bullet Hell, você precisa de tabelas de Seno/Cosseno para os tiros giratórios. Em C++, você calcularia isso na inicialização do jogo (tempo de loading). Com Comptime, o compilador calcula a tabela e já grava os números fixos no executável final.
No Tom: Imagine um prefixo Comp que diz: "Não gere LLVM IR para isso, execute agora no compilador e substitua pelo resultado".
Snippet de código
DefConstxPiCompCalculaPix...




Vantagem: Zero custo de runtime. O executável já nasce com os dados prontos.
3. SOA Nativo (Structure of Arrays)
Origem: Jai, Data-Oriented Design.
Em linguagens tradicionais (C#, Java, C++), criamos objetos:
Particula { x, y, cor }.
Na memória, fica: [x,y,cor] [x,y,cor] [x,y,cor].
Isso é ruim para a CPU (Cache Miss), porque se você quiser processar só o x de todas as partículas, a CPU tem que pular o y e a cor.
O ideal para performance é: [x,x,x] [y,y,y] [cor,cor,cor].
Fazer isso na mão é chato. O Tom poderia ter uma palavra-chave que transforma automaticamente uma Struct em arrays separados.
Ideia para o Tom:
Ao definir um grupo de inimigos, o compilador organiza a memória separada automaticamente, mas o programador acessa como se fosse um objeto junto (inimigo.x). O compilador faz a mágica aritmética dos ponteiros.
4. Alocadores como Parâmetros (First-Class Allocators)
Origem: Zig, Odin.
Em C, malloc usa um alocador global (lento e genérico).
No Tom, você já mencionou Arenas. A ideia moderna é: Nenhuma função deve alocar memória "escondida". Se uma função precisa de memória, ela deve pedir um Alocador como parâmetro.
Cenário:
No Menu do Jogo: Usa um alocador padrão (heap).
Na Fase do Jogo: Passa uma Arena (Stack/Bump Pointer) para a mesma função.
Resultado: A mesma função de "CarregarInimigo" roda sem gerar fragmentação de memória durante o jogo, porque você trocou a estratégia de alocação apenas mudando o parâmetro.
5. Retornos Múltiplos e Tratamento de Erro por Valor
Origem: Go, Lua (Antigo), Rust (Result Type).
Evite Exceptions (Try/Catch) como em Java/C++. Elas são lentas e escondem o fluxo lógico (o famoso "GOTO invisível").
O moderno é tratar erro como um dado normal.
No Tom: Toda função que pode falhar retorna dois valores: O Resultado e o Erro.
Snippet de código
LerArquivoxDadosxErro
SeErroFaz...




Isso obriga o programador a lidar com a falha imediatamente, tornando o código ultra-robusto, algo essencial para servidores ou jogos que não podem crashar.
Resumo da Sugestão "Killer Feature" para o Tom:
Se eu tivesse que escolher apenas uma para diferenciar o Tom de tudo o que existe, seria o Comptime (Execução na Compilação).
Como sua sintaxe é muito regular ("Código de Barras"), criar macros ou gerar código dinamicamente seria muito poderoso. Você poderia escrever um código Tom que lê uma imagem PNG e gera o código Tom de uma matriz de pixels antes do jogo compilar. Isso é o auge da metaprogramação moderna.

______________________________________
Proposta Final: Tom Memory Modes

// O programador DECLARA como vai acessar:

// Modo 1: Sequencial puro (padrão)
GpuBufCriarSeqFl32x1000yBuf1

// Modo 2: Bidirectional (sua ideia das pontas!)
GpuBufCriarBidirecionalFl32x1000yBuf2

// Modo 3: Radial (sua ideia do centro!)
GpuBufCriarRadialFl32x1000yBuf3xCentro500

// Modo 4: Aleatório (hash tables)
GpuBufCriarRandomFl32x1000yBuf4

Tabela de Decisão Rápida
Se você vai...
Use Modo
Exemplo
Processar array inteiro em ordem
1
For loop simples
Ordenar/mesclar dados
2
Merge sort
Buscar por proximidade
3
Colisões, fog of war
Buscar por chave/ID
4
Inventário, dicionário
Aplicar filtro em imagem
1
Preto e branco
Blur ao redor de um ponto
3
Tilt-shift
Ler arquivo do disco
1
Sequencial



https://claude.ai/chat/d44e208d-7975-4aee-aefe-aefb706b40ed

// Modo 1: Sequencial (1 centro no início)
GpuBufCriarSeqFl32x1000000yBuf1

// Modo 2: Bidirecional (2 centros nas pontas)
GpuBufCriarBidirecionalFl32x1000000yBuf2

// Modo 3: Radial (1 centro definido)
GpuBufCriarRadialFl32x1000000yBuf3xCentro500000

// Modo 4: Aleatório (hash table)
GpuBufCriarRandomFl32x1000000yBuf4

// NOVO - Modo 5: Fourfold (4 centros, 6 linhas)
GpuBufCriarFourfoldFl32x1000000yBuf5

// NOVO - Modo 6: Multi-Center customizado
GpuBufCriarMultiCenterFl32x1000000yBuf6xCentros[10,20,30,40,50]
// Define 5 centros customizados

// NOVO - Modo 7: Grid (centros em grade 2D)
GpuBufCriarGrid2DFl32x1024x1024yBuf7xTileSize64
// Divide imagem 1024×1024 em tiles 64×64
// Cada tile é um centro (256 centros!)
```

---

## 8. Quando Usar Cada Modo NOVO:

### Fourfold (4 Centros):
✅ Imagens grandes (divide em quadrantes)  
✅ Simulações físicas com regiões (clima, fluidos)  
✅ Pathfinding em mapas quadrados  
✅ Audio multitrack (4-8 faixas)  

### Multi-Center Customizado:
✅ Machine learning (K-means, clustering)  
✅ Jogos MMO (cada jogador = 1 centro)  
✅ Simulação de enxames (boids, flocking)  
✅ Renderização de muitas luzes pontuais  

### Grid 2D:
✅ Tile-based rendering  
✅ Cellular automata (Conway's Life, Noita)  
✅ Chunked terrain (Minecraft)  
✅ Spatial hashing para física  

---

## Resumo Visual das 6 Linhas do Fourfold:
```
Array: [0................................1000000]

Divisão:
A = [0.........250K]
B = [250K......500K]  
C = [500K......750K]
D = [750K......1000K]

6 Linhas de leitura simultâneas:
1. A → 125K   (esquerda de AB)
2. 125K ← B   (direita de AB)
3. B → 375K   (esquerda de BC)
4. 375K ← C   (direita de BC)
5. C → 625K   (esquerda de CD)
6. 625K ← D   (direita de CD)

Encontros (merge points):
- 125K: onde A e B se encontram
- 375K: onde B e C se encontram  
- 625K: onde C e D se encontram

Resultado: 4 threads processam o array 4x mais rápido
           com 6 direções de leitura otimizadas!
// ========================================
// LINGUAGEM TOM - PERFORMANCE BUDGET
// ========================================

// 1. Define FPS alvo
DefBudgetFramexyTargetFPSy60

// 2. Define budget por sistema (opcional)
DefBudgetSistemaxParticulasyMaxMsy2.0
DefBudgetSistemaxFisicayMaxMsy3.0

// 3. Define prioridades
DefPrioridadexJogadory10      // Nunca sacrificar
DefPrioridadexParticulasy3    // Sacrificar primeiro

// 4. Tom monitora automaticamente
// (você não precisa escrever nada, Tom faz!)

// 5. Você só define o que fazer em cada nível
DefLODNivelxParticulasyNiveisx[ULTRA,ALTO,MEDIO,BAIXO,MINIMO]

DefQuandoLODMudaxParticulasyULTRAyALTO
    LimiteParticulas = 5000
FimDef

DefQuandoLODMudaxParticulasyALTOyMEDIO
    LimiteParticulas = 2000
    RagdollsAtivos = FALSO
FimDef

// 6. (Opcional) Limites absolutos de emergência
DefLimiteAbsolutoxInimigosy500
// Se passar de 500, Tom MATA os mais distantes
```

---

## Resposta Final: Sim, Dá Pra Resolver!

A Linguagem Tom poderia ter um **sistema de budget de performance nativo** que:

1. ✅ **Detecta quedas de FPS automaticamente**
2. ✅ **Reduz qualidade gradualmente** (partículas → sombras → física)
3. ✅ **Prioriza o que importa** (jogador sempre em alta qualidade)
4. ✅ **Recupera qualidade** quando FPS melhora
5. ✅ **Previne crashes** com limites absolutos
6. ✅ **É transparente** (você vê no console o que Tom está fazendo)






Buscar implantar o “Tom Live Budget”
WCET (Worst-Case Execution Time Analysis) ou "Análise de Tempo de Execução do Pior Caso". Em linguagens de alto nível (como Java ou Python) isso é quase impossível de calcular com precisão devido ao Garbage Collector e abstrações complexas.
Mas como Tom é uma linguagem explícita ("Código de Barras"), onde você declara o tamanho exato dos dados e as operações, o compilador sabe exatamente o custo de cada linha.
Aqui está como essa ferramenta funcionaria dentro do ecossistema Tom:
O Recurso: "Tom Live Budget" (Orçamento em Tempo Real)
Imagine que, ao programar, o IDE do Tom tenha uma "Barra de Custo" (semelhante à barra de "termômetro" em editores de mapas de jogos como Tony Hawk ou Far Cry), que enche conforme você digita o código.
1. Como funcionaria na Sintaxe?
Você definiria o orçamento no início do arquivo ou da função. Se o custo estimado das instruções ultrapassar esse orçamento, o compilador gera um erro antes mesmo de você tentar rodar.
Exemplo de Código (Conceitual):
Snippet de código
// ==========================================
// DEFINIÇÃO DO ORÇAMENTO (O "Contrato")
// ==========================================
// Define que esta função não pode custar mais que 500 ciclos de CPU
// e não pode alocar mais que 1KB na Stack.
DefBudgetFuncaoxyMaxCiclosy500xMaxStacky1024

Funcao CalcularFisicaInimigo
    // O compilador começa a somar os custos aqui:
    
    // Custo: ~1 ciclo
    SomarxyInSd32x10y20 
    
    // Custo: ~4 ciclos (operação de memória)
    CarregarMemoriaxy... 

    // Custo: ~100 ciclos (raiz quadrada é pesada)
    RaizQuadradaxyFl64...

    // ... código continua ...

    // ERRO DO COMPILADOR NA LINHA 50:
    // [ERRO CRÍTICO] O orçamento de 500 ciclos foi estourado! 
    // Custo atual acumulado: 512 ciclos. 
    // Sugestão: Troque 'RaizQuadradaFl64' por 'RaizQuadradaAproxFl32' (custo 15 ciclos).
FimFuncao


2. Como o Tom calcula isso "enquanto você programa"?
Como a linguagem é de baixo nível, cada instrução tem um "peso" conhecido (em ciclos de clock aproximados da CPU):
SomarxyInSd32 = 1 ciclo.
MultixyFl64 = 3 a 5 ciclos.
AcessoMemoriaRandomico = 100+ ciclos (cache miss).
GpuDrawCall = Custo alto na GPU.
O compilador mantém uma tabela de custos. Enquanto você digita, ele soma:

3. O Desafio dos Loops (E a Solução Tom)
O maior problema para calcular isso são os loops (For, While), porque o compilador não sabe quantas vezes o loop vai rodar (o problema da parada).
Solução "Estilo Tom": Loops Limitados (Bounded Loops)
Para usar o sistema de Live Budget, a linguagem poderia exigir que loops dentro de seções críticas tenham um limite máximo explícito.
Snippet de código
// Loop inseguro (O compilador não consegue calcular o custo)
Enquanto (x < y) ... 

// Loop Seguro para Budget (O compilador assume o pior caso: 100 repetições)
RepetirxyMax100
    // Custo do bloco interno * 100 = Custo Total do Loop
FimRepetir


4. Vantagens para Desenvolvimento de Jogos
Isso resolveria problemas clássicos de otimização prematura ou tardia:
Feedback Imediato: Em vez de rodar o jogo, notar que o FPS caiu para 20, abrir um Profiler, e procurar o erro, o compilador avisa na hora: "Você colocou uma divisão de ponto flutuante dentro de um loop de 10.000 iterações. Isso vai travar a CPU."
Orçamento de GPU: Para shaders, isso já existe em algumas ferramentas (o compilador avisa quantos registros o shader usa). O Tom levaria isso para a lógica do jogo (CPU).
Ensino: O programador aprende naturalmente o custo das coisas. Ele veria que InSd32 (Inteiro) "custa" menos na barra de progresso do que Fl64 (Double), incentivando boas práticas.
Conclusão
Sim, é possível. Basicamente, você estaria transformando o compilador em uma calculadora de ciclos estática.
Para a "Linguagem Tom", que já tem essa filosofia de "você precisa saber o que está fazendo com os bits", essa ferramenta seria o "Killer Feature". Ela transformaria a programação em um jogo de gerenciamento de recursos em tempo real.







## Status atual do compilador LLVM IR (`tom-lang/tomc.js`)
A versão atual do tradutor já cobre um bloco inicial funcional, mantendo a filosofia linear da Tom:

- Operações numéricas escalares:
  - `SomarxyInSd32x10y20`, `SubtrxyInUd64x100y2`, `MultixyFl32x3.5y2.0`, `DividxyFl64x22.0y7.0`.
- Vetores SIMD base (`Vec4`):
  - `SomarVec4In32x[10,20,30,40]y[1,2,3,4]`.
- Concatenação de strings literais:
  - `SomarlI8xyxl'Meriadok'yl'Aiko'`
  - `SomarlUTxyxl'Olá 'yl'Tom'`
  - `SomarlFB64Cxyxl'Hi 'yl'Player'` (checked)
  - `SomarlFB64Uxyxl'Hi 'yl'Player'` (unchecked)
- Geração de texto no estilo baixo nível (via `printf` no IR):
  - `GerarTxtxl'Mensagem\n'`
  - `GerarTxtUltimo` (imprime a última string concatenada)
- **Base inicial do Tom Live Budget** (metadados estáticos no compilador):
  - `DefBudgetFramexyTargetFPSy60`
  - `DefBudgetSistemaxParticulasyMaxMsy2.0`
  - `DefPrioridadexJogadory10`
  - Atualmente o compilador valida os valores, registra no IR (comentários `; TOM_BUDGET_*`) e imprime um resumo no console para servir de fundação da análise WCET em tempo real.

- **Indicativos visuais no IDE (VS Code)**:
  - A extensão agora ativa automaticamente um analisador de Tom Live Budget em arquivos `.tom`.
  - Diretivas de budget recebem um marcador visual `← Tom Live Budget` ao final da linha.
  - Erros e avisos aparecem no painel *Problems* (FPS inválido, `MaxMs <= 0`, duplicidade de sistema e prioridade fora de faixa sugerida).
  - Cada diretiva mostra *hover* contextual com resumo de orçamento (FPS em ms/frame, limite por sistema e nível de prioridade).

> Dica: para testar rapidamente, edite `tom-lang/teste.tom` e rode `node tom-lang/tomc.js tom-lang/teste.tom`.

## Guia prático

- Subsídios para criar RPG de texto com imagens, telas, nomes, valores e cálculos em Tom: `RPG_TOM_GUIA.md`.

## Suporte prático para RPG textual (estado + input + cenas)

Para viabilizar o fluxo do `RPG_TOM_GUIA.md`, o compilador Tom agora aceita comandos de estado persistente e entrada de jogador:

- `DefVarInSd32xpl_hp_atualy34` (declara variável numérica de estado)
- `SetVarInSd32xpl_hp_atualy@ULTIMO` (atualiza variável usando último resultado numérico)
- `LerEntradaInSd32xacao_escolhida` (lê escolha numérica do usuário)
- `DefTxtxcn_imagem_refyl'[IMG: caverna_entrada.png]'` (texto nomeado para cena/imagem)
- `SetTxtxcn_narrativayl'novo texto'` e `SomarTxtxcn_narrativayl'...'` (mutação narrativa)
- `GerarTxtxcn_narrativa` (renderiza texto nomeado)

Com isso, a Tom fica apta para o vertical slice de RPG (estado de jogador/inimigo, parsing básico de comando, loop/ramificação e mapeamento `id_cena -> imagem_ref` textual).

## TomGPU Compute Rasterization (pipeline mínimo)

- Novo intrínseco do compilador: `GpuApresentarxNomeDoBufferxLarguraxAltura`.
- Esse comando gera chamada LLVM externa: `@TomGpu_Present(i32* buffer_ptr, i32 width, i32 height)`.
- Runtime host SDL2 disponível em `tom-lang/runtime/tom_gpu_host.cpp` para abrir janela e apresentar o buffer de pixels.
- Exemplo de blitting em Tom puro: `tom-lang/exemplos/gpu_blit.tom` (inclui indexação `Y * Width + X` com `Multi` + `Somar`).
