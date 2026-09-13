# Desenho e animações 2D

Extensão aditiva do núcleo Tom 0.4. Mantém SDL 3.4.16, SDL_ttf 3.2.2, Bravura e
DejaVu, sem novos formatos de imagem ou dependências. O runtime desenha; as curvas,
partículas e transições de interface são funções Tom.

## Primitivas e transformações

| Operação | Argumentos após os recursos | Resultado |
|---|---|---|
| `DesenharVisualTransformado[@Janela,@Visual,...]` | X, Y, escala X, escala Y, ângulo, cor | Vazio |
| `DesenharCatalogoVisualTransformado[@Janela,@Catalogo,Id,...]` | X, Y, escala X, escala Y, ângulo, cor | Vazio |
| `DesenharRetanguloArredondado[@Janela,...]` | X, Y, largura, altura, raio, cor superior, cor inferior | Vazio |

Geometria usa `Fl64`, cores `InUd32` em RGBA `0xRRGGBBAA` (literal decimal na Tom),
e IDs de catálogo `InSd64`. O ângulo é em graus, no sentido horário. A âncora do
visual é a origem e linha de base existentes; escala 1 e rotação 0 usam exatamente
o desenho anterior. A transformação não muda as métricas nem recria a textura.
Para glifos, a altura da textura pode incluir espaço vertical da fonte; ela não
é necessariamente a altura da tinta do símbolo.

Escalas devem ser positivas e finitas, até 16.384, com dimensões transformadas de
até 16.384 unidades. Coordenadas e limites conservadores da transformação devem
ficar no intervalo ±10.000.000. Ângulos finitos são normalizados em uma volta.
Valores inválidos lançam erro antes de desenhar. Recursos de outra janela, IDs
removidos e janelas encerradas continuam sendo rejeitados.

Retângulos aceitam dimensões de zero a 16.384; uma dimensão zero não desenha.
O raio deve ser finito e não negativo e é limitado à metade da menor dimensão.
Cores iguais produzem preenchimento sólido; outras cores são interpoladas
verticalmente. A borda usa uma faixa de transparência de uma unidade lógica.
Sombras são composições de formas translúcidas, sem filtro de desfoque.

Tudo ocorre na thread principal, respeitando o recorte e a apresentação lógica.
O caminho por software usa as mesmas APIs públicas.

## `tom/cores`

```tom
Importar[l'tom/cores']
ChamarxCorRGBA[50,118,98,255]
DefVarInUd32xVerdey@ULTIMO
ChamarxCorOpacidade[@Verde,0.5]
DefVarInUd32xSuavey@ULTIMO
```

- `CorRGBA[R,G,B,A]`: quatro `InSd64` entre 0 e 255; retorna `InUd32`.
- `CorCanal[Cor,Indice]`: índice `InSd64`, 0=R, 1=G, 2=B, 3=A; retorna `InSd64`.
- `CorMisturar[De,Ate,Fator]`: interpola os quatro canais com fator `Fl64` de 0 a 1.
- `CorOpacidade[Cor,Fator]`: multiplica somente o alfa original pelo fator.

Fatores fora de 0–1 são erros. Canais interpolados são arredondados ao inteiro
mais próximo, com empate para cima. A interpolação atua nos valores dos canais,
sem conversão de espaço de cor. `InUd32ParaInSd64` e `InSd64ParaInUd32` são conversões
explícitas disponíveis no núcleo; a segunda verifica a faixa antes de converter.

## `tom/animacao` e `tom/efeitos`

`AnimacaoProgresso[Inicio,Duracao,Agora]` recebe três `InSd64` em nanossegundos e
retorna `Fl64` entre 0 e 1. Duração deve ser positiva. Horários anteriores ao início
retornam zero, e posteriores ao término retornam um, inclusive nos extremos de i64.

`AnimacaoInterpolar[De,Ate,Inicio,Duracao,Agora,Curva]` interpola valores `Fl64`.
`AnimacaoCurva` tem `Linear`, `Suave` (`3t²−2t³`) e `Desacelerar` (`1−(1−t)³`).
As consultas não mantêm estado nem usam um relógio oculto.

`EfeitoParticula` é uma SOA com atividade, início, duração, posição, velocidade,
tamanho, cor e ordem de emissão. Declare sua capacidade com `DefArraySoA`.

- `EfeitoEmitir[Colecao,Agora,Duracao,X,Y,Vx,Vy,Tamanho,Cor]` recebe a coleção
  mutável, horários `InSd64`, geometria `Fl64` e cor `InUd32`; retorna o índice usado.
  Usa um slot livre ou expirado; cheia, recicla a partícula mais antiga, usando a
  ordem de emissão para desempatar horários iguais. Essa é uma política decorativa
  explícita, distinta dos limites de recursos e eventos da linguagem.
- `EfeitoPosicao[Origem,Velocidade,Inicio,Duracao,Agora]` calcula a posição desde o
  nascimento; velocidade é em unidades por segundo. Não acumula passos de quadros.
- `EfeitoDesenhar[Janela,Colecao,Agora]` desenha elipses com alfa decrescente e retorna
  `Bl` indicando partículas não expiradas, inclusive as ainda agendadas para o futuro.
- `EfeitoLimpar[Colecao]` desativa os slots.

Não há sorteador global. O chamador pode usar um `Sorteador` exclusivo para
decoração e passar velocidades já calculadas. Nenhuma operação acessa arquivos ou
aloca texturas por partícula. O relógio fornecido determina o comportamento na pausa.

## Tema opt-in em `tom/ui`

`UITemaClaro[]` retorna um registro `UITema` com cores de fundo, ponteiro,
pressionamento, texto, estado desabilitado, foco e destaque, além de raio e duração.
O padrão usa cantos de 10 unidades e transições de 140 ms.

`UIDesenharTema[Janela,Catalogo,Itens,Estado,Transicoes,Tema,Agora,Reduzir]` recebe
uma SOA mutável `UITransicao`, com capacidade pelo menos igual à dos componentes.
Retorna `Bl` enquanto houver transição de cor ativa. Mudanças interrompem a curva
partindo da cor atual, sem salto. Movimento reduzido aplica a cor final imediatamente.
Foco e indicação de pressionamento permanecem visíveis.

Chame `UITransicoesLimpar[Transicoes]` ao reconstruir a tela. `UIAtualizar` e a
navegação existentes continuam sendo usados. `UIDesenhar` mantém o desenho anterior,
inclusive sua equivalência com a calculadora C. Sem animação, aguarde eventos; durante
uma transição, use `EventoAguardarAte` para acordar no próximo quadro.

## Experimentar e verificar

```text
node tom-lang/tomc.js --run tom-lang/exemplos/multimedia/visual.tom
node --test tom-lang/tests/visual.test.js
node --test --test-concurrency=1 jogos/musical-tom/tests/*.test.js
```

A demonstração mostra gradiente, escala/rotação, partículas, foco e movimento reduzido.
Os testes verificam pixels com tolerância de rasterização, identidade da transformação,
curvas, reciclagem, recorte, limites, propriedade e limpeza em O0/O2.
