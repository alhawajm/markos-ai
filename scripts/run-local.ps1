[CmdletBinding()]
param(
    [ValidateSet('', 'safe', 'live-ai', 'railway')][string]$Mode = '',
    [switch]$NoBrowser,
    [switch]$Supervisor,
    [ValidateSet('', 'web', 'api', 'ai', 'worker', 'database-tunnel')][string]$Service = '',
    [string]$RunToken = ''
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runDirectory = Join-Path $repositoryRoot 'var\local-run'
$statePath = Join-Path $runDirectory 'state.json'
$powershellPath = Join-Path $PSHOME 'powershell.exe'
$scriptPath = Join-Path $PSScriptRoot 'run-local.ps1'
$applicationUrl = 'http://localhost:3000/en'

function Read-EnvironmentFile([string]$Path) {
    $values = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in [IO.File]::ReadAllLines($Path)) {
            if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
                $key = $Matches[1]
                $value = $Matches[2]
                if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                    $value = $value.Substring(1, $value.Length - 2)
                } else { $value = ($value -replace '\s+#.*$', '').TrimEnd() }
                $values[$key] = $value
            }
        }
    }
    return $values
}

if ($Mode -eq '') {
    $configuredMode = (Read-EnvironmentFile (Join-Path $repositoryRoot '.env'))['MARKOS_RUN_MODE']
    $Mode = if ([string]::IsNullOrWhiteSpace($configuredMode)) { 'safe' } else { $configuredMode }
    if ($Mode -notin @('safe', 'live-ai', 'railway')) { throw 'MARKOS_RUN_MODE must be safe, live-ai or railway.' }
}
$applicationServices = if ($Mode -eq 'railway') { @('database-tunnel', 'api', 'web') } else { @('ai', 'api', 'web', 'worker') }

function Get-DatabaseIdentity {
    try {
        $databaseUrl = [Uri](Read-EnvironmentFile (Join-Path $repositoryRoot '.env'))['DATABASE_URL']
        $databasePort = if ($databaseUrl.Port -eq -1) { 5432 } else { $databaseUrl.Port }
        return '{0}:{1}{2}' -f $databaseUrl.DnsSafeHost, $databasePort, $databaseUrl.AbsolutePath
    } catch { return 'invalid' }
}

function Get-ConfigurationStamp {
    $stamp = [IO.File]::GetLastWriteTimeUtc((Join-Path $repositoryRoot '.env')).Ticks.ToString()
    if ($Mode -ne 'railway') { $stamp += ':' + [IO.File]::GetLastWriteTimeUtc((Join-Path $repositoryRoot 'services\ai\.env')).Ticks.ToString() }
    return $stamp
}

function Get-TunnelIdentity {
    if ($Mode -ne 'railway') { return 'none' }
    $target = (Read-EnvironmentFile (Join-Path $repositoryRoot '.env'))['MARKOS_RAILWAY_SSH_TARGET']
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($target))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}

