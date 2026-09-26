param(
    [string]$InstallRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\Scriptorium'),
    [string]$Desktop = [Environment]::GetFolderPath('Desktop'),
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$Desktop = [IO.Path]::GetFullPath($Desktop)
$staging = $null
try {
    $manifestPath = Join-Path $source 'scriptorium-package.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.application -ne 'Scriptorium' -or $manifest.platform -ne 'win32' -or $manifest.testUI) {
        throw 'Este não é um pacote de produção do Scriptorium para Windows.'
    }
    foreach ($entry in $manifest.files) {
        $relative = [string]$entry.path
        $parts = $relative -split '/'
        if ([IO.Path]::IsPathRooted($relative) -or $parts -contains '..' -or $relative.Contains('\')) {
            throw "Caminho inválido no manifesto: $relative"
        }
        $file = Join-Path $source ($relative -replace '/', '\')
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo ausente: $relative" }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne [string]$entry.sha256) { throw "Hash inválido: $relative" }
    }
    $packageId = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.Substring(0, 16).ToLowerInvariant()
    $versions = Join-Path $InstallRoot 'versions'
    $destination = Join-Path $versions $packageId
    New-Item -ItemType Directory -Path $versions -Force | Out-Null
    if (!(Test-Path -LiteralPath $destination)) {
        $staging = Join-Path $versions ('.staging-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $staging | Out-Null
        foreach ($entry in $manifest.files) {
            $relative = [string]$entry.path
            if ($relative -eq 'scriptorium.ll') { continue }
            $relativePath = $relative -replace '/', '\'
            $target = Join-Path $staging $relativePath
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $source $relativePath) -Destination $target
            $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne [string]$entry.sha256) { throw "Cópia incompleta: $relative" }
        }
        Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $staging 'scriptorium-package.json')
        Move-Item -LiteralPath $staging -Destination $destination
        $staging = $null
    }
    $executable = Join-Path $destination 'scriptorium.exe'
    $launcher = Join-Path $destination 'Abrir-Scriptorium.exe'
    $icon = Join-Path $destination 'scriptorium.ico'
    if (!(Test-Path -LiteralPath $executable) -or !(Test-Path -LiteralPath $launcher) -or !(Test-Path -LiteralPath $icon)) {
        throw 'A instalação existente está incompleta.'
    }
    New-Item -ItemType Directory -Path $Desktop -Force | Out-Null
    $shortcutPath = Join-Path $Desktop 'Scriptorium.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcher
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Description = 'Scriptorium — escrita e organização do acervo'
    $shortcut.Save()
    Write-Output "Scriptorium instalado: $executable"
    Write-Output "Atalho criado: $shortcutPath"
    if (!$Quiet) { $shell.Popup('Scriptorium instalado. O atalho está na área de trabalho.', 0, 'Scriptorium', 64) | Out-Null }
} catch {
    if (!$Quiet) {
        $shell = New-Object -ComObject WScript.Shell
        $shell.Popup("Falha ao instalar o Scriptorium: $($_.Exception.Message)", 0, 'Scriptorium', 16) | Out-Null
    }
    throw
} finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
