param(
  [ValidateSet("config", "up", "down", "restart", "status", "logs", "backup", "verify", "restore")]
  [string]$Action = "status",
  [string]$File
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.production"
$composeFile = Join-Path $root "compose.production.yml"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed or is not available in PATH."
}
if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Production environment file not found: $envFile. Copy .env.production.example to .env.production and fill it first."
}

$composeArgs = @("compose", "--env-file", $envFile, "-f", $composeFile)

function Invoke-Compose {
  param([string[]]$Arguments)
  & docker @composeArgs @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose command failed with exit code $LASTEXITCODE."
  }
}

Push-Location -LiteralPath $root
try {
  switch ($Action) {
    "config" {
      Invoke-Compose @("config", "--quiet")
      Write-Host "Production Compose configuration is valid."
    }
    "up" {
      Invoke-Compose @("config", "--quiet")
      Invoke-Compose @("up", "-d", "--build", "--wait")
      Invoke-Compose @("ps")
    }
    "down" {
      Invoke-Compose @("down")
    }
    "restart" {
      Invoke-Compose @("restart")
      Invoke-Compose @("ps")
    }
    "status" {
      Invoke-Compose @("ps")
    }
    "logs" {
      Invoke-Compose @("logs", "--tail", "200")
    }
    "backup" {
      Invoke-Compose @("exec", "-T", "backup", "python", "-m", "app.tools.database", "backup", "--output-dir", "/backups")
    }
    "verify" {
      Invoke-Compose @("exec", "-T", "backend", "python", "-m", "app.tools.database", "verify")
    }
    "restore" {
      if ([string]::IsNullOrWhiteSpace($File)) {
        throw "Restore requires -File with an existing backup JSON file."
      }
      $resolvedFile = Resolve-Path -LiteralPath $File
      $containerId = (& docker @composeArgs ps -q backup).Trim()
      if ([string]::IsNullOrWhiteSpace($containerId)) {
        throw "Backup container is not running. Start production services first."
      }
      & docker cp $resolvedFile.Path "${containerId}:/backups/manual-restore.json"
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to copy backup into the backup container."
      }
      Invoke-Compose @("exec", "-T", "backup", "python", "-m", "app.tools.database", "restore", "--file", "/backups/manual-restore.json")
    }
  }
} finally {
  Pop-Location
}
