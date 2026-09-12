# Vetores decimais

`decimal128.json` contém 261 entradas, resultados numéricos e identificadores
selecionados de `dqAdd.decTest`, `dqSubtract.decTest`, `dqMultiply.decTest` e
`dqDivide.decTest` da suíte **General Decimal Arithmetic**, de Mike Cowlishaw/IBM.

Fonte: https://speleotrove.com/decimal/dectest.html
Arquivo: https://speleotrove.com/decimal/dectest.zip
SHA256 do arquivo usado: `b70a224cd52e82b7a8150aedac5efa2d0cb3941696fd829bdbe674f9f65c3926`.
Copyright (c) Mike Cowlishaw, 1981, 2010; partes IBM Corporation, 1981, 2008.

A seleção usa precisão 34, emin −6143, emax 6144 e half-even; inclui verificações
iniciais, amostragem ao longo de cada arquivo e casos de overflow, divisão por
zero e subfluxo. Entradas devem ser representáveis exatamente em Dc34. NaN e
infinito não são valores da Tom. As comparações são numéricas: zeros com sinal,
expoentes de coorte e zeros finais não precisam preservar a grafia do arquivo.
Grafias `.5`, `5.` e `+5` foram normalizadas para a sintaxe literal Tom. `0/0` e
qualquer divisão por zero recebem o código Tom 2; overflow, 1; underflow, 3.
Não se trata da suíte completa nem de certificação de conformidade.

Para regenerar a seleção, salve o arquivo verificado em `.tools/downloads/dectest.zip`
e execute `python3 scripts/import-decimal-vectors.py` a partir da raiz.
