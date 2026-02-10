const fs = require('fs');

// 1. Ler o arquivo de entrada (ex: teste.tom)
const inputFile = process.argv[2] || 'teste.tom';
const sourceCode = fs.readFileSync(inputFile, 'utf-8');

// 2. Cabeçalho padrão do LLVM (Define uma função main para rodar)
let llvmOutput = `
define i32 @main() {
entry:
`;

// Variável para contar registradores virtuais (%1, %2...)
let regCount = 0;

// 3. O Parser (Analisador)
// Vamos procurar por: SomarxyInSd32 x[VALOR] y[VALOR]
// Regex explicada:
// Somarxy   -> Comando fixo
// (InSd32)  -> Tipo (Captura 1)
// x(\d+)    -> Separador x e primeiro numero (Captura 2)
// y(\d+)    -> Separador y e segundo numero (Captura 3)
const linhas = sourceCode.split('\n');

linhas.forEach(linha => {
    // Remove espaços extras
    linha = linha.trim();
    if (!linha) return;

    // Padrão para SOMA de Inteiros 32 bits Signed
    const matchSoma = linha.match(/SomarxyInSd32x(\d+)y(\d+)/);

    if (matchSoma) {
        const val1 = matchSoma[1];
        const val2 = matchSoma[2];
        regCount++; // Incrementa registrador

        // Gera a linha do LLVM
        // %1 = add nsw i32 10, 20
        llvmOutput += `  %res${regCount} = add nsw i32 ${val1}, ${val2}\n`;

        // Para vermos algo acontecendo, vamos retornar esse valor no final
        llvmOutput += `  ret i32 %res${regCount}\n`;
    }
});

// Fechar a função main se não tiver retorno (apenas para evitar erro de sintaxe no teste)
if (!llvmOutput.includes('ret i32')) {
    llvmOutput += `  ret i32 0\n`;
}

llvmOutput += `}\n`;

// 4. Salvar o arquivo .ll
fs.writeFileSync('output.ll', llvmOutput);
console.log("Compilação concluída! Arquivo 'output.ll' gerado.");
console.log("Conteúdo gerado:\n");
console.log(llvmOutput);