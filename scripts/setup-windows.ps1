# Portable x64 toolchain; no administrator rights or permanent PATH changes.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Use PowerShell x64 on Windows x64.' }
$repo = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $repo '.tools'
$cache = Join-Path $tools 'downloads'
$platform = Join-Path $tools 'windows'
$config = Get-Content (Join-Path $PSScriptRoot 'toolchain.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $cache, $platform | Out-Null

function Invoke-Tool([string]$program, [string[]]$arguments) {
    # Start-Process needs one Windows command line; quote each argument, including
    # trailing backslashes. -Wait also works when invoked through WSL interop.
    $quoted = @($arguments | ForEach-Object {
        '"' + ($_ -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
    })
    $process = Start-Process -FilePath $program -ArgumentList $quoted -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "$program failed with exit code $($process.ExitCode)." }
}

function Install-Archive($spec, [string]$name, [string]$probe) {
    $destination = Join-Path $platform $name
    $marker = Join-Path $destination '.tom-sha256'
    if ((Test-Path $marker) -and (Test-Path (Join-Path $destination $probe)) -and
        ((Get-Content $marker -Raw).Trim() -eq $spec.sha256)) {
        Write-Host "$name already installed."
        return
    }
    # Never replace an unknown directory or publish an incomplete extraction.
    if (Test-Path $destination) { throw "Unexpected existing directory: $destination" }
    $archive = Join-Path $cache $spec.file
    if (!(Test-Path $archive)) {
        Write-Host "Downloading $($spec.file)..."
        $partial = "$archive.partial"
        Invoke-Tool 'curl.exe' @('--fail', '--location', '--retry', '3', '--connect-timeout', '30', '--output', $partial, $spec.url)
        if ((Get-FileHash $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $spec.sha256) {
            throw "Checksum mismatch: $partial"
        }
        Move-Item $partial $archive
    }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $spec.sha256) {
        throw "Checksum mismatch: $archive; remove the damaged archive and retry."
    }
    $staging = Join-Path $platform ("$name.partial-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory $staging | Out-Null
    try {
        Write-Host "Extracting $name..."
        Invoke-Tool 'tar.exe' @('-xf', $archive, '-C', $staging, '--strip-components=1')
        if (!(Test-Path (Join-Path $staging $probe))) { throw "Missing $probe in $archive" }
        Set-Content (Join-Path $staging '.tom-sha256') $spec.sha256 -Encoding ASCII
        Move-Item $staging $destination
    } finally {
        if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    }
}

Install-Archive $config.nodeWindows 'node' 'node.exe'
Install-Archive $config.mingwWindows 'llvm-mingw' 'bin/clang.exe'
# The smaller MinGW distribution does not ship opt. Keep the official complete
# LLVM distribution alongside it, preserving its tools and licenses.
Install-Archive $config.llvmWindows 'llvm' 'bin/opt.exe'
. (Join-Path $PSScriptRoot 'env.ps1')
Invoke-Tool 'node.exe' @('--version')
Invoke-Tool $env:CLANG @('--version')
Invoke-Tool $env:LLVM_OPT @('--version')
Invoke-Tool 'node.exe' @((Join-Path $PSScriptRoot 'setup-native.js'))
Write-Host 'Ready. Activate with: . ./scripts/env.ps1'
