param(
  [switch]$Production,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$pythonPath = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Backend virtualenv not found: $pythonPath"
}

Write-Host "== Backend preflight =="
Push-Location -LiteralPath $backendDir
try {
  $preflightArgs = @("-m", "app.tools.preflight")
  if ($Production) {
    $preflightArgs += "--production"
  }
  & $pythonPath @preflightArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  & $pythonPath -m pytest
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

Write-Host "== Database verification =="
& (Join-Path $PSScriptRoot "db.ps1") verify
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not $SkipBuild) {
  Write-Host "== Frontend build =="
  Push-Location -LiteralPath $frontendDir
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
}

Write-Host "Preflight completed."
