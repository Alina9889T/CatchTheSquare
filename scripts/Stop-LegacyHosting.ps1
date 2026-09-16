#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$log = Join-Path $root 'bin/Background/stop-legacy.log'
Start-Transcript -Path $log -Force
try {
    $runner = Join-Path $root 'scripts\Run-Background.ps1'
    $dll = Join-Path $root 'bin\Background\app\CatchTheSquare.dll'
    $tasks = @(Get-ScheduledTask | Where-Object { $_.TaskName -in @('CatchTheSquare-App','CatchTheSquare-Tunnel') })
    foreach ($task in $tasks) {
        if (-not (@($task.Actions | Where-Object { $_.Arguments -like "*$runner*" }).Count)) { throw 'Task action does not match this project.' }
        Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Out-Null
        Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
        Write-Output "Stopped and disabled: $($task.TaskName)"
    }
    $processes = @(Get-CimInstance Win32_Process)
    $supervisors = @($processes | Where-Object { $_.Name -in @('powershell.exe','pwsh.exe') -and $_.CommandLine -like "*$runner*" -and $_.CommandLine -match '-Mode\s+(App|Tunnel)' })
    foreach ($process in $supervisors) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
    $children = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq 'dotnet.exe' -and $_.CommandLine -like "*$dll*") -or
        ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -match 'tunnel\s+--url\s+http://localhost:5091(?:\s|$)')
    })
    foreach ($process in $children) {
        Stop-Process -Id $process.ProcessId -Force
        Write-Output "Stopped: $($process.Name) ($($process.ProcessId))"
    }
    Start-Sleep -Seconds 12
    if (Get-NetTCPConnection -LocalPort 5091 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5091 is still listening.' }
    $remaining = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq 'dotnet.exe' -and $_.CommandLine -like "*$dll*") -or
        ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -match 'tunnel\s+--url\s+http://localhost:5091(?:\s|$)') -or
        ($_.Name -in @('powershell.exe','pwsh.exe') -and $_.CommandLine -like "*$runner*" -and $_.CommandLine -match '-Mode\s+(App|Tunnel)')
    })
    if ($remaining.Count) { throw 'Legacy processes remain.' }
    Set-Content -LiteralPath (Join-Path $root 'bin/Background/tunnel-url.txt') -Value 'Stopped after migration. Active game: https://catch-the-square.turkina-a89.workers.dev'
    Write-Output 'SUCCESS: legacy hosting stopped; port 5091 free; no restart after 12 seconds.'
} catch {
    Write-Output "FAILED: $_"
    exit 1
} finally { Stop-Transcript }