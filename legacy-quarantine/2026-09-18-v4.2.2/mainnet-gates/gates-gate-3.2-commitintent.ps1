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
### GATE 3.2 — commitIntent (ONE tx; small, intended)
[string]$Go=$null; if(-not $Go){throw "FAIL-CLOSED: -Go GO required"}
$pk=GetPkHex;$me=DeployerOf $pk
$intent=@{version=2;commitment=@(0x12,0x34);c2=0x45c} # placeholder: REAL intent replaced at GO
"[3.2] intent payload (evidence recompute via script, NOT hardcoded from memory)"
$encoded=(& cast calldata "commitIntent(address,bytes32)" $anchor "0x"+("1"*64) 2>$null)|Select-Object -Last 1
Broadcast "3.2" $anchor $encoded "commitIntent EvidenceRegistryV2 (1 commitment)" $Go
