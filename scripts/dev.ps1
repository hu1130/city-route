param(
  [int]$FrontendPort = 3000,
  [int]$BackendPort = 8011,
  [switch]$OpenBrowser,
  [switch]$StopExisting
)

$ErrorActionPreference = "Stop"

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

function Stop-PortOwners {
  param([int]$Port)

  $owners = Get-PortOwners -Port $Port
  foreach ($owner in $owners) {
    Write-Host "Stopping process $owner on port $Port"
    Stop-Process -Id $owner -Force
  }
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

function Wait-Backend {
  param(
    [int]$Port,
    [int]$Attempts = 30
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    if (Test-BackendReady -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

function Wait-Frontend {
  param(
    [int]$Port,
    [int]$Attempts = 45
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    if (Test-FrontendReady -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }

  return $false
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

function Assert-FixedPortsFree {
  param(
    [int]$FrontendPort,
    [int]$BackendPort
  )

  $backendOwners = @(Get-PortOwners -Port $BackendPort)
  $frontendOwners = @(Get-PortOwners -Port $FrontendPort)

  if ($backendOwners.Count -eq 0 -and $frontendOwners.Count -eq 0) {
    return
  }

  if ((Test-BackendReady -Port $BackendPort) -and (Test-FrontendReady -Port $FrontendPort)) {
    Write-Host ""
    Write-Host "Fixed dev ports are already running."
    Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
    Write-Host "Backend:  http://127.0.0.1:$BackendPort"
    Write-Host "Health:   http://127.0.0.1:$BackendPort/health"
    Write-Host ""
    exit 0
  }

  $messages = @()
  if ($backendOwners.Count -gt 0) {
    $messages += "Backend fixed port $BackendPort is occupied by PID(s): $($backendOwners -join ', ')"
  }
  if ($frontendOwners.Count -gt 0) {
    $messages += "Frontend fixed port $FrontendPort is occupied by PID(s): $($frontendOwners -join ', ')"
  }

  throw ($messages -join "`n") + "`nRun '.\scripts\dev.ps1 -StopExisting' if these are old project dev servers."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$pythonPath = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Backend virtualenv not found: $pythonPath. Run: cd backend; python -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt"
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDir "node_modules"))) {
  throw "Frontend dependencies not found. Run: cd frontend; npm install"
}

if ($StopExisting) {
  Stop-PortOwners -Port $FrontendPort
  Stop-PortOwners -Port $BackendPort
  Start-Sleep -Seconds 1
} else {
  Assert-FixedPortsFree -FrontendPort $FrontendPort -BackendPort $BackendPort
}

$apiBaseUrl = "http://127.0.0.1:$BackendPort"
$frontendEnvPath = Join-Path $frontendDir ".env.local"
$rootEnvPath = Join-Path $root ".env"
$rootEnv = Read-EnvFile -Path $rootEnvPath
$existingFrontendEnv = Read-EnvFile -Path $frontendEnvPath
$amapJsKey = Get-FirstEnvValue -Sources @($existingFrontendEnv, $rootEnv) -Name "NEXT_PUBLIC_AMAP_JS_KEY"
$amapSecurityJsCode = Get-FirstEnvValue -Sources @($existingFrontendEnv, $rootEnv) -Name "AMAP_SECURITY_JS_CODE"
if ([string]::IsNullOrWhiteSpace($amapSecurityJsCode)) {
  $amapSecurityJsCode = Get-FirstEnvValue -Sources @($existingFrontendEnv, $rootEnv) -Name "NEXT_PUBLIC_AMAP_SECURITY_JS_CODE"
}

$frontendEnvLines = @(
  "NEXT_PUBLIC_API_BASE_URL=/api/backend"
  "BACKEND_INTERNAL_URL=$apiBaseUrl"
)

if (-not [string]::IsNullOrWhiteSpace($amapJsKey)) {
  $frontendEnvLines += "NEXT_PUBLIC_AMAP_JS_KEY=$amapJsKey"
}

if (-not [string]::IsNullOrWhiteSpace($amapSecurityJsCode)) {
  $frontendEnvLines += "AMAP_SECURITY_JS_CODE=$amapSecurityJsCode"
}

$frontendEnvLines | Set-Content -LiteralPath $frontendEnvPath -Encoding UTF8

Write-Host "Fixed backend port: $BackendPort"
Write-Host "Fixed frontend port: $FrontendPort"
Write-Host "Wrote frontend env: $frontendEnvPath"

$backendCommand = "& { Set-Location -LiteralPath '$backendDir'; .\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort }"
$frontendCommand = "& { Set-Location -LiteralPath '$frontendDir'; npm run dev -- --hostname 127.0.0.1 --port $FrontendPort }"

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand -WindowStyle Hidden | Out-Null

if (-not (Wait-Backend -Port $BackendPort)) {
  throw "Backend did not become ready at http://127.0.0.1:$BackendPort/health"
}

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand -WindowStyle Hidden | Out-Null

if (-not (Wait-Frontend -Port $FrontendPort)) {
  throw "Frontend did not become ready at http://127.0.0.1:$FrontendPort"
}

Write-Host ""
Write-Host "Dev servers are ready on fixed ports."
Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Backend:  http://127.0.0.1:$BackendPort"
Write-Host "Health:   http://127.0.0.1:$BackendPort/health"
Write-Host ""
Write-Host "Dev servers are running in hidden PowerShell windows. Use '.\scripts\dev.ps1 -StopExisting' to restart them."

if ($OpenBrowser) {
  Start-Process "http://127.0.0.1:$FrontendPort"
}
