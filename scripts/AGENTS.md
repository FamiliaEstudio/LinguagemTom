# Ferramentas e distribuição

- `README.md` documenta preparo; `toolchain.json` fixa versões/URLs/hashes. Consulte apenas a plataforma e a dependência afetadas.
- Mantenha ferramentas em `.tools/` e ativação por `env.sh`/`env.ps1`, preservando instalações globais.
- Confira os dois ambientes ao mudar scripts comuns: Linux/WSL e Windows/PowerShell. Compatibilidade entre ABIs e publicação atômica dos builds fazem parte do contrato.
- `package-extension.js` empacota a extensão. Os scripts `verify-*` cobrem comportamentos distintos: selecione os da área alterada, consultando requisitos de desktop/áudio no README.
- Ao mudar setup ou empacotamento, confira os consumidores em `.github/workflows/core.yml` a partir da raiz do repositório e reporte plataformas efetivamente validadas.
