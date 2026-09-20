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

if ([string]::IsNullOrWhiteSpace($SupabaseDatabaseUrl)) {
    throw "Pass your Supabase connection string: .\start_free.ps1 -SupabaseDatabaseUrl 'postgresql://...'"
}

$env:DATABASE_URL = $SupabaseDatabaseUrl
$env:DB_SSL = "true"
$env:PYTHON_API_URL = "http://127.0.0.1:8000"
$env:NODE_API_URL = "http://127.0.0.1:5000"

function Start-ServiceProcess([string]$file, [string]$arguments, [string]$directory) {
    Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $directory
}

Write-Host "Starting Python AI service on port 8000..." -ForegroundColor Green
Start-ServiceProcess $pythonExe "-m uvicorn main:app --host 127.0.0.1 --port 8000" (Join-Path $root "soumil-backend\backend")

Write-Host "Starting Node API on port 5000..." -ForegroundColor Green
Start-ServiceProcess "node" "backend/index.js" (Join-Path $root "ranajit-apis")

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw "cloudflared was not found. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
}

Write-Host "Starting public Cloudflare tunnel for the Node API..." -ForegroundColor Green
Write-Host "Copy the https://*.trycloudflare.com URL into Render as VITE_API_URL and use wss:// for VITE_WS_URL." -ForegroundColor Yellow
Start-ServiceProcess "cloudflared" "tunnel --url http://127.0.0.1:5000" $root

Write-Host "Local services started. Keep these windows and this computer running." -ForegroundColor Cyan
