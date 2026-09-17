[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
Set-Location -LiteralPath $repo

# ---- helper: forge/cast isolation (dotenv warning ONLY ever goes to a file, never to our stream) ----
function Invoke-Forge($argsList, $tag) {
  $so = Join-Path $env:TEMP "cg-$tag-out.txt"
  $se = Join-Path $env:TEMP "cg-$tag-err.txt"
  Remove-Item $so, $se -Force -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath "forge" -ArgumentList $argsList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $out = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue).Trim()
  if ($p.ExitCode -ne 0) { throw "[$tag] forge exit=$($p.ExitCode)" }
  $out
}

# ---- read .env (value never printed) ----
$lines = Get-Content -LiteralPath (Join-Path $repo ".env")
function EnvVal($name) {
  $ln = $lines | Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if (-not $ln) { throw "[FAIL-CLOSED] missing $name in .env" }
  (($ln -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}
$pk = EnvVal "MAINNET_PRIVATE_KEY"
if ($pk -match "(?i)^0x") { $pk = $pk.Substring(2) }
if (-not $pk -or $pk.Length -ne 64 -or $pk -notmatch '^[0-9a-fA-F]{64}$') { throw "[FAIL-CLOSED] invalid key" }
$expectedDeployer = EnvVal "MAINNET_DEPLOYER_ADDRESS"
$derived = ((& cast wallet address --private-key $pk 2>$null | Select-Object -Last 1).Trim())
"[gate3.1][OK] derived address = $derived"
if ($derived -cne $expectedDeployer) { throw "[FAIL-CLOSED] derived != recorded deployer" }
"[gate3.1][OK] key matches MAINNET_DEPLOYER_ADDRESS ($derived)"

# ---- RPC read-only helper ----
function RpcP($m, $p) {
  $b = @{ jsonrpc = "2.0"; id = 1; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 8
  (Invoke-RestMethod -Uri "https://rpc.coredao.org" -Method Post -ContentType "application/json" -Body $b -TimeoutSec 30).result
}
# ---- read-only preflight (zero gas) ----
$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[FAIL-CLOSED] chainId=$cid" }
"[gate3.1][OK] chainId=1116 (Core Mainnet)"

$nonceH = RpcP "eth_getTransactionCount" @($derived, "pending")
$nonce = [Convert]::ToInt64($nonceH, 16)
$balH = RpcP "eth_getBalance" @($derived, "latest")
$bal = [Convert]::ToInt64($balH, 16)
"[gate3.1][OK] nonce=$nonce balance=$([math]::Round($bal/1e18,4)) CORE"
if ($bal -lt 100000000000000000) { throw "[FAIL-CLOSED] low balance" }

# ---- EvidenceRegistryV2 deploy (single tx; constructor: no args => bytecode only) ----
$bc = ((& forge inspect contracts/EvidenceRegistryV2.sol:EvidenceRegistryV2 bytecode 2>$null | Select-Object -Last 1).Trim())
if ($bc.Length -lt 500) { throw "[FAIL-CLOSED] bytecode short" }
"[gate3.1][OK] deploy bytecode len=$($bc.Length)"

"[gate3.1][BROADCAST] EvidenceRegistryV2 deploy on Core Mainnet..."
$sig = (& cast wallet derive-address --private-key $pk 2>$null ...)
"reserved"
