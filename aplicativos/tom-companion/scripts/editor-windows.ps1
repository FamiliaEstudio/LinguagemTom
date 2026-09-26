param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
$launch = Get-Content -Raw -Encoding UTF8 $Request | ConvertFrom-Json
# WSL interop can inherit the Windows environment independently of Linux env.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:PATHEXT = '.COM;.EXE;.BAT;.CMD'
$arguments = @($launch.arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' })
$process = Start-Process -FilePath $launch.code -ArgumentList $arguments -PassThru -RedirectStandardOutput $launch.stdout -RedirectStandardError $launch.stderr
# Wait for this test editor, not shared WSL server descendants that may outlive it.
$process.WaitForExit()
exit $process.ExitCode
