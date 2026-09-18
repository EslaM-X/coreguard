[CmdletBinding()] param(
 [Parameter(Mandatory=$true)][ValidateSet("3.1-deploy","3.2-commit","3.3-anchor","3.4-readback","3.5-verify","3.6-freeze")][string]$Gate,
 [Parameter(Mandatory=$true)][string]$PkHexEnv
)
$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$repo="D:\KOSSASHI\CORE DAO\coreguard"; Set-Location -LiteralPath $repo
$anchor="0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E"
function RpcP($m,$p){$b=@{jsonrpc="2.0";id=1;method=$m;params=$p}|ConvertTo-Json -Compress -Depth 8;(Invoke-RestMethod -Uri "https://rpc.coredao.org" -Method Post -ContentType "application/json" -Body $b -TimeoutSec 30).result}
function RecallPk($v){$pk=[Environment]::GetEnvironmentVariable($v,"Process"); if(-not $pk -or $pk.Length -ne 64 -or $pk -notmatch '^[0-9a-fA-F]{64}$'){throw "FAIL-CLOSED: no valid PkHex in env var $v (key must come via env ONLY, never disk/log)"}; $pk}
function Dec64($h){[Convert]::ToInt64($h,16)}
function SignAndCast($kind,$to,$data,$desc){
  if(-not $confirm("[$kind] $desc — broadcast REAL tx on Core Mainnet chainId 1116? reply GO exactly")){throw "USER-DENIED"}
  & cast send --rpc-url "https://rpc.coredao.org" --private-key $pk -f $me --to $to --data $data --chain 1116 --json @(ENV) 2>$null | Out-File (Join-Path $repo "evidence\gate-$kind.raw.json") -Encoding UTF8
}
$pk=RecallPk $PkHexEnv
$me="0x"+((& cast wallet address --private-key $pk 2>$null) -split "0x")[-1]
$nonce=Dec64 (RpcP "eth_getTransactionCount" @($me,"pending"))
$bal=Dec64 (RpcP "eth_getBalance" @($me,"latest"))
"[gate $Gate] deployer=$me nonce=$nonce balanceWei=$bal chainId=1116"
switch($Gate){
 "3.1-deploy"{
   if($bal -lt 500000000000000000){throw "FAIL-CLOSED: insufficient for deploy gas"}
   $init=(& forge inspect contracts/EvidenceRegistryV2.sol:EvidenceRegistryV2 bytecode 2>$null | Select-Object -Last 1).Trim()
   $s0="0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E"
   $existing=RpcP "eth_getCode" @($s0,"latest"); if($existing -ne "0x"){throw "FAIL-CLOSED: EvidenceRegistryV1 already at anchor — don't collide; deploy to NEW address via CREATE only"}
   $tx=RpcP "eth_sendRawTransaction" @($signed) 2>$null
   "[3.1] deploy sent: $tx"
 }
}
""
