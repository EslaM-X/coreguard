[CmdletBinding()]param([string]$PkHexEnv="CG_PKHEX",[string]$RpcUrl="https://rpc.coredao.org")
$ErrorActionPreference="Stop";[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$repo=$PSScriptRoot; for($i=0;$i -lt 4;$i++){ $cand=Split-Path -Parent $repo; if(Test-Path -LiteralPath (Join-Path $cand "foundry.toml")){break}; $repo=$cand }
$anchor="0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E"; $chainId=1116
function RpcP($m,$p){$b=@{jsonrpc="2.0";id=1;method=$m;params=$p}|ConvertTo-Json -Compress -Depth 8;(Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType "application/json" -Body $b -TimeoutSec 30).result}
function Hex64($h){[Convert]::ToInt64($h,16)}
function GetPkHex{[Environment]::GetEnvironmentVariable($PkHexEnv,"Process"); if(-not $pk -or $pk -notmatch "^[0-9a-fA-F]{64}$"){throw "FAIL-CLOSED: no valid $PkHexEnv env — nothing can be signed/broadcast (key stays env-only, never on disk)"}; $pk}
function DeployerOf($pk){((& forge wallet address --private-key $pk 2>$null)|Select-Object -Last 1).Trim()}
function SaveEv($gate,$obj){$d=Join-Path (Split-Path -Parent $repo) "evidence";New-Item -ItemType Directory $d -Force|Out-Null;$p=Join-Path $d ("gate-{0}.json" -f $gate);Set-Content -LiteralPath $p -Value ($obj|ConvertTo-Json -Depth 6) -Encoding UTF8; "[evidence] $p"}
function Broadcast($gate,$to,$data,$desc,$quiet){ if($quiet -ne "GO"){throw "FAIL-CLOSED: this gate requires explicit -Quiet GO parameter to broadcast"} $pk=GetPkHex; $me=DeployerOf $pk; $nonce=(RpcP "eth_getTransactionCount" @($me,"pending")); $gas=([Convert]::ToInt64((RpcP "eth_estimateGas" @(@{from=$me;to=$to;data=$data},"latest")),16))*2; $gp=[Convert]::ToInt64((RpcP "eth_gasPrice" @()),16); $raw=@{from=$me;to=$to;data=$data;nonce=$nonce;gas=("0x"+$gas.ToString("x"));gasPrice=("0x"+$gp.ToString("x"));chainId="0x45c"}; $enc=$raw|ConvertTo-Json -Compress; $ps="-l",($me),"rpc-url",$RpcUrl,"send",$to,"--private-key",$pk,"--data",$data,"--nonce",$nonce,"--gas-limit",$gas.ToString(),"--rpc-url",$RpcUrl; $tx=(& cast $ps 2>$null)|Select-Object -Last 1; SaveEv $gate @{gate=$gate;desc=$desc;txHash=$tx;deployer=$me;chainId=1116;anchor=$anchor;broadcasted=$true;at=(Get-Date).ToUniversalTime().ToString("o")}; "[BROADCAST] $gate hash=$tx" }
""
### GATE 3.6 — Freeze evidence artifact (read-only, NO tx, no secrets)
$d=Join-Path (Split-Path -Parent $repo) "evidence";New-Item -ItemType Directory $d -Force|Out-Null
$hash=Get-ChildItem -LiteralPath $d -Filter "gate-3.*.json" -File|ForEach-Object{(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
$pin=[ordered]@{phase=3;frozen=(Get-Date).ToUniversalTime().ToString("o");chainId=1116;anchor="0x037dF0…EA6E";evidenceFiles=@(Get-ChildItem -LiteralPath $d -Filter "gate-3.*.json" -File|ForEach-Object{$_.Name});sha256=$hash;note="NON-SECRET evidence; keys never here"}
$p=Join-Path $d "phase-3-evidence-freeze.json";Set-Content -LiteralPath $p -Value ($pin|ConvertTo-Json -Depth 5) -Encoding UTF8
"[3.6] frozen: $p"
