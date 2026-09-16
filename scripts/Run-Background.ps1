param([Parameter(Mandatory=$true)][ValidateSet('App','Tunnel')][string]$Mode)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path $root 'bin\Background'
$config = Get-Content (Join-Path $runtime 'config.json') -Raw | ConvertFrom-Json
$logs = Join-Path $runtime 'logs'
Set-Location $root
while ($true) {
    $child = $null
    try {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $stdout = Join-Path $logs "$Mode-$stamp.out.log"
        $stderr = Join-Path $logs "$Mode-$stamp.err.log"
        if ($Mode -eq 'App') {
            $env:ASPNETCORE_ENVIRONMENT = 'Production'
            $child = Start-Process -FilePath $config.Dotnet -ArgumentList ('"{0}" --urls http://localhost:5091 --contentRoot "{1}"' -f (Join-Path $runtime 'app\CatchTheSquare.dll'), (Join-Path $runtime 'app')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        } else {
            Set-Content (Join-Path $runtime 'tunnel-url.txt') 'Starting tunnel; URL not available yet.'
            $child = Start-Process -FilePath $config.Cloudflared -ArgumentList 'tunnel --url http://localhost:5091' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        }
        $urlSaved = $false
        while (-not $child.HasExited) {
            if ($Mode -eq 'Tunnel' -and -not $urlSaved) {
                $text = (Get-Content $stderr,$stdout -Raw -ErrorAction SilentlyContinue) -join "`n"
                if ($text -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                    Set-Content (Join-Path $runtime 'tunnel-url.txt') $Matches[0]
                    $urlSaved = $true
                }
            }
            Start-Sleep -Seconds 2
            $child.Refresh()
        }
        Add-Content (Join-Path $logs 'supervisor.log') "$(Get-Date -Format o) $Mode exited: $($child.ExitCode)"
    } catch {
        Add-Content (Join-Path $logs 'supervisor.log') "$(Get-Date -Format o) $Mode error: $_"
    } finally {
        if ($child -and -not $child.HasExited) { $child.Kill(); $child.WaitForExit() }
        if ($Mode -eq 'Tunnel') { Set-Content (Join-Path $runtime 'tunnel-url.txt') 'Tunnel stopped; waiting for restart.' }
    }
    Start-Sleep -Seconds 10
}
