# Avvia Procurement Acciaio in locale su Windows (senza systemd).
# Uso: apri PowerShell nella cartella del progetto ed esegui:
#   .\avvia-locale.ps1
# Ferma il server con Ctrl+C.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
if ($null -eq $pgService) {
    Write-Host "Servizio PostgreSQL 'postgresql-x64-16' non trovato. Verifica che PostgreSQL sia installato." -ForegroundColor Red
    exit 1
}
if ($pgService.Status -ne "Running") {
    Write-Host "Avvio PostgreSQL..."
    Start-Service -Name "postgresql-x64-16"
    Start-Sleep -Seconds 2
}

$uvicorn = Join-Path $root ".venv\Scripts\uvicorn.exe"
if (-not (Test-Path $uvicorn)) {
    Write-Host "Virtualenv non trovato in .venv - crealo prima con: python -m venv .venv; .venv\Scripts\pip install -r backend\requirements.txt" -ForegroundColor Red
    exit 1
}

Set-Location (Join-Path $root "backend")
Write-Host "Avvio Procurement Acciaio su http://127.0.0.1:8000  (Ctrl+C per fermare)" -ForegroundColor Green
& $uvicorn main:app --host 127.0.0.1 --port 8000 --reload
