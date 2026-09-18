# GATE 3.2 -- commitIntent broadcast on EvidenceRegistryV2 anchor -- Core Mainnet chainId 1116
# ASCII-ONLY in string literals (no em-dash, no non-ASCII) -- this was the root cause of all prior parser failures.
# Key: read from .env at runtime only; NEVER printed to evidence or log. Fail-closed: any mismatch => abort.
$ErrorActionPreference = "Stop"
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
$anchor = "0x66268a47e81b8f657798d7b5bbedc956df7b13fd"
$rpc = "https://rpc.coredao.org"
Set-Location -LiteralPath $repo

# ---- isolated native runner (stderr to temp file; cannot pollute captures) ----
function InvokeCast([string[]]$argList) {
  $so = Join-Path $env:TEMP ("cg32-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg32-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""
  $seOut = ""
  if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# ---- json RPC (read-only) ----
function RpcP($method, $params) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  return $res.result
}

# ---- .env key: derived address must equal recorded address ----
$envLines = Get-Content -LiteralPath (Join-Path $repo ".env")
function EnvVal([string]$name) {
  $hit = $envLines | Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if (-not $hit) { throw "[FAIL-CLOSED] $name missing in .env" }
  return (($hit -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}
$pk = EnvVal "MAINNET_PRIVATE_KEY"
if ($pk -match "(?i)^0x") { $pk = $pk.Substring(2) }
if ($pk -notmatch "^[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] invalid key format" }
$want = EnvVal "MAINNET_DEPLOYER_ADDRESS"
$derived = (InvokeCast @("wallet", "address", "--private-key", $pk)).Split("`n") | Select-Object -Last 1
$derived = $derived.Trim()
if ($derived -ine $want) { throw "[FAIL-CLOSED] derived=$derived want=$want" }
"[OK] deployer identity verified: $derived"

# ---- preflight ----
$chainIdHex = RpcP "eth_chainId" @()
$chainId = [Convert]::ToInt64($chainIdHex, 16)
if ($chainId -ne 1116) { throw "[FAIL-CLOSED] chainId=$chainId" }
"[OK] chainId=1116 (Core Mainnet)"

$nonceHex = RpcP "eth_getTransactionCount" @($want, "pending")
$nonce = [Convert]::ToInt64($nonceHex, 16)
$balHex = RpcP "eth_getBalance" @($want, "latest")
$bal = [Convert]::ToInt64($balHex, 16)
"[OK] nonce=$nonce balance=$([math]::Round($bal / 1e18, 4)) CORE"
if ($bal -lt 50000000000000000) { throw "[FAIL-CLOSED] balance too low" }

# ---- intentId + commitment derived deterministically from pinned source evidence ----
$srcHash = (Get-FileHash -LiteralPath (Join-Path $repo "contracts/EvidenceRegistryV2.sol") -Algorithm SHA256).Hash.ToLowerInvariant()
$intentCommitment = "0x" + $srcHash
if ($intentCommitment.Length -ne 66) { throw "[FAIL-CLOSED] commitment" }
$intentId = "0x" + ((Get-FileHash -LiteralPath (Join-Path $repo "evidence/gate-3.0-preflight.json") -Algorithm SHA256 | Select-Object -Expand Hash).ToLowerInvariant())
"[OK] intentId=$($intentId.Substring(0,18))... intentCommitment=$($intentCommitment.Substring(0,18))..."
$validUntil = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 3600  # 1h window

# ---- digest via eth_call against deployed registry (authoritative, no assumptions) ----
$digestVer = (InvokeCast @("call", "--rpc-url", $rpc, $anchor, "commitIntentDigest(bytes32,bytes32,uint256,address)(bytes32)", $intentId, $intentCommitment, ("0x" + $validUntil.ToString("x")), $want))
$digest = $digestVer.Trim()
if ($digest -notmatch "^0x[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] digest=$digest" }
"[OK] commitIntentDigest=$($digest.Substring(0,18))..."

# ---- EIP-712 authorization signature (signer = deployer key) ----
$sig = (InvokeCast @("wallet", "sign", "--private-key", $pk, "--no-hash", $digest)).Split("`n") | Select-Object -Last 1
$sig = $sig.Trim()
if ($sig -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[FAIL-CLOSED] bad signature" }
"[OK] authorization signature produced (not echoed)"

# ---- THE broadcast (single, explicit, authorized GO for gate 3.2) ----
"[BROADCAST] commitIntent => $anchor ..."
$sendOut = InvokeCast @("send", "--rpc-url", $rpc, "--private-key", $pk, "--chain", "1116", "--legacy", "--json", $anchor, "commitIntent(bytes32,bytes32,address,uint256,bytes)", $intentId, $intentCommitment, $want, ("0x" + $validUntil.ToString("x")), $sig)
$obj = $sendOut | ConvertFrom-Json
$txh = $obj.transactionHash; if (-not $txh) { $txh = $obj.hash }
if (-not $txh) { throw "[FAIL-CLOSED] no tx hash in send output" }
"[BROADCASTED] txHash=$txh"

# ---- wait for receipt + status check (fail-closed) ----
$rec = $null
for ($i = 0; $i -lt 40; $i++) {
  $rec = RpcP "eth_getTransactionReceipt" @($txh)
  if ($rec) { break }
  Start-Sleep -Seconds 5
}
if (-not $rec) { throw "[FAIL-CLOSED] no receipt after 200s" }
if ([Convert]::ToInt64($rec.status, 16) -ne 1) { throw "[FAIL-CLOSED] tx reverted on chain" }
$bn = [Convert]::ToInt64($rec.blockNumber, 16)
"[OK] included in block $bn (status=1)"

# ---- pin evidence (non-secret; key value never included) ----
$evidence = [ordered]@{
  gate = "3.2"; chainId = 1116; registry = $anchor; txHash = $txh; block = $bn
  intentId = $intentId; intentCommitment = $intentCommitment
  signer = $want; validUntil = $validUntil
  verdict = "COMMITTED-ON-CHAIN"; gasSpent = 1; date = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 4
$evPath = Join-Path $repo "evidence\gate-3.2-commitintent.json"
Set-Content -LiteralPath $evPath -Value $evidence -Encoding UTF8
"[OK] evidence pinned: evidence\gate-3.2-commitintent.json"
"[GATE 3.2 COMPLETE] next = gate 3.3 (anchorProof) awaits separate GO"