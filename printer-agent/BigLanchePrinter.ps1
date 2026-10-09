# Big Lanche Printer Agent
$ErrorActionPreference="Stop"
$baseDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath=Join-Path $baseDir "config.json"
if(-not(Test-Path $configPath)){Write-Host "ERRO: crie config.json.";exit 1}
$config=Get-Content $configPath -Raw|ConvertFrom-Json
$apiUrl=([string]$config.apiUrl).TrimEnd("/")
$token=[string]$config.token
$printerName=[string]$config.printerName
$pollMs=[int]$config.pollMs
if($pollMs -lt 3000){$pollMs=10000}
if([string]::IsNullOrWhiteSpace($token)-or $token -like "*COLOQUE_AQUI*"){Write-Host "ERRO: configure o token no config.json.";exit 1}
$agentId=[guid]::NewGuid().ToString()
$mutex=New-Object System.Threading.Mutex($false,"Global\BigLanchePrinterAgent")
$ownsMutex=$false
try{$ownsMutex=$mutex.WaitOne(0,$false)}catch{$ownsMutex=$false}
if(-not $ownsMutex){Write-Host "Já existe uma instância do agente. Esta cópia será encerrada."; $mutex.Dispose();exit 0}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
 [DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool OpenPrinter(string pPrinterName,out IntPtr phPrinter,IntPtr pDefault);
 [DllImport("winspool.drv",SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
 [DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool StartDocPrinter(IntPtr hPrinter,int level,[In] DOCINFO di);
 [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
 [DllImport("winspool.drv",SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
 [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
 [DllImport("winspool.drv",SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter,byte[] pBytes,int dwCount,out int dwWritten);
 public static void Send(string printer,byte[] data){IntPtr h;if(!OpenPrinter(printer,out h,IntPtr.Zero))throw new Exception("Não foi possível abrir a impressora '"+printer+"'.");try{var di=new DOCINFO();di.pDocName="BIG LANCHE";di.pDataType="RAW";if(!StartDocPrinter(h,1,di))throw new Exception("Não foi possível iniciar o trabalho de impressão.");try{if(!StartPagePrinter(h))throw new Exception("Não foi possível iniciar a página.");try{int written;if(!WritePrinter(h,data,data.Length,out written)||written!=data.Length)throw new Exception("O Windows não aceitou todos os dados da impressão.");}finally{EndPagePrinter(h);}}finally{EndDocPrinter(h);}}finally{ClosePrinter(h);}}
}
"@
function Get-PrinterName {if(-not [string]::IsNullOrWhiteSpace($printerName)){return $printerName};$p=Get-CimInstance Win32_Printer|Where-Object{$_.Default -eq $true}|Select-Object -First 1 -ExpandProperty Name;if(-not $p){$p=Get-CimInstance Win32_Printer|Where-Object{$_.WorkOffline -eq $false}|Select-Object -First 1 -ExpandProperty Name};if(-not $p){throw "Nenhuma impressora do Windows foi encontrada."};return [string]$p}
function Get-Json($url){$headers=@{Authorization="Bearer $token";Accept="application/json";"X-Printer-Agent-Id"=$agentId};return Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 15}
function Post-Json($url,$body){$headers=@{Authorization="Bearer $token";"Content-Type"="application/json";Accept="application/json";"X-Printer-Agent-Id"=$agentId};return Invoke-RestMethod -Uri $url -Headers $headers -Method Post -Body ($body|ConvertTo-Json -Depth 20) -TimeoutSec 15}
function SafeText($value){if($null -eq $value){return ""};$s=([string]$value).Normalize([Text.NormalizationForm]::FormD);$s=[Text.RegularExpressions.Regex]::Replace($s,"\p{Mn}","");return [Text.RegularExpressions.Regex]::Replace($s,"[^\x20-\x7E\r\n]","")}
function Money($value){return ("R$ {0:N2}"-f([decimal]$value)).Replace(",","X").Replace(".",",").Replace("X",".")}
function Build-Receipt($o){$lines=New-Object System.Collections.Generic.List[string];$lines.Add([char]27+"@");$lines.Add([char]27+"a"+[char]1);$lines.Add([char]27+"E"+[char]1);$lines.Add("BIG LANCHE");$lines.Add("PEDIDO #"+$o.number);$lines.Add([char]27+"E"+[char]0);$lines.Add(("-"*42));$lines.Add([char]27+"a"+[char]0);foreach($i in @($o.cart)){$lines.Add(("{0}x {1}"-f $i.quantity,(SafeText $i.name)));foreach($a in @($i.additions)){$lines.Add(("   + {0}x {1}"-f $a.quantity,(SafeText $a.name)))};if($i.note){$lines.Add("   OBS: "+(SafeText $i.note))}};$lines.Add(("-"*42));$city=SafeText $o.delivery.city;$fee=if([decimal]$o.delivery.fee -gt 0){" · "+(Money $o.delivery.fee)}else{""};$lines.Add("Entrega: "+$city+$fee);$lines.Add("Endereco: "+(SafeText $o.delivery.address));$lines.Add("Pagamento: "+(SafeText $o.payment));if($o.notes){$lines.Add("Obs: "+(SafeText $o.notes))};$lines.Add("TOTAL: "+(Money $o.total));$lines.Add("");$lines.Add("");$lines.Add("");$bytes=[Text.Encoding]::ASCII.GetBytes(($lines -join [Environment]::NewLine));$cut=[byte[]](0x1D,0x56,0x00);$result=New-Object byte[]($bytes.Length+$cut.Length);[Array]::Copy($bytes,0,$result,0,$bytes.Length);[Array]::Copy($cut,0,$result,$bytes.Length,$cut.Length);return $result}
try {
 Write-Host "BIG LANCHE Printer Agent iniciado."
 while($true){
  try {
   $settings=Get-Json "$apiUrl/api/printer-agent/agent-config"
   if($settings.pollMs -ge 3000 -and $settings.pollMs -le 60000){$pollMs=[int]$settings.pollMs}
   if($settings.agentEnabled -eq $true){
    $response=Get-Json "$apiUrl/api/printer-agent/orders"
    foreach($order in @($response.orders)){
     try {$printer=Get-PrinterName;$payload=Build-Receipt $order;[RawPrinter]::Send($printer,$payload);Post-Json "$apiUrl/api/printer-agent/printed" @{id=[string]$order.id;agentId=$agentId}|Out-Null;Write-Host ("[{0}] Pedido #{1} impresso."-f(Get-Date -Format "HH:mm:ss"),$order.number)}
     catch {Write-Warning ("Falha no pedido #{0}: {1}"-f $order.number,$_.Exception.Message);break}
    }
   }
  } catch {Write-Warning ("Falha de comunicação: "+$_.Exception.Message)}
  Start-Sleep -Milliseconds $pollMs
 }
} finally {if($ownsMutex){try{$mutex.ReleaseMutex()}catch{}};$mutex.Dispose()}
