#Requires -RunAsAdministrator
param([string]$CloudflaredPath = 'C:\cloudflared\cloudflared.exe')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root 'bin\Background'
New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'logs') | Out-Null
Start-Transcript -Path (Join-Path $runtime 'install.log') -Force
try {
    $dotnet = (Get-Command dotnet.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath $CloudflaredPath)) { throw "cloudflared not found: $CloudflaredPath" }
    if (Get-NetTCPConnection -LocalPort 5091 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5091 is busy. Stop the application before installation.' }
    foreach ($mode in 'App','Tunnel') {
        if (Get-ScheduledTask -TaskName "CatchTheSquare-$mode" -ErrorAction SilentlyContinue) { throw 'Tasks already exist. Stop and unregister them before reinstalling.' }
    }
    & $dotnet publish (Join-Path $root 'CatchTheSquare.csproj') -c Release -o (Join-Path $runtime 'app') --nologo
    if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }
    @{ Dotnet = $dotnet; Cloudflared = (Resolve-Path -LiteralPath $CloudflaredPath).Path } | ConvertTo-Json | Set-Content (Join-Path $runtime 'config.json')
    if (-not (Test-Path (Join-Path $root 'users.json'))) { Set-Content (Join-Path $root 'users.json') '[]' }
    & icacls.exe $root /grant '*S-1-5-19:(OI)(CI)RX'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot grant application read access.' }
    & icacls.exe (Join-Path $runtime 'logs') /grant '*S-1-5-19:(OI)(CI)M'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot grant log access.' }
    Set-Content (Join-Path $runtime 'tunnel-url.txt') 'Waiting for tunnel.'
    foreach ($file in @((Join-Path $root 'users.json'), (Join-Path $runtime 'tunnel-url.txt'))) {
        & icacls.exe $file /grant '*S-1-5-19:M'
        if ($LASTEXITCODE -ne 0) { throw "Cannot grant write access: $file" }
    }
    & icacls.exe $CloudflaredPath /grant '*S-1-5-19:RX'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot grant cloudflared read access.' }
    $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    foreach ($mode in 'App','Tunnel') {
        $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Mode {1}' -f (Join-Path $PSScriptRoot 'Run-Background.ps1'), $mode
        $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $root
        Register-ScheduledTask -TaskName "CatchTheSquare-$mode" -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Description 'CatchTheSquare background hosting' | Out-Null
    }
    Start-ScheduledTask -TaskName CatchTheSquare-App
    Start-ScheduledTask -TaskName CatchTheSquare-Tunnel
    Write-Host "Installed. Current URL: $runtime\tunnel-url.txt"
} finally { Stop-Transcript }
