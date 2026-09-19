# Usar o Codex com menos desperdício no projeto Tom

Orientação revisada em 18/09/2026. Este guia é para consulta do usuário; não precisa ser carregado em toda tarefa. A recomendação abaixo combina a estrutura local com a documentação oficial, sem benchmark comparativo dos modelos neste projeto.

## Qual modelo usar

Comece com **GPT-5.6 Terra em Medium** para desenvolvimento cotidiano. Se quiser mudar uma coisa por vez, experimente primeiro **Astra Medium** em tarefas familiares, comparando com seu uso atual de Astra Extra High.

| Trabalho no Tom | Ponto de partida sugerido |
| --- | --- |
| Texto, notas Obsidian, comentários, alteração simples de CSS com resultado definido | GPT-5.6 Luna, Light/Low |
| Correção localizada no Musical Tom/Companion; teste de regressão de um bug reproduzido; script pequeno | GPT-5.6 Terra, Medium |
| Recurso envolvendo vários módulos; integração entre Companion e VS Code; diagnóstico menos claro | GPT-5.6 Sol, Medium; High se necessário |
| Semântica, LLVM, empréstimos, limpeza, ABI C, corrupção de memória, persistência difícil | GPT-6 Astra, High |
| Problema difícil ainda sem solução, decisão arquitetural ampla, revisão de mudança delicada | GPT-6 Astra, Extra High |

Essa é uma regra inicial para este projeto, não garantia de qualidade ou economia. Um defeito simples no compilador pode caber em Terra; um bug de perda de dados em um aplicativo pode justificar Astra. O tamanho do repositório, sozinho, não determina o modelo.

Os papéis gerais — Astra para o trabalho mais difícil, Sol para tarefas complexas, Terra para o cotidiano e Luna para tarefas bem definidas — estão na [documentação oficial dos modelos](https://learn.chatgpt.com/docs/models#choosing-sol-terra-and-luna). Light é a denominação de esforço baixo em algumas interfaces; no CLI, Low. As opções disponíveis dependem da conta e do cliente.

## O que realmente reduz consumo

1. **Ajustar o esforço.** Maior esforço pode melhorar tarefas complexas, mas usa mais tokens. Pedir uma resposta curta reduz o texto visível; não substitui escolher um esforço menor no seletor. [Modelos e esforço](https://learn.chatgpt.com/docs/models#choosing-sol-terra-and-luna).
2. **Delimitar o contexto.** Informe aplicativo, comportamento, reprodução e resultado esperado. Com os caminhos corretos, o agente pode buscar a função e seus consumidores sem ler todo o projeto.
3. **Evitar repetição.** Continue na mesma conversa enquanto resolve o mesmo problema. Ao mudar de assunto/projeto, uma conversa nova com um resumo curto evita carregar histórico sem relação.
4. **Validar proporcionalmente.** Comece no teste do comportamento alterado. Mudanças de semântica/ABI exigem cobertura maior; uma correção de texto não exige reconstruir toda a toolchain.
5. **Manter instruções curtas.** `AGENTS.md` também ocupa contexto. Use-o para regras estáveis e caminhos; deixe explicações extensas em documentos consultados quando necessários.
6. **Usar um agente como padrão.** Trabalho paralelo pode reduzir tempo, mas também repete contexto e consome recursos. Reserve-o para tarefas divisíveis em que isso compense.

Modelo mais barato e menor quantidade de tokens são coisas distintas. No Codex com assinatura, a cota depende também de contexto, raciocínio, ferramentas e cache; com chave de API, o uso segue preços da API. Não há porcentagem de economia garantida por estes arquivos. Compare o consumo mostrado na sua conta e o retrabalho em tarefas semelhantes. [Uso e limites do Codex](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan).

O **Fast mode** de velocidade é uma opção diferente de reduzir o esforço: pode consumir créditos/cota mais rapidamente. Confira o seletor antes de usá-lo para economizar. [Preços e consumo](https://learn.chatgpt.com/docs/pricing).

## Como escolher na interface

No aplicativo/extensão, use o seletor de modelo e esforço abaixo da caixa de mensagem; abra **Advanced** quando disponível para escolher um modelo específico. No CLI, use `/model`. Para começar uma sessão CLI com Terra:

```bash
codex --model gpt-5.6-terra
```

Confira o esforço no seletor: escolher o modelo não significa selecionar automaticamente Medium. [Seleção de modelos](https://learn.chatgpt.com/docs/models).

Os arquivos de orientação deste projeto **não trocam o modelo nem o esforço da sessão**. Eles orientam leitura, implementação e testes. Não foi alterada configuração global do Codex.

## Como as instruções foram organizadas

- O `AGENTS.md` da pasta externa aponta para o repositório real em `LinguagemTom/` e para as notas separadas em `Entendendo código Tom/`.
- O `AGENTS.md` do repositório contém regras comuns e encaminha para a área da tarefa.
- As instruções locais cobrem linguagem, runtime C, host do Companion, aplicativo Companion, Musical Tom, scripts e notas.
- [mapa.md](mapa.md) relaciona código, contratos e comandos de validação, para consulta quando o agente não souber por onde começar.

O Codex descobre instruções da raiz do projeto até o diretório inicial; não carrega automaticamente todos os `AGENTS.md` descendentes. Por isso, as instruções da raiz também mandam ler o arquivo da área afetada. Inicie uma nova sessão na pasta de trabalho desejada para recarregar as orientações. Ao trabalhar em uma única área, abrir essa pasta pode ajudar a manter o foco. [Descoberta de AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

## Pedidos que dão contexto suficiente

Para uma correção localizada:

```text
No Musical Tom, o comportamento observado é <descreva>.
Para reproduzir: <passos>. O resultado esperado é <descreva>.
Investigue a área relacionada e implemente a correção com validação pertinente.
Ao terminar, resuma mudança, testes e limitações.
```

Para implementação após uma decisão já tomada:

```text
Implemente <recurso> no Tom Companion.
Decisão já tomada: <resumo>. Critérios de aceite: <lista curta>.
Comece em aplicativos/tom-companion e siga as dependências necessárias.
```

Para encerrar uma sessão longa e retomar depois:

```text
Prepare um resumo de retomada curto: objetivo, decisões, arquivos alterados,
testes executados e resultados, pendências e próximo passo concreto.
```

Cole esse resumo na conversa nova quando for continuar o trabalho. Salve-o em arquivo apenas se precisar de uma retomada persistente; não acrescente histórico de conversas aos `AGENTS.md`.

## Quando subir o modelo ou esforço

Antes de subir, confira se faltam reprodução, critérios de aceite ou acesso à ferramenta de teste. Mais raciocínio não corrige essas ausências. Quando o contexto estiver suficiente e o modelo repetir tentativas sem progresso, ou quando o risco técnico justificar análise profunda, passe para Sol/Astra com um resumo do que já foi descoberto.

Experimente em algumas tarefas reais: registre modelo/esforço, conclusão correta, retrabalho e consumo disponível no painel. Mantenha o ajuste mais econômico que entregar a qualidade necessária. Evite executar cada tarefa duas vezes só para comparar modelos.
