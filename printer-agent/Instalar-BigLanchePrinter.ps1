# Instalador do Big Lanche Printer
$ErrorActionPreference = "Stop"
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentSource = Join-Path $base "BigLanchePrinter.ps1"
$configExample = Join-Path $base "config.example.json"
$installDir = Join-Path $env:ProgramData "BigLanchePrinter"
$configPath = Join-Path $installDir "config.json"
$agentPath = Join-Path $installDir "BigLanchePrinter.ps1"
$taskName = "Big Lanche - Impressao Automatica"

Write-Host ""
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host "       BIG LANCHE - IMPRESSAO AUTOMATICA" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor DarkYellow
Write-Host ""

if (-not (Test-Path $agentSource)) {
  throw "BigLanchePrinter.ps1 não encontrado na pasta do instalador."
}

$apiUrl = Read-Host "Servidor [https://biglanchetestekitchen.vercel.app]"
if ([string]::IsNullOrWhiteSpace($apiUrl)) { $apiUrl = "https://biglanchetestekitchen.vercel.app" }
$apiUrl = $apiUrl.TrimEnd("/")

$token = Read-Host "Token de instalação"
if ([string]::IsNullOrWhiteSpace($token)) { throw "O token não pode ficar vazio." }

Write-Host ""
Write-Host "Impressoras instaladas neste computador:" -ForegroundColor Cyan
$printers = @(Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name)
if ($printers.Count -eq 0) {
  Write-Warning "Nenhuma impressora foi encontrada pelo Windows."
} else {
  $i=1
  foreach ($p in $printers) {
    Write-Host ("  {0}. {1}" -f $i,$p)
    $i++
  }
}
Write-Host ""
$printerName = Read-Host "Nome EXATO da impressora (Enter = usar a impressora padrão)"
$printerName = $printerName.Trim()

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item $agentSource $agentPath -Force

$config = [ordered]@{
  apiUrl = $apiUrl
  token = $token
  printerName = $printerName
  pollMs = 10000
}
$config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

# Remove tarefa anterior se existir.
schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null

$taskCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agentPath + '"'
$create = schtasks.exe /Create /TN $taskName /TR $taskCommand /SC ONSTART /RU SYSTEM /F
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível criar a tarefa automática do Windows."
}

Write-Host ""
Write-Host "Instalação concluída." -ForegroundColor Green
Write-Host "Pasta: $installDir"
Write-Host "Impressora: " + ($(if ($printerName) {$printerName} else {"Impressora padrão do Windows"}))
Write-Host ""
Write-Host "Iniciando o agente agora..." -ForegroundColor Cyan

Start-Process powershell.exe -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy","Bypass",
  "-WindowStyle","Hidden",
  "-File",$agentPath
)

Write-Host ""
Write-Host "Pronto. A impressão automática ficará ativa mesmo após reiniciar o computador." -ForegroundColor Green
Write-Host "Você pode fechar esta janela."
Start-Sleep -Seconds 3
