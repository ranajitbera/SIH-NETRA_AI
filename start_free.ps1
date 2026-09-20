param(
    [string]$SupabaseDatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pythonExe = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
}
if (-not $pythonExe) {
    throw "Python was not found. Create .venv or install Python first."
}

$usingLocalDatabase = [string]::IsNullOrWhiteSpace($SupabaseDatabaseUrl) -or $SupabaseDatabaseUrl -eq "YOUR_SUPABASE_DATABASE_URL"
if ($usingLocalDatabase) {
    $SupabaseDatabaseUrl = "postgresql://postgres@127.0.0.1:5432/ibvap"
    $pgCtl = Join-Path $env:USERPROFILE "Downloads\postgresql-18.6-4-windows-x64-binaries\pgsql\bin\pg_ctl.exe"
    $pgData = "C:\PostgreSQL\data"
    $pgReady = Join-Path $env:USERPROFILE "Downloads\postgresql-18.6-4-windows-x64-binaries\pgsql\bin\pg_isready.exe"
    if ((Test-Path $pgCtl) -and (Test-Path $pgData) -and ((& $pgReady -h 127.0.0.1 -p 5432 2>$null) -notmatch "accepting connections")) {
        Write-Host "Starting local PostgreSQL..." -ForegroundColor Green
        & $pgCtl -D $pgData -l "C:\PostgreSQL\postgres.log" start | Out-Host
        Start-Sleep -Seconds 2
    }
}

$env:DATABASE_URL = $SupabaseDatabaseUrl
$env:DB_SSL = "true"
$env:PYTHON_API_URL = "http://127.0.0.1:8000"
$env:NODE_API_URL = "http://127.0.0.1:5000"

$psqlCandidates = @(
    (Get-Command psql -ErrorAction SilentlyContinue).Source,
    (Join-Path $env:USERPROFILE "Downloads\postgresql-18.6-4-windows-x64-binaries\pgsql\bin\psql.exe")
)
$psql = $psqlCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $psql) {
    throw "psql was not found. Install a PostgreSQL client before starting the free setup."
}

Write-Host "Initializing Supabase schema..." -ForegroundColor Green
if ($usingLocalDatabase) {
    $databaseExists = (& $psql "postgresql://postgres@127.0.0.1:5432/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname = 'ibvap'" 2>$null).Trim()
    if ($databaseExists -ne "1") {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $psql "postgresql://postgres@127.0.0.1:5432/postgres" -c "CREATE DATABASE ibvap" | Out-Host
        $ErrorActionPreference = $previousErrorActionPreference
    }
}
& $psql $SupabaseDatabaseUrl -f (Join-Path $root "database-setup\postgres\init_schema.sql")
if ($LASTEXITCODE -ne 0) {
    throw "Supabase schema initialization failed. Check the connection string and network access."
}

function Start-ServiceProcess([string]$file, [string]$arguments, [string]$directory) {
    Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $directory
}

Write-Host "Starting Python AI service on port 8000..." -ForegroundColor Green
Start-ServiceProcess $pythonExe "-m uvicorn main:app --host 127.0.0.1 --port 8000" (Join-Path $root "soumil-backend\backend")

Write-Host "Starting Node API on port 5000..." -ForegroundColor Green
Start-ServiceProcess "node" "backend/index.js" (Join-Path $root "ranajit-apis")

 $cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) {
    $cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
}
if (-not (Test-Path $cloudflared)) {
    throw "cloudflared was not found. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
}

Write-Host "Starting public Cloudflare tunnel for the Node API..." -ForegroundColor Green
Write-Host "Copy the https://*.trycloudflare.com URL into Render as VITE_API_URL and use wss:// for VITE_WS_URL." -ForegroundColor Yellow
Start-ServiceProcess $cloudflared "tunnel --url http://127.0.0.1:5000" $root

Write-Host "Local services started. Keep these windows and this computer running." -ForegroundColor Cyan