function Set-LocalEnvironment {
    $values = Read-EnvironmentFile (Join-Path $repositoryRoot '.env')
    if ($Service -eq 'ai') {
        $aiValues = Read-EnvironmentFile (Join-Path $repositoryRoot 'services\ai\.env')
        foreach ($key in $aiValues.Keys) { $values[$key] = $aiValues[$key] }
    }
    foreach ($key in $values.Keys) { [Environment]::SetEnvironmentVariable($key, $values[$key], 'Process') }
    # Browser authentication and API requests stay local in every profile.
    $rootValues = Read-EnvironmentFile (Join-Path $repositoryRoot '.env')
    $env:DATABASE_URL = $rootValues['DATABASE_URL']
    $env:REDIS_URL = 'redis://localhost:6379'
    $env:OPENSEARCH_URL = 'http://localhost:9200'
    $env:API_BASE_URL = 'http://localhost:4000'
    $env:WEB_BASE_URL = 'http://localhost:3000'
    $env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000'
    $env:API_PORT = '4000'
    $env:PORT = $null
    $env:NODE_ENV = 'development'
    if ($Mode -eq 'railway') {
        $env:API_HOST = '127.0.0.1'
        $env:AI_BASE_URL = $rootValues['AI_BASE_URL']
        $env:MEDIA_STORAGE_DRIVER = $rootValues['MEDIA_STORAGE_DRIVER']
        $env:MEDIA_PUBLIC_BASE_URL = $rootValues['MEDIA_PUBLIC_BASE_URL']
        $env:CONVERSATION_PROCESSOR_ENABLED = 'false'
        # AI and background work use the already-running Railway services.
    } else {
        $env:AI_BASE_URL = 'http://localhost:8000'
        $env:EMAIL_PROVIDER = 'local'
        $env:MEDIA_STORAGE_DRIVER = 'local'
        $env:MEDIA_PUBLIC_BASE_URL = 'http://localhost:4000'
        $env:INSTAGRAM_PUBLISH_MODE = 'dry_run'
        $env:INSTAGRAM_ANALYTICS_SYNC_MODE = 'dry_run'
        $env:AI_TEXT_PROVIDER = if ($Mode -eq 'live-ai') { 'openai' } else { 'local' }
        $env:AI_IMAGE_PROVIDER = 'disabled'
        $env:AI_VIDEO_PROVIDER = 'disabled'
        $env:CONVERSATION_PROCESSOR_ENABLED = 'true'
        # Safe controls generation/publication; it is not an offline mode. If real
        # Instagram credentials are later configured, normal token maintenance runs.
        $env:WORKER_ROLE = 'all'
    }
}

function Read-RunState {
    if (!(Test-Path -LiteralPath $statePath)) { return $null }
    try { return [IO.File]::ReadAllText($statePath) | ConvertFrom-Json } catch { return $null }
}

function Test-RunOwner($State) {
    if ($null -eq $State -or $State.root -ne $repositoryRoot) { return $false }
    try {
        $owner = Get-Process -Id $State.pid -ErrorAction Stop
        return $owner.StartTime.ToUniversalTime().Ticks.ToString() -eq $State.startTicks
    } catch { return $false }
}

function Get-ApplicationHealth {
    $health = @{ ready = $false; databaseReady = $false }
    try {
        $api = Invoke-RestMethod -Uri 'http://localhost:4000/v1/health/deep' -TimeoutSec 10
        $health.databaseReady = $api.data.service -eq 'api' -and $api.data.dependencies.database.status -eq 'ok'
        if ($api.data.status -ne 'ok') { return $health }
        $aiBaseUrl = if ($Mode -eq 'railway') { (Read-EnvironmentFile (Join-Path $repositoryRoot '.env'))['AI_BASE_URL'] } else { 'http://localhost:8000' }
        $ai = Invoke-RestMethod -Uri ($aiBaseUrl.TrimEnd('/') + '/ai/health') -TimeoutSec 10
        $web = Invoke-WebRequest -UseBasicParsing -Uri $applicationUrl -TimeoutSec 10
        $health.ready = $health.databaseReady -and $ai.service -eq 'ai' -and $ai.status -eq 'ok' -and $web.StatusCode -eq 200
    } catch { }
    return $health
}

function Test-ApplicationHealth { return (Get-ApplicationHealth).ready }

function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (!$pending.AsyncWaitHandle.WaitOne(300)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}

function Invoke-LoggedCommand([string]$File, [string[]]$Arguments, [string]$Log) {
    # Windows PowerShell can classify native stderr as an error even when a tool
    # succeeds (Docker progress is one example). Native exit status is authoritative.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $File @Arguments 2>&1
        $exitStatus = $LASTEXITCODE
        $lines = @($output | ForEach-Object { $_.ToString() -replace 'postgres(?:ql)?://[^\s"''<>]+', '[redacted database URL]' })
        [IO.File]::WriteAllLines($Log, [string[]]$lines)
        return $exitStatus
    } finally { $ErrorActionPreference = $previousPreference }
}

