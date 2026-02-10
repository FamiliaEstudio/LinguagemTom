# Subsídios para criar um RPG de texto com imagens na Linguagem Tom

Este guia organiza uma base prática para você prototipar um **RPG de texto com HUD/telas e imagens** usando a Linguagem Tom.

## 1) Escopo recomendado (MVP)

Comece pequeno, com um loop central:

1. Tela inicial (nome do jogador).
2. Cena de introdução com texto e uma imagem.
3. Escolha de ação (atacar, defender, item).
4. Cálculo de dano/vida.
5. Verificação de vitória/derrota.
6. Próxima cena.

---

## 2) Arquitetura sugerida

Como a Tom parece focar em performance/baixo nível, vale separar em módulos lógicos:

- **Core de estado**: HP, MP, nível, atributos, inventário, cena atual.
- **Parser de comandos**: interpreta entrada do jogador.
- **Motor de regras**: aplica cálculos (dano, crítico, defesa, cura).
- **Renderizador de texto/UI**: imprime menus, caixas de diálogo e status.
- **Camada de imagens** (ponte): se a Tom não tiver API de imagem nativa, use integração externa (SDL, HTML canvas, engine host, ou runtime que chame a Tom).

> Dica: mantenha a Tom responsável pela lógica e valores; deixe a exibição de imagem para uma camada de host quando necessário.

---

## 3) Modelo de dados para RPG

### 3.1 Entidade Personagem

Campos essenciais:

- `nome`
- `hp_atual`, `hp_max`
- `mp_atual`, `mp_max`
- `ataque`, `defesa`, `velocidade`, `crit_chance`
- `nivel`, `xp`, `ouro`
- `status` (normal, envenenado, atordoado...)

### 3.2 Entidade Item

- `id`
- `nome`
- `tipo` (poção, arma, chave)
- `valor`
- `efeito` (cura, buff, desbloqueio)

### 3.3 Entidade Cena

- `id_cena`
- `texto_narrativo`
- `imagem_ref`
- `opcoes[]`
- `requisitos` (opcional)
- `efeitos` (mudança de estado ao entrar/sair)

---

## 4) Cálculos base (fórmulas iniciais)

Use fórmulas simples no começo:

- **Dano bruto**: `dano = ataque - defesa`
- **Dano mínimo**: `dano_final = max(1, dano)`
- **Crítico**: se `roll < crit_chance`, `dano_final = dano_final * 2`
- **Cura**: `hp_atual = min(hp_max, hp_atual + cura)`
- **XP por combate**: `xp += xp_inimigo`

Evolução por nível:

- `xp_necessaria = 100 * nivel`
- Ao subir de nível:
  - `hp_max += 10`
  - `ataque += 2`
  - `defesa += 1`

---

## 5) Estrutura de telas (texto + imagem)

## Tela de batalha (exemplo)

- Linha 1: Nome da cena
- Linha 2: Imagem atual (referência/asset)
- Linha 3-5: Caixa narrativa
- Linha 6: Status jogador/inimigo (HP/MP)
- Linha 7-9: Menu de ações

Exemplo de layout:

```text
[CAVERNA SOMBRIA]
[IMG: caverna_entrada.png]
"Um cheiro de enxofre invade o ar..."
"Um goblin surge das sombras!"
Jogador:  HP 34/40 | MP 10/12
Goblin:   HP 18/18
1) Atacar  2) Defender  3) Item  4) Fugir
> _
```

---

## 6) Pipeline de imagens (abordagem prática)

Se a Tom ainda não renderiza imagem diretamente, use este fluxo:

1. Tom calcula estado atual e define `imagem_ref` (string).
2. Runtime hospedeiro (Node, app desktop, webview, etc.) lê `imagem_ref`.
3. Runtime desenha imagem + texto.
4. Input do usuário volta para Tom como comando.

Assim você mantém o RPG visual sem sobrecarregar o compilador/runtime da linguagem.

---

## 7) Pseudofluxo de jogo

```text
iniciar_jogo()
  carregar_assets()
  definir_estado_inicial()

loop_principal:
  renderizar_tela(estado.cena_atual, estado.imagem_ref, estado.stats)
  comando = ler_entrada()
  aplicar_comando(comando, estado)
  resolver_eventos(estado)
  se estado.fim_de_jogo => encerrar
  ir para loop_principal
```

---

## 8) Exemplo de comandos Tom (conceitual)

> Abaixo está um exemplo **conceitual**, respeitando o estilo da Tom para operações numéricas/string.

```text
# dano_base = ataque - defesa
SubtrxyInSd32x@ataquey@defesa

# garante dano mínimo de 1 (lógica condicional fictícia para fluxo)
SEImprMenorxyInSd32x@dano_basey1-DefStkInSd32xdano_basey1

# hp_inimigo = hp_inimigo - dano_base
SubtrxyInSd32x@hp_inimigoy@dano_base

# concatenação de texto de log
SomarlUTxyxl'Voce causou 'yl' dano'
```

---

## 9) Nomes e convenções úteis

Padrão consistente ajuda muito:

- Prefixo de entidades: `pl_` (player), `en_` (enemy), `it_` (item), `cn_` (cena)
- Ex.: `pl_hp_atual`, `en_defesa`, `cn_imagem_ref`
- IDs numéricos para cenas e itens, nomes textuais para exibição.

---

## 10) Roadmap em 4 fases

### Fase 1 — Núcleo textual

- Batalha 1x1
- Menus de ação
- HP/MP/XP

### Fase 2 — Conteúdo e progressão

- 5 a 10 cenas
- inventário
- loja simples

### Fase 3 — Camada visual

- fundo por cena
- sprite estático de inimigo
- retratos de diálogo

### Fase 4 — Polimento

- salvamento/carregamento
- balanceamento de atributos
- efeitos sonoros/música

---

## 11) Checklist de viabilidade

- [ ] Já existe parser de entrada no seu runtime Tom?
- [ ] Você consegue atualizar tela em loop sem travar?
- [ ] Há estrutura para estado global do jogador?
- [ ] Tem como mapear `id_cena -> imagem_ref`?
- [ ] As fórmulas de dano/XP estão centralizadas?

---

## 12) Próximo passo objetivo

Implemente primeiro um **vertical slice**:

- 1 cena
- 1 inimigo
- 3 ações
- 1 imagem de fundo
- 1 tela de vitória

Se isso funcionar, o restante do RPG vira expansão de conteúdo, não reinvenção técnica.
