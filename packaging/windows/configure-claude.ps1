param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$serverName = 'bns-dcs-mcp'
$launcher = Join-Path $InstallRoot 'BNS-DCS-MCP.exe'
$backupDir = Join-Path $InstallRoot 'backup'
$manifestPath = Join-Path $backupDir 'claude-config-targets.json'

function New-EmptyConfig { return [pscustomobject]@{} }

function Set-ObjectProperty {
    param($Object, [string]$Name, $Value)
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
    } else {
        $property.Value = $Value
    }
}

function Read-JsonFile {
    param([string]$Path)
    if (!(Test-Path -LiteralPath $Path)) { return New-EmptyConfig }
    $raw = [System.IO.File]::ReadAllText($Path)
    if ([string]::IsNullOrWhiteSpace($raw)) { return New-EmptyConfig }
    try { return $raw | ConvertFrom-Json }
    catch { throw "Claude Desktop config contains invalid JSON and was not modified: $Path" }
}

function Write-JsonFile {
    param([string]$Path, $Value)
    $dir = Split-Path -Parent $Path
    if ($dir) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $json = $Value | ConvertTo-Json -Depth 64
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Get-ServersObject {
    param($Config)
    $property = $Config.PSObject.Properties['mcpServers']
    if ($null -eq $property -or $null -eq $property.Value -or !($property.Value -is [pscustomobject])) {
        $servers = [pscustomobject]@{}
        Set-ObjectProperty $Config 'mcpServers' $servers
        return $servers
    }
    return $property.Value
}

function Get-ClaudeConfigTargets {
    $targets = New-Object System.Collections.Generic.List[string]
    if ($env:APPDATA) {
        $targets.Add((Join-Path (Join-Path $env:APPDATA 'Claude') 'claude_desktop_config.json'))
    }
    if ($env:LOCALAPPDATA) {
        $packagesRoot = Join-Path $env:LOCALAPPDATA 'Packages'
        if (Test-Path -LiteralPath $packagesRoot) {
            Get-ChildItem -LiteralPath $packagesRoot -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like 'Claude_*' } |
                ForEach-Object {
                    $roaming = Join-Path $_.FullName 'LocalCache\Roaming\Claude'
                    if (Test-Path -LiteralPath $roaming) {
                        $targets.Add((Join-Path $roaming 'claude_desktop_config.json'))
                    }
                }
        }
    }
    return @($targets | Select-Object -Unique)
}

function Read-Manifest {
    if (!(Test-Path -LiteralPath $manifestPath)) { return @() }
    $raw = [System.IO.File]::ReadAllText($manifestPath)
    if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
    $parsed = $raw | ConvertFrom-Json
    if ($parsed -is [System.Array]) { return @($parsed) }
    return @($parsed)
}

function Write-Manifest {
    param([array]$Entries)
    Write-JsonFile $manifestPath $Entries
}

$targets = @(Get-ClaudeConfigTargets)
$manifest = @(Read-Manifest)
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

if ($Remove) {
    $all = @($targets) + @($manifest | ForEach-Object { $_.path })
    foreach ($path in @($all | Where-Object { $_ } | Select-Object -Unique)) {
        if (!(Test-Path -LiteralPath $path)) { continue }
        $config = Read-JsonFile $path
        $servers = Get-ServersObject $config
        $existing = $servers.PSObject.Properties[$serverName]
        if ($null -ne $existing) { $servers.PSObject.Properties.Remove($serverName) }
        $saved = $manifest | Where-Object { $_.path -eq $path } | Select-Object -First 1
        if ($null -ne $saved -and $saved.hadPrevious -eq $true) {
            Set-ObjectProperty $servers $serverName $saved.previousEntry
        }
        Write-JsonFile $path $config
        Write-Host "Removed/restored '$serverName' in $path"
    }
    if (Test-Path -LiteralPath $manifestPath) { Remove-Item -LiteralPath $manifestPath -Force }
    exit 0
}

if (!(Test-Path -LiteralPath $launcher)) { throw "Launcher not found: $launcher" }
foreach ($path in $targets) {
    $config = Read-JsonFile $path
    $servers = Get-ServersObject $config
    $existing = $servers.PSObject.Properties[$serverName]
    $saved = $manifest | Where-Object { $_.path -eq $path } | Select-Object -First 1
    if ($null -eq $saved) {
        $manifest += [pscustomobject]@{
            path = $path
            hadPrevious = ($null -ne $existing)
            previousEntry = if ($null -ne $existing) { $existing.Value } else { $null }
        }
    }
    $entry = [pscustomobject]@{ command = $launcher; args = @() }
    Set-ObjectProperty $servers $serverName $entry
    Write-JsonFile $path $config
    Write-Host "Registered '$serverName' in $path"
}
Write-Manifest $manifest
Write-Host 'Restart Claude Desktop to connect to BNS-DCS-MCP.'
