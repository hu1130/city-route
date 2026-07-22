param(
  [ValidateSet("status", "init", "migrate-json", "backup", "restore", "verify")]
  [string]$Action = "status",
  [string]$File,
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $root "backend"
$pythonPath = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Backend virtualenv not found: $pythonPath. Run: cd backend; python -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt"
}

Push-Location -LiteralPath $backendDir
try {
  $arguments = @("-m", "app.tools.database", $Action)
  if (-not [string]::IsNullOrWhiteSpace($File)) {
    $arguments += @("--file", $File)
  }
  if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
    $arguments += @("--output-dir", $OutputDir)
  }

  & $pythonPath @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
