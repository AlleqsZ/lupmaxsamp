$ErrorActionPreference = "Stop"
$UcpDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $UcpDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " LUPMAX RPG — USER CONTROL PANEL (UCP) & ANTI-HIJACK SHIELD" -ForegroundColor Cyan
Write-Host " Director UCP : $UcpDir" -ForegroundColor Gray
Write-Host " URL Acces    : http://127.0.0.1:8770/" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

python "$UcpDir\server.py"

