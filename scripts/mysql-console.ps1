$ErrorActionPreference = "Stop"

$mysqld = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
$config = "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"

if (-not (Test-Path -LiteralPath $mysqld)) {
  throw "mysqld.exe not found: $mysqld"
}

if (-not (Test-Path -LiteralPath $config)) {
  throw "MySQL config not found: $config"
}

Write-Host "Starting MySQL in foreground console mode."
Write-Host "Keep this window open while developing. Press Ctrl+C to stop."
& $mysqld --defaults-file="$config" --console