function Test-DatabaseCompatibility {
    Write-Host 'Checking database migration compatibility without changing data...'
    $databaseStatus = Invoke-LoggedCommand 'node' @((Join-Path $repositoryRoot 'apps\api\node_modules\prisma\build\index.js'), 'migrate', 'status', '--schema', (Join-Path $repositoryRoot 'apps\api\prisma\schema.prisma')) (Join-Path $runDirectory 'database-status.log')
    if ($databaseStatus -ne 0) { throw 'The configured database is not compatible with this checkout. See var\local-run\database-status.log. This launcher never migrates or resets databases.' }
}

function Write-RunState([string]$Status, [string]$Message = '') {
    $current = Get-Process -Id $PID
    $state = [ordered]@{ root = $repositoryRoot; pid = $PID; startTicks = $current.StartTime.ToUniversalTime().Ticks.ToString(); token = $RunToken; mode = $Mode; databaseIdentity = $runDatabaseIdentity; tunnelIdentity = $runTunnelIdentity; configurationStamp = $runConfigurationStamp; status = $Status; message = $Message }
    $temporary = Join-Path $runDirectory "$RunToken-state.tmp"
    [IO.File]::WriteAllText($temporary, ($state | ConvertTo-Json))
    Move-Item -LiteralPath $temporary -Destination $statePath -Force
}

function Start-OwnedService([string]$Name) {
    $serviceJob = New-Object MarkosLocalJob
    $child = $null
    $goPath = Join-Path $runDirectory "$RunToken-$Name.go"
    Remove-Item -LiteralPath $goPath -ErrorAction SilentlyContinue
    try {
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Mode {1} -Service {2} -RunToken {3}' -f $scriptPath, $Mode, $Name, $RunToken
        $child = Start-Process -FilePath $powershellPath -ArgumentList $arguments -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory "$Name.log") -RedirectStandardError (Join-Path $runDirectory "$Name.error.log")
        $serviceJob.Add($child.Handle)
        $ownedServices[$Name] = @{ process = $child; job = $serviceJob }
        [IO.File]::WriteAllText($goPath, '')
    } catch {
        if ($null -ne $child -and !$child.HasExited) { $child.Kill() }
        $serviceJob.Dispose()
        throw
    }
}

function Stop-OwnedService([string]$Name) {
    if (!$ownedServices.ContainsKey($Name)) { return }
    $owned = $ownedServices[$Name]
    $owned.job.Dispose() # Terminates only this service's process tree, including SSH/Prisma children.
    [void]$owned.process.WaitForExit(5000)
    $owned.process.Dispose()
    $ownedServices.Remove($Name)
    Remove-Item -LiteralPath (Join-Path $runDirectory "$RunToken-$Name.go") -ErrorAction SilentlyContinue
}

function Wait-DatabaseTunnel {
    $tunnelDeadline = [DateTime]::UtcNow.AddSeconds(45)
    while (!(Test-Port 15432)) {
        if ($ownedServices['database-tunnel'].process.HasExited) { throw 'The Railway database tunnel exited. Inspect var\local-run\database-tunnel.error.log.' }
        if (Test-Path -LiteralPath $stopPath) { throw 'Stop requested.' }
        if ([DateTime]::UtcNow -gt $tunnelDeadline) { throw 'The Railway database tunnel did not become ready. Check its SSH configuration.' }
        Start-Sleep -Milliseconds 500
    }
}

