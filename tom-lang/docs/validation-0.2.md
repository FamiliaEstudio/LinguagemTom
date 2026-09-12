# Validação local Tom 0.2

Executada em 11–12/09/2026, com Node 24.21.0, LLVM 21.1.8, libmpdec 4.0.1,
SDL3 3.4.16, SDL_ttf 3.2.2 e DejaVu Sans.

| Ambiente | Suíte | Janela real |
|---|---|---|
| Ubuntu 26.04 x64 / WSLg XWayland | 88 aprovados, 0 ignorados | Aprovada |
| Windows x64 / LLVM-MinGW UCRT | 88 aprovados, 0 ignorados | Aprovada |

A suíte completa foi repetida em 12/09/2026 antes da publicação, incluindo os sete
testes de coloração adicionados à extensão 0.2.1. A gramática é exercitada com os
mesmos motores TextMate/Oniguruma usados pelo VS Code. As verificações de janela
real foram executadas na validação anterior de 11–12/09/2026.

Os testes verificaram LLVM com `opt`, fizeram o link e executaram programas em
`-O0` e `-O2`. Preservam os 43 testes da versão 0.1. Há 261 vetores publicados de
aritmética decimal128, comparados tanto com a avaliação BigInt quanto com o
runtime nativo. As adaptações desses vetores estão em
[fixtures/README.md](../tests/fixtures/README.md).

Os testes cobrem registro condicional e ordem de `Defer`, retorno, interrupção,
continuação, erro entre funções, relançamento e erro durante limpeza. Ciclos de criação e liberação de 25 janelas/fontes não retêm objetos. Dez mil
iterações com SOA, buffer e decimal verificam reinicialização, liberação final e
limite de objetos vivos. Texto cobre UTF-8, capacidade, `%` e recortes com alias.
A CLI preserva o executável anterior após erros de compilação ou link.

A calculadora foi exercitada pelo mesmo fonte Tom com eventos simulados e com
mensagens de janela nativas. `scripts/verify-desktop.js` abre uma janela SDL real,
envia eventos somente ao processo que criou, verifica visores `0,3`, `20`, `80`,
`5`, `Erro` e `15`, redimensiona para 600 × 800, captura o quadro e fecha a janela.
Windows usa mensagens Win32; Linux usa X11 no WSLg. As capturas das duas plataformas
foram inspecionadas e mostram os mesmos elementos e resultado.

Reprodução, após ativar `scripts/env.sh` ou `scripts/env.ps1`:

```text
npm --prefix tom-lang test
node scripts/verify-desktop.js
node scripts/verify-desktop.js --package
node tom-lang/tomc.js --build tom-lang/exemplos/calculadora.tom
```

Logs da suíte completa mais recente: `.tools/linux/test-publish.log` e
`.tools/windows/test-publish.log`. Os logs anteriores `test-0.2.log` registram os
81 testes existentes antes da atualização de coloração.
Capturas: `.tools/<plataforma>/validation/calculadora.bmp`.
A CI está versionada; a execução remota não foi disparada nesta validação.
O modo `--package` testa o executável de distribuição sem caminhos Node/LLVM
no PATH nem LD_LIBRARY_PATH da instalação de desenvolvimento.
Os resultados não certificam todas as distribuições Linux, dispositivos de escala,
fontes ou drivers. O alvo de referência Linux usa X11/XWayland e renderização por
software; o pacote Windows também permite o renderizador SDL disponível no sistema.
O host GPU antigo não faz parte desta validação.
