param(
    [int]$BackendPort = 8001,
    [int]$FrontendPort = 5173,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvActivate = Join-Path $root ".venv\Scripts\Activate.ps1"
$frontendDir = Join-Path $root "frontend"
$apiBase = "http://127.0.0.1:$BackendPort"
$skipInstallLiteral = if ($SkipInstall) { '$true' } else { '$false' }

if (-not (Test-Path $venvActivate)) {
    throw "Virtual environment not found at $venvActivate"
}

function Get-ListenerProcessId([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $conn) {
        return $null
    }
    return $conn.OwningProcess
}

$backendCmd = @"
Set-Location '$root'
& '$venvActivate'
`$skipInstall = $skipInstallLiteral
if (-not `$skipInstall) { pip install -r requirements.txt }
uvicorn main:app --reload --host 127.0.0.1 --port $BackendPort
"@

$frontendCmd = @"
Set-Location '$frontendDir'
`$skipInstall = $skipInstallLiteral
if (-not `$skipInstall -and -not (Test-Path 'node_modules')) { npm install }
`$env:VITE_API_BASE_URL='$apiBase'
npm run dev -- --port $FrontendPort --host 127.0.0.1
"@

$backendPid = Get-ListenerProcessId -Port $BackendPort
if ($null -eq $backendPid) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd | Out-Null
} else {
    Write-Host "Backend port $BackendPort is already in use by PID $backendPid. Skipping backend launch."
}

$frontendPid = Get-ListenerProcessId -Port $FrontendPort
if ($null -eq $frontendPid) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null
} else {
    Write-Host "Frontend port $FrontendPort is already in use by PID $frontendPid. Skipping frontend launch."
}

Write-Host "Started backend on $apiBase and frontend on http://127.0.0.1:$FrontendPort"
Write-Host "Only missing services were launched in new terminals."