# Each hidden service waits for assignment to the supervisor's Windows Job Object.
# No application process can start before its ownership boundary exists.
if ($Service -ne '') {
    if ($RunToken -notmatch '^[a-f0-9]{32}$') { throw 'Invalid internal launcher token.' }
    $goPath = Join-Path $runDirectory "$RunToken-$Service.go"
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (!(Test-Path -LiteralPath $goPath)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Launcher ownership handshake expired.' }
        Start-Sleep -Milliseconds 100
    }
    Set-LocalEnvironment
    $ErrorActionPreference = 'Continue'
    switch ($Service) {
        'database-tunnel' {
            $sshValues = Read-EnvironmentFile (Join-Path $repositoryRoot '.env')
            # SSH's own config quoting preserves spaces in Windows paths. The file
            # contains paths only; private key material stays in the original file.
            $sshConfigPath = Join-Path $runDirectory "$RunToken-ssh.conf"
            $sshKeyPath = $sshValues['MARKOS_RAILWAY_SSH_KEY_PATH'].Replace('\', '/')
            $sshKnownHostsPath = $sshValues['MARKOS_RAILWAY_SSH_KNOWN_HOSTS_PATH'].Replace('\', '/')
            [IO.File]::WriteAllLines($sshConfigPath, @('Host *', ('  IdentityFile "{0}"' -f $sshKeyPath), ('  UserKnownHostsFile "{0}"' -f $sshKnownHostsPath)))
            $sshArguments = @('-F', $sshConfigPath, '-N', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ExitOnForwardFailure=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-L', '127.0.0.1:15432:127.0.0.1:5432', $sshValues['MARKOS_RAILWAY_SSH_TARGET'])
            & ssh.exe @sshArguments
        }
        'web' {
            Set-Location -LiteralPath (Join-Path $repositoryRoot 'apps\web')
            & node 'node_modules\next\dist\bin\next' dev --hostname 127.0.0.1 --port 3000
        }
        'api' {
            Set-Location -LiteralPath (Join-Path $repositoryRoot 'apps\api')
            & node --watch --import tsx src/main.ts
        }
        'ai' {
            Set-Location -LiteralPath (Join-Path $repositoryRoot 'services\ai')
            & '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
        }
        'worker' {
            Set-Location -LiteralPath (Join-Path $repositoryRoot 'apps\api')
            & node --import tsx src/worker.ts
        }
    }
    exit $LASTEXITCODE
}

if ($Supervisor) {
    if ($RunToken -notmatch '^[a-f0-9]{32}$') { throw 'Invalid internal launcher token.' }
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public sealed class MarkosLocalJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle;
    public MarkosLocalJob() {
        handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero) throw new Win32Exception();
        var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE
        if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(limits))) {
            int error = Marshal.GetLastWin32Error(); CloseHandle(handle); handle = IntPtr.Zero; throw new Win32Exception(error);
        }
    }
    public void Add(IntPtr process) { if (!AssignProcessToJobObject(handle, process)) throw new Win32Exception(); }
    public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
}
'@
    $ownedServices = @{}
    $stopPath = Join-Path $runDirectory "$RunToken.stop"
    $runDatabaseIdentity = Get-DatabaseIdentity
    $runTunnelIdentity = Get-TunnelIdentity
    $runConfigurationStamp = Get-ConfigurationStamp
    try {
        Write-RunState 'starting'
        Set-LocalEnvironment
        foreach ($name in $applicationServices) {
            Start-OwnedService $name
            if ($name -eq 'database-tunnel') {
                Wait-DatabaseTunnel
                Test-DatabaseCompatibility
            }
        }
        $deadline = [DateTime]::UtcNow.AddMinutes(5)
        $ready = $false
        $databaseFailures = 0
        $recoveryAttempts = 0
        $stableChecks = 0
        $degradedDeadline = $null
        $nextHealthCheck = [DateTime]::MinValue
        while (!(Test-Path -LiteralPath $stopPath)) {
            $exited = @($ownedServices.Keys | Where-Object { $ownedServices[$_].process.HasExited })
            $recover = $Mode -eq 'railway' -and ($exited -contains 'database-tunnel' -or $exited -contains 'api' -or ($ready -and $databaseFailures -ge 3) -or (!$ready -and $recoveryAttempts -gt 0 -and [DateTime]::UtcNow -gt $deadline))
            if (@($exited | Where-Object { $Mode -ne 'railway' -or $_ -notin @('database-tunnel', 'api') }).Count -gt 0) {
                throw 'An application service exited. Inspect its log in var\local-run.'
            }
            if ($recover) {
                if ($recoveryAttempts -ge 3) { throw 'Railway connection recovery failed after three attempts. Inspect the tunnel and API logs.' }
                if ((Get-ConfigurationStamp) -ne $runConfigurationStamp) { throw 'Configuration changed during this session. Restart MARKOS to use the new configuration.' }
                $recoveryAttempts++
                Write-RunState 'recovering' "Reconnecting the Railway database (attempt $recoveryAttempts of 3)."
                $ready = $false
                $databaseFailures = 0
                $stableChecks = 0
                $degradedDeadline = $null
                try {
                    Stop-OwnedService 'api'
                    Stop-OwnedService 'database-tunnel'
                    if (Test-Path -LiteralPath $stopPath) { break }
                    if ((Test-Port 15432) -or (Test-Port 4000)) { throw 'A released application port is still occupied; no unrelated process was stopped.' }
                    Start-OwnedService 'database-tunnel'
                    Wait-DatabaseTunnel
                    Start-OwnedService 'api' # Replaces Prisma connections tied to the stalled tunnel.
                    $deadline = [DateTime]::UtcNow.AddSeconds(60)
                } catch {
                    $deadline = [DateTime]::MinValue # Retry through this same bounded recovery path.
                    if ($recoveryAttempts -ge 3) { throw }
                }
                $nextHealthCheck = [DateTime]::MinValue
                Start-Sleep -Seconds 2
                continue
            }
            if ([DateTime]::UtcNow -ge $nextHealthCheck) {
                $health = Get-ApplicationHealth
                $workerReady = $Mode -eq 'railway' -or ((Test-Path -LiteralPath (Join-Path $runDirectory 'worker.log')) -and (Select-String -LiteralPath (Join-Path $runDirectory 'worker.log') -Pattern 'Maintenance worker started' -Quiet))
                if ($workerReady -and $health.ready) {
                    Write-RunState 'ready'
                    $ready = $true
                    $databaseFailures = 0
                    $degradedDeadline = $null
                    $stableChecks++
                    if ($stableChecks -ge 3) { $recoveryAttempts = 0 }
                } else {
                    $stableChecks = 0
                    $databaseFailures = if ($health.databaseReady) { 0 } else { $databaseFailures + 1 }
                    if ($ready) {
                        Write-RunState 'degraded' 'A dependency health check failed; the launcher is checking the connection.'
                        if ($null -eq $degradedDeadline) { $degradedDeadline = [DateTime]::UtcNow.AddMinutes(2) }
                        if ([DateTime]::UtcNow -gt $degradedDeadline) { throw 'Dependencies remained unhealthy for two minutes. Inspect var\local-run logs.' }
                    } elseif ($recoveryAttempts -eq 0 -and [DateTime]::UtcNow -gt $deadline) { throw 'Services did not become healthy within five minutes. Inspect var\local-run logs.' }
                }
                $nextHealthCheck = [DateTime]::UtcNow.AddSeconds($(if ($ready) { 15 } else { 2 }))
            }
            Start-Sleep -Seconds 2
        }
        Write-RunState 'stopped'
    } catch {
        if (Test-Path -LiteralPath $stopPath) { Write-RunState 'stopped' }
        else { Write-RunState 'failed' $_.Exception.Message; Write-Error $_ -ErrorAction Continue }
    } finally {
        foreach ($name in @($ownedServices.Keys)) { Stop-OwnedService $name }
        Remove-Item -LiteralPath $stopPath -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $runDirectory "$RunToken-ssh.conf") -ErrorAction SilentlyContinue
    }
    exit
}

