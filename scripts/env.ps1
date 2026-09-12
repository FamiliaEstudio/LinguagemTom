# Dot-source this file: . ./scripts/env.ps1
$tomRepo = Split-Path $PSScriptRoot -Parent
$tomPlatform = Join-Path $tomRepo '.tools/windows'
$tomNode = Join-Path $tomPlatform 'node'
$tomMingw = Join-Path $tomPlatform 'llvm-mingw/bin'
$tomLlvm = Join-Path $tomPlatform 'llvm/bin'
foreach ($tomFile in @("$tomNode/node.exe", "$tomMingw/clang.exe", "$tomLlvm/opt.exe")) {
    if (!(Test-Path $tomFile)) { throw 'Missing local tools. Run scripts/setup-windows.ps1 first.' }
}
$env:PATH = "$tomNode;$tomMingw;$tomLlvm;$tomPlatform/cmake/bin;$tomPlatform/ninja;$env:PATH"
$env:CLANG = Join-Path $tomMingw 'clang.exe'
$env:LLVM_OPT = Join-Path $tomLlvm 'opt.exe'
# Keep all temporary compiler/test files inside the ignored project directory.
$tomTemp = Join-Path $tomPlatform 'tmp'
New-Item -ItemType Directory -Force $tomTemp | Out-Null
$env:TMP = $tomTemp
$env:TEMP = $tomTemp
