# Tom Companion 0.1.0 — pacote local

Esta pasta contém os processos Tom sem janela, as demonstrações nativas, bibliotecas e licenças. O código e o
roteiro estão em `support/`. O acompanhamento usa a extensão Tom no VS Code
e as ferramentas locais para compilar o código que você escreve.

1. Instale o VSIX Tom 0.4.0 distribuído junto deste pacote em
   **Extensions: Install from VSIX** no VS Code.
2. Prepare as ferramentas uma vez. No PowerShell do Windows:

   ```powershell
   cd support
   ./scripts/setup-windows.ps1
   ```

   No Linux/WSL:

   ```bash
   cd support
   bash scripts/setup-linux.sh
   ```

   Confira os pré-requisitos em [support/scripts/README.md](support/scripts/README.md).
   Depois dessa preparação o acompanhamento funciona offline. Quem já tem as
   ferramentas Tom pode reutilizar sua pasta `.tools/windows` ou `.tools/linux`.
3. Configure `tom.companion.installation` no VS Code com o caminho absoluto
   **desta pasta**, que contém `companion-install.json`. Configure
   `tom.companion.toolchain` com `support/.tools/windows` ou `support/.tools/linux`.
4. Execute **Tom: Abrir Tom Companion** em uma pasta confiável. Também há botão
   no editor e atalho **Ctrl+Alt+Shift+T** quando um arquivo Tom está aberto. Escolha onde
   escrever sua calculadora; `calculadora.tom` será criado vazio se não existir.
   O acompanhamento aparece na lateral e o mapa no painel inferior do mesmo VS Code.

No VS Code conectado ao WSL, instale a extensão no WSL, use o pacote Linux e
caminhos Linux. Os processos integrados dispensam servidor gráfico. Executar a calculadora exige WSLg/X11.

**Pista** oferece ajuda gradual, **Verificar** usa inclusive código não salvo,
**Próximo** avança somente por sua decisão, **Fonte** ajusta a leitura. Tab e
Enter/Espaço navegam pelos controles. O botão **Salvar** guarda o acompanhamento,
sem salvar seu fonte. O progresso está em `.tom-companion/progresso.json` na
pasta escolhida.

Veja o [guia completo](support/aplicativos/tom-companion/README.md) e a
[validação](support/aplicativos/tom-companion/VALIDACAO.md). `SHA256.json` registra
os arquivos desta distribuição. Copie a pasta inteira, preservando bibliotecas,
fontes, licenças e `support/`; abrir apenas o executável não inicia o acompanhamento.

## Mapa do código

O pacote inclui `mapa/mapa` (Linux) ou `mapa/mapa.exe` (Windows), fonte DejaVu
Sans Mono e licença. Abra pelo comando **Tom: Abrir mapa do código no Companion**
na extensão instalada. O analisador roda no Node local da instalação; a apresentação usa SVG dentro do VS Code, com geometria e interação em Tom. Consulte `MAPA.md` e `support/tom-lang/docs/code-map.md`.

Use **Tom: Encerrar Tom Companion** para salvar e encerrar. Ocultar os painéis
preserva a sessão. Instalações antigas precisam ser atualizadas com o pacote completo.
