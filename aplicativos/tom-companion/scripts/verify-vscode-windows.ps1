$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Set-Location $repo
. ./scripts/env.ps1
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
node aplicativos/tom-companion/scripts/build.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$code = if ($env:TOM_VSCODE_EXE) { $env:TOM_VSCODE_EXE } else { (Get-Command code -ErrorAction Stop).Source -replace '\\bin\\code.cmd$', '\Code.exe' }
$tomTestProfile = Join-Path $repo 'aplicativos/tom-companion/build/vscode-integrated-profile'
$workspace = Join-Path $repo 'aplicativos/tom-companion/build/vscode/win32'
New-Item -ItemType Directory -Force $workspace | Out-Null
$tomDebugListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$tomDebugListener.Start()
$env:TOM_WEBVIEW_TEST_PORT = [string]$tomDebugListener.LocalEndpoint.Port
$tomDebugListener.Stop()
$argsCode = @(
  ('--remote-debugging-port=' + $env:TOM_WEBVIEW_TEST_PORT)
  ('--extensionDevelopmentPath="' + $repo + '\tom-lang"')
  ('--extensionTestsPath="' + $repo + '\aplicativos\tom-companion\tests\vscode-host.js"')
  ('--user-data-dir="' + $tomTestProfile + '"')
  ('--extensions-dir="' + $tomTestProfile + '\extensions"')
  '--disable-workspace-trust'
  '--skip-welcome'
  '--skip-release-notes'
  '--disable-updates'
  ('"' + $workspace + '"')
)
Remove-Item (Join-Path $workspace 'result.json') -ErrorAction SilentlyContinue
$process = Start-Process $code -ArgumentList $argsCode -WorkingDirectory $repo -PassThru -Wait -RedirectStandardOutput ($tomTestProfile+'.stdout') -RedirectStandardError ($tomTestProfile+'.stderr')
$stdout = Get-Content ($tomTestProfile+'.stdout')
$stderr = Get-Content ($tomTestProfile+'.stderr')
$stdout | Select-String -Pattern 'AssertionError|Error:|tests|TEST|integrated'
$stderr | Select-String -Pattern 'pipim-studios|Error|Assertion'
if ($stderr -match '\[pipim-studios.tom-lang\]') { throw 'O VS Code recusou contribuições do manifesto.' }
exit $process.ExitCode
