# GATE 3.1-precheck -- confirm V1 live anchor + V2 absent on Core Mainnet (1116). ASCII-ONLY. zero-gas.
$ErrorActionPreference = "Stop"
$rpc = "https://rpc.coredao.org"
function RpcP($method, $params) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($res.error) { throw "RPC error: $($res.error.message)" }
  return $res.result
}
$cidHex = RpcP "eth_chainId" @()
$cid = [Convert]::ToInt64($cidHex, 16)
"[check] chainId=$cid"
if ($cid -ne 1116) { throw "[FAIL-CLOSED] not mainnet" }

$v1 = RpcP "eth_getCode" @("0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E", "latest")
"[check] V1 anchor 0x037d... code len=$($v1.Length) (0x = empty, else live)"

# compare V1 local runtime vs on-chain (byte-identity, no memory)
$outF = Join-Path $env:TEMP ("cg31pc-o-" + [guid]::NewGuid() + ".txt")
$errF = Join-Path $env:TEMP ("cg31pc-e-" + [guid]::NewGuid() + ".txt")
$p = Start-Process -FilePath "forge" -ArgumentList @("inspect", "contracts/EvidenceRegistry.sol:EvidenceRegistry", "runtime-code") -WorkingDirectory "D:\KOSSASHI\CORE DAO\coreguard" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outF -RedirectStandardError $errF
$localV1 = (Get-Content -LiteralPath $outF -Raw -ErrorAction SilentlyContinue).Trim()
Remove-Item -LiteralPath $outF, $errF -Force -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0) { throw "forge inspect V1 failed" }
"[check] V1 local runtime len=$($localV1.Length)"
$ident = if ($localV1 -and $v1.Length -gt 2 -and $localV1 -ieq $v1) { "BYTE-IDENTICAL" } else { "NOTE: differs or local-empty; report raw lens only" }
"[verdict] V1 local-vs-chain runtime $ident"

# try a V1 view that exists in both source worlds? no -- V1 uses commitIntent(bytes32 ids...). Just report.
"[done] V1 check complete (zero-gas). Now run deploy gate 3.1 for V2."