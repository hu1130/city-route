param(
  [int]$FrontendPort = 3000,
  [int]$BackendPort = 8011
)

$ErrorActionPreference = "Stop"
$script:Failures = 0
$script:Warnings = 0

function Write-Check {
  param(
    [string]$Status,
    [string]$Name,
    [string]$Detail = ""
  )

  $line = "[$Status] $Name"
  if (-not [string]::IsNullOrWhiteSpace($Detail)) {
    $line = "$line - $Detail"
  }
  Write-Host $line
}

function Add-Ok {
  param([string]$Name, [string]$Detail = "")
  Write-Check -Status "OK" -Name $Name -Detail $Detail
}

function Add-Warn {
  param([string]$Name, [string]$Detail = "")
  $script:Warnings += 1
  Write-Check -Status "WARN" -Name $Name -Detail $Detail
}

function Add-Fail {
  param([string]$Name, [string]$Detail = "")
  $script:Failures += 1
  Write-Check -Status "FAIL" -Name $Name -Detail $Detail
}

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }

    $name = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$name] = $value
  }

  return $values
}

function Get-FirstEnvValue {
  param(
    [hashtable[]]$Sources,
    [string]$Name
  )

  foreach ($source in $Sources) {
    if ($source.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace([string]$source[$Name])) {
      return [string]$source[$Name]
    }
  }

  return $null
}

function Get-PortOwners {
  param([int]$Port)

  $owners = @()
  $lines = netstat -ano | Select-String -Pattern "LISTENING" | Where-Object {
    $_.Line -match ":$Port\s"
  }

  foreach ($line in $lines) {
    $parts = $line.Line -split "\s+" | Where-Object { $_ }
    if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
      $owners += [int]$parts[4]
    }
  }

  return $owners | Select-Object -Unique
}

function Format-PortOwners {
  param([int[]]$Owners)

  if ($Owners.Count -eq 0) {
    return "none"
  }

  $parts = @()
  foreach ($owner in $Owners) {
    $process = Get-Process -Id $owner -ErrorAction SilentlyContinue
    if ($process) {
      $parts += "$owner/$($process.ProcessName)"
    } else {
      $parts += "$owner"
    }
  }

  return $parts -join ", "
}

function Test-BackendReady {
  param([int]$Port)

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    return $response.status -eq "ok"
  } catch {
    return $false
  }
}

function Test-FrontendReady {
  param([int]$Port)

  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-KeyConfigured {
  param(
    [hashtable[]]$Sources,
    [string]$Name,
    [switch]$RequiredForLocal
  )

  $value = Get-FirstEnvValue -Sources $Sources -Name $Name
  if ([string]::IsNullOrWhiteSpace($value)) {
    if ($RequiredForLocal) {
      Add-Fail $Name "missing"
    } else {
      Add-Warn $Name "missing"
    }
  } else {
    Add-Ok $Name "configured"
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$pythonPath = Join-Path $backendDir ".venv\Scripts\python.exe"
$dbScript = Join-Path $PSScriptRoot "db.ps1"
$rootEnvPath = Join-Path $root ".env"
$frontendEnvPath = Join-Path $frontendDir ".env.local"

Write-Host "City Route local doctor"
Write-Host "Project: $root"
Write-Host ""

if (Test-Path -LiteralPath $pythonPath) {
  Add-Ok "Backend virtualenv" $pythonPath
} else {
  Add-Fail "Backend virtualenv" "missing; run backend dependency setup first"
}

if (Test-Path -LiteralPath (Join-Path $frontendDir "node_modules")) {
  Add-Ok "Frontend dependencies" "node_modules exists"
} else {
  Add-Fail "Frontend dependencies" "missing; run npm install in frontend"
}

$rootEnv = Read-EnvFile -Path $rootEnvPath
$frontendEnv = Read-EnvFile -Path $frontendEnvPath
$envSources = @($frontendEnv, $rootEnv)

if (Test-Path -LiteralPath $rootEnvPath) {
  Add-Ok ".env" "exists"
} else {
  Add-Warn ".env" "missing; copy .env.example before real API usage"
}

Test-KeyConfigured -Sources @($rootEnv) -Name "AMAP_API_KEY"
Test-KeyConfigured -Sources @($rootEnv) -Name "DEEPSEEK_API_KEY"
Test-KeyConfigured -Sources $envSources -Name "NEXT_PUBLIC_AMAP_JS_KEY"
Test-KeyConfigured -Sources $envSources -Name "AMAP_SECURITY_JS_CODE"

$authSecret = Get-FirstEnvValue -Sources @($rootEnv) -Name "CITY_ROUTE_AUTH_SECRET"
if ([string]::IsNullOrWhiteSpace($authSecret)) {
  Add-Warn "CITY_ROUTE_AUTH_SECRET" "missing"
} elseif ($authSecret -eq "dev-only-change-me") {
  Add-Warn "CITY_ROUTE_AUTH_SECRET" "still uses local default"
} else {
  Add-Ok "CITY_ROUTE_AUTH_SECRET" "configured"
}

$storageBackend = Get-FirstEnvValue -Sources @($rootEnv) -Name "CITY_ROUTE_STORAGE_BACKEND"
$databaseUrl = Get-FirstEnvValue -Sources @($rootEnv) -Name "DATABASE_URL"
if ($storageBackend -eq "mysql") {
  Add-Ok "Storage backend" "mysql"
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Add-Fail "DATABASE_URL" "missing while MySQL backend is selected"
  } else {
    Add-Ok "DATABASE_URL" "configured"
  }
} else {
  $displayStorageBackend = $storageBackend
  if ([string]::IsNullOrWhiteSpace($displayStorageBackend)) {
    $displayStorageBackend = "json/default"
  }
  Add-Warn "Storage backend" "not mysql; current value: $displayStorageBackend"
}

Write-Host ""
Write-Host "Port checks"
$backendOwners = @(Get-PortOwners -Port $BackendPort)
$frontendOwners = @(Get-PortOwners -Port $FrontendPort)
$backendReady = Test-BackendReady -Port $BackendPort
$frontendReady = Test-FrontendReady -Port $FrontendPort

if ($backendReady) {
  Add-Ok "Backend http://127.0.0.1:$BackendPort" "ready; owners: $(Format-PortOwners $backendOwners)"
} elseif ($backendOwners.Count -gt 0) {
  Add-Fail "Backend port $BackendPort" "occupied but /health is not ready; owners: $(Format-PortOwners $backendOwners)"
} else {
  Add-Warn "Backend http://127.0.0.1:$BackendPort" "not running"
}

if ($frontendReady) {
  Add-Ok "Frontend http://127.0.0.1:$FrontendPort" "ready; owners: $(Format-PortOwners $frontendOwners)"
} elseif ($frontendOwners.Count -gt 0) {
  Add-Fail "Frontend port $FrontendPort" "occupied but page is not ready; owners: $(Format-PortOwners $frontendOwners)"
} else {
  Add-Warn "Frontend http://127.0.0.1:$FrontendPort" "not running"
}

Write-Host ""
Write-Host "Database check"
if (Test-Path -LiteralPath $dbScript) {
  $dbOutput = & $dbScript status 2>&1
  $dbText = $dbOutput -join "`n"
  if ($dbText -match "MySQL connection: ok" -and $dbText -match "Active storage: MySQL") {
    Add-Ok "MySQL" "connection ok; active storage is MySQL"
  } elseif ($storageBackend -eq "mysql") {
    Add-Fail "MySQL" "not active; run scripts\\mysql-console.ps1 and keep that window open"
  } else {
    Add-Warn "MySQL" "not active; app may use JSON fallback"
  }
} else {
  Add-Fail "Database script" "missing: $dbScript"
}

Write-Host ""
Write-Host "Summary"
Write-Host "- Failures: $script:Failures"
Write-Host "- Warnings: $script:Warnings"
Write-Host ""

if ($script:Failures -gt 0) {
  Write-Host "Recommended next command after fixing failures:"
  Write-Host ".\scripts\doctor.ps1"
  exit 1
}

if (-not $backendReady -or -not $frontendReady) {
  Write-Host "Recommended start command:"
  Write-Host ".\scripts\dev.ps1 -StopExisting"
}

exit 0
