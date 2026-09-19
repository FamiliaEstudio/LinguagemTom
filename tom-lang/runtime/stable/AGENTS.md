# Runtime C estável

- Leia o contrato pertinente em `README.md` e `tom_runtime.h`, depois a implementação e os testes que usam a operação.
- Operações da ABI normalmente retornam status `int32_t` e recebem saída por parâmetro. Preserve o destino em falhas, inicialize novos handles conforme o contrato e mantenha liberações seguras para NULL.
- Handles e empréstimos têm duração controlada pelo compilador. Confira `../../core/builtins.js`, `../../core/resources.js` e emissão ao mudar ABI ou duração de recursos.
- Runtime fornece operações gerais; regras de jogos, curso e aplicativos pertencem aos programas Tom.
- Preserve compatibilidade Windows/MinGW e Linux. Confira `CMakeLists.txt` e `../../core/native-build.js` quando adicionar fontes ou bibliotecas.
- Valide sucesso, erros, limpeza e limites na suíte correspondente de `../../tests/`, incluindo O0/O2 quando pertinente. Teste com driver SDL dummy não comprova janela, clipboard ou áudio reais.