$startupLock = $null
try {
    New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
    try { $startupLock = [IO.File]::Open((Join-Path $runDirectory 'startup.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'MARKOS startup is already running. Wait for that window to finish.' }
    Set-Location -LiteralPath $repositoryRoot
    Get-Command node -ErrorAction Stop | Out-Null
    & node scripts/local-development.mjs $Mode --check
    if ($LASTEXITCODE -ne 0) { throw 'Configuration check failed. Correct the named values in the local .env files.' }
    $existing = Read-RunState
    if (Test-RunOwner $existing) {
        if ($existing.mode -ne $Mode) { throw "MARKOS is already running in $($existing.mode) mode. Use Stop MARKOS.cmd before changing modes." }
        if ($existing.databaseIdentity -ne (Get-DatabaseIdentity) -or $existing.tunnelIdentity -ne (Get-TunnelIdentity) -or $existing.configurationStamp -ne (Get-ConfigurationStamp)) {
            throw 'The configured database or environment has changed. Use Stop MARKOS.cmd before starting the new configuration.'
        }
        $reuseDeadline = [DateTime]::UtcNow.AddMinutes(6)
        $nextReuseUpdate = [DateTime]::MinValue
        while ([DateTime]::UtcNow -lt $reuseDeadline) {
            $currentState = Read-RunState
            if (!(Test-RunOwner $currentState) -or $currentState.token -ne $existing.token) { throw 'The previous launcher session stopped. Run MARKOS again.' }
            if ($currentState.status -eq 'failed') { throw $currentState.message }
            if ($currentState.status -eq 'stopped') { throw 'MARKOS was stopped. Run MARKOS again when ready.' }
            if ($currentState.status -eq 'ready' -and (Test-ApplicationHealth)) {
                Write-Host "MARKOS is already running: $applicationUrl"
                if (!$NoBrowser) { Start-Process $applicationUrl }
                exit 0
            }
            if ([DateTime]::UtcNow -ge $nextReuseUpdate) {
                Write-Host "MARKOS is $($currentState.status); waiting for the existing session to become ready..."
                $nextReuseUpdate = [DateTime]::UtcNow.AddSeconds(20)
            }
            Start-Sleep -Seconds 2
        }
        throw 'The existing launcher is still waiting for healthy dependencies. Inspect var\local-run logs or use Stop MARKOS.cmd.'
    }
    $requiredPaths = @('.env', 'node_modules\pnpm\bin\pnpm.cjs', 'apps\api\node_modules\prisma\build\index.js')
    if ($Mode -ne 'railway') { $requiredPaths += @('services\ai\.env', 'services\ai\.venv\Scripts\python.exe') }
    foreach ($required in $requiredPaths) {
        if (!(Test-Path -LiteralPath (Join-Path $repositoryRoot $required))) { throw "Missing $required. Complete local environment/dependency setup before using this launcher." }
    }
    Get-Command docker -ErrorAction Stop | Out-Null
    $rootValues = Read-EnvironmentFile (Join-Path $repositoryRoot '.env')
    if ($Mode -eq 'railway') {
        Get-Command ssh.exe -ErrorAction Stop | Out-Null
        foreach ($key in @('MARKOS_RAILWAY_SSH_KEY_PATH', 'MARKOS_RAILWAY_SSH_KNOWN_HOSTS_PATH')) {
            if (!(Test-Path -LiteralPath $rootValues[$key] -PathType Leaf)) { throw "$key does not point to an existing SSH configuration file. Complete Railway SSH setup before starting." }
        }
    }
    if (!$rootValues['DATABASE_URL']) { throw 'Set DATABASE_URL explicitly in the root .env before starting.' }
    $database = [Uri]$rootValues['DATABASE_URL']
    if ($Mode -ne 'railway' -and $database.Port -ne 5432) { throw 'The launcher requires the existing local Compose PostgreSQL port 5432.' }
    $expectedUrls = @{ REDIS_URL = 'redis://localhost:6379'; OPENSEARCH_URL = 'http://localhost:9200'; API_BASE_URL = 'http://localhost:4000'; WEB_BASE_URL = 'http://localhost:3000' }
    if ($Mode -ne 'railway') { $expectedUrls['AI_BASE_URL'] = 'http://localhost:8000' }
    foreach ($key in $expectedUrls.Keys) {
        if ($rootValues[$key] -and $rootValues[$key].TrimEnd('/') -ne $expectedUrls[$key]) { throw "$key must use $($expectedUrls[$key]) with this standard local launcher." }
    }
    $applicationPorts = if ($Mode -eq 'railway') { @(3000, 4000, 15432) } else { @(3000, 4000, 8000) }
    foreach ($port in $applicationPorts) {
        if (Test-Port $port) { throw "Port $port is in use by a process this launcher does not own. Stop that application first; nothing was terminated." }
    }
    Write-Host 'Checking Docker Desktop...'
    $dockerStatus = Invoke-LoggedCommand 'docker' @('info', '--format', '{{.ServerVersion}}') (Join-Path $runDirectory 'docker.log')
    if ($dockerStatus -ne 0) {
        $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (!(Test-Path -LiteralPath $desktop)) { throw 'Install and initialize Docker Desktop with Linux containers, then retry.' }
        Start-Process -FilePath $desktop -WindowStyle Hidden
        $deadline = [DateTime]::UtcNow.AddMinutes(3)
        do {
            Start-Sleep -Seconds 3
            $dockerStatus = Invoke-LoggedCommand 'docker' @('info', '--format', '{{.ServerVersion}}') (Join-Path $runDirectory 'docker.log')
            if ([DateTime]::UtcNow -gt $deadline) { throw 'Docker did not become ready. Open Docker Desktop and resolve its startup error, then retry.' }
        } while ($dockerStatus -ne 0)
    }
    $dependencyServices = if ($Mode -eq 'railway') { @('redis', 'opensearch') } else { @('postgres', 'redis', 'opensearch') }
    Write-Host ('Starting local dependencies: ' + ($dependencyServices -join ', ') + ' (existing volumes are preserved)...')
    $composeArguments = @('compose', '-f', (Join-Path $repositoryRoot 'docker-compose.yml'), 'up', '-d', '--wait', '--wait-timeout', '180') + $dependencyServices
    $composeStatus = Invoke-LoggedCommand 'docker' $composeArguments (Join-Path $runDirectory 'docker-compose.log')
    if ($composeStatus -ne 0) { throw 'Docker dependencies failed to start. See var\local-run\docker-compose.log.' }
    Set-LocalEnvironment
    if ($Mode -ne 'railway') { Test-DatabaseCompatibility }
    $RunToken = [Guid]::NewGuid().ToString('N')
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Mode {1} -Supervisor -RunToken {2}' -f $scriptPath, $Mode, $RunToken
    $owner = Start-Process -FilePath $powershellPath -ArgumentList $arguments -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory 'supervisor.log') -RedirectStandardError (Join-Path $runDirectory 'supervisor.error.log')
    Write-Host "Starting MARKOS in $Mode mode. The first page compilation may take a few minutes..."
    $deadline = [DateTime]::UtcNow.AddMinutes(6)
    $nextUpdate = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        $state = Read-RunState
        if ($null -ne $state -and $state.token -eq $RunToken) {
            if ($state.status -eq 'ready') {
                Write-Host "MARKOS is ready: $applicationUrl"
                Write-Host 'Logs: var\local-run. Use Stop MARKOS.cmd to stop the application.'
                if (!$NoBrowser) { Start-Process $applicationUrl }
                exit 0
            }
            if ($state.status -eq 'failed') { throw $state.message }
        }
        if ($owner.HasExited) { throw 'The launcher supervisor exited. Inspect var\local-run\supervisor.error.log.' }
        if ([DateTime]::UtcNow -ge $nextUpdate) {
            Write-Host ('Waiting for ' + ($applicationServices -join ', ') + ' and dependency readiness...')
            $nextUpdate = [DateTime]::UtcNow.AddSeconds(20)
        }
        Start-Sleep -Seconds 2
    }
    [IO.File]::WriteAllText((Join-Path $runDirectory "$RunToken.stop"), '')
    throw 'Startup timed out and shutdown was requested. Inspect var\local-run logs before retrying.'
} catch {
    Write-Host "MARKOS could not start: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $startupLock) { $startupLock.Dispose() }
}
