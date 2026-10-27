[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runDirectory = Join-Path $repositoryRoot 'var\local-run'
$statePath = Join-Path $runDirectory 'state.json'

try {
    if (!(Test-Path -LiteralPath $statePath)) {
        Write-Host 'No application session owned by this launcher is running.'
        exit 0
    }
    $state = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
    if ($state.root -ne $repositoryRoot -or $state.token -notmatch '^[a-f0-9]{32}$') {
        throw 'Launcher ownership information is invalid. No process was stopped.'
    }
    $owner = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if ($null -eq $owner -or $owner.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.startTicks) {
        Write-Host 'The launcher is already stopped. Docker services and volumes remain available.'
        exit 0
    }
    [IO.File]::WriteAllText((Join-Path $runDirectory "$($state.token).stop"), '')
    Write-Host 'Stopping the application processes owned by the MARKOS launcher...'
    if (!$owner.WaitForExit(30000)) {
        throw 'The launcher did not stop within 30 seconds. Inspect var\local-run\supervisor.error.log; no unrelated process was terminated.'
    }
    Write-Host 'MARKOS stopped. Docker services and all data volumes remain available.'
} catch {
    Write-Host "MARKOS could not stop: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
