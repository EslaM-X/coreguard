# GATE 3.3 -- anchorProof broadcast on EvidenceRegistryV2 (Core Mainnet 1116)
# ASCII-ONLY. Reads gate-3.2 evidence + on-chain intentCommits; signs EIP-712 via anchorProofDigest.
# Key: .env only, never printed/evidenced. Fail-closed: every assertion on-chain based, else abort.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
$rpc = "https://rpc.coredao.org"
Set-Location -LiteralPath $repo
$ev32 = Get-Content -LiteralPath (Join-Path $repo "evidence\gate-3.2-commitintent.json") -Raw | ConvertFrom-Json
$anchor = $ev32.registry
$intentId = $ev32.intentId
$intentCommitment = $ev32.intentCommitment
$signer = $ev32.signer

function InvokeCast([string[]]$argList) {
  $so = Join-Path $env:TEMP ("cg33-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg33-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}
function RpcP($method, $params) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($res.error) { throw "RPC error: $($res.error.message)" }
  return $res.result
}
function EnvVal($name) {
  $line = Get-Content -LiteralPath (Join-Path $repo ".env") | Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if (-not $line) { throw "[FAIL-CLOSED] missing $name in .env" }
  (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[FAIL-CLOSED] chainId=$cid" }
"[OK] chainId=1116 registry=$anchor intent=$($intentId.Substring(0,18))..."

# ---- key + identity (fail-closed) ----
$pk = EnvVal "MAINNET_PRIVATE_KEY"
if ($pk -match "(?i)^0x") { $pk = $pk.Substring(2) }
if ($pk -notmatch "^[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] invalid key" }
$derived = (InvokeCast @("wallet", "address", "--private-key", $pk)).Split("`n") | Select-Object -Last 1
$derived = $derived.Trim()
if ($derived -ine $signer -or $derived -ine (EnvVal "MAINNET_DEPLOYER_ADDRESS")) { throw "[FAIL-CLOSED] signer mismatch" }
"[OK] signer verified: $derived"

# ---- on-chain intent state (authoritative; cast prints tuple fields line-by-line) ----
$stored = InvokeCast @("call", "--rpc-url", $rpc, $anchor, "intentCommits(bytes32)(bytes32,bytes32,bytes32,uint256,address)", $intentId)
$lines = $stored -split "`r?`n" | Where-Object { $_.Trim() }
if ($lines.Count -lt 5) { throw "[FAIL-CLOSED] intentCommits: expected 5 tuple fields, got $($lines.Count)" }
$onChainCommitment = $lines[0].Trim()
$onChainValidUntil = $lines[3].Trim()
if ($onChainValidUntil -match "^(\d+)") { $onChainValidUntil = $Matches[1] } else { throw "[FAIL-CLOSED] cannot parse validUntil '$onChainValidUntil'" }
$onChainSigner = $lines[4].Trim()
"[OK] on-chain intentCommitment=$($onChainCommitment.Substring(0,18))... signer=$onChainSigner validUntil=$onChainValidUntil"
if ($onChainCommitment -ine $intentCommitment) { throw "[FAIL-CLOSED] on-chain commitment differs from gate-3.2 evidence" }
if ($onChainSigner -ine $signer) { throw "[FAIL-CLOSED] on-chain signer mismatch" }
$storedValidUntil = [Convert]::ToInt64($onChainValidUntil, 10)
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# if the intent window has lapsed, re-commit now (this is still an explicit, intentional broadcast)
if ($now -ge $storedValidUntil) {
  "[INFO] intent window expired (validUntil=$storedValidUntil now=$now) -> re-committing with fresh window"
  $validUntil2 = $now + 7200
  $digest2 = (InvokeCast @("call", "--rpc-url", $rpc, $anchor, "commitIntentDigest(bytes32,bytes32,uint256,address)(bytes32)", $intentId, $intentCommitment, ("0x" + $validUntil2.ToString("x")), $signer)).Trim()
  $sig2 = (InvokeCast @("wallet", "sign", "--private-key", $pk, "--no-hash", $digest2)).Split("`n") | Select-Object -Last 1
  $sig2 = $sig2.Trim()
  if ($sig2 -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[FAIL-CLOSED] bad re-commit signature" }
  $out2 = InvokeCast @("send", "--rpc-url", $rpc, "--private-key", $pk, "--chain", "1116", "--legacy", "--json", $anchor, "commitIntent(bytes32,bytes32,address,uint256,bytes)", $intentId, $intentCommitment, $signer, ("0x" + $validUntil2.ToString("x")), $sig2)
  $j2 = $out2 | ConvertFrom-Json
  $txh2 = $j2.transactionHash; if (-not $txh2) { $txh2 = $j2.hash }
  if (-not $txh2) { throw "[FAIL-CLOSED] no re-commit tx" }
  $rec2 = $null
  for ($i = 0; $i -lt 40; $i++) { $rec2 = RpcP "eth_getTransactionReceipt" @($txh2); if ($rec2) { break }; Start-Sleep -Seconds 5 }
  if (-not $rec2 -or [Convert]::ToInt64($rec2.status, 16) -ne 1) { throw "[FAIL-CLOSED] re-commit reverted" }
  "[BROADCASTED] commitIntent renew txHash=$txh2 (validUntil=$validUntil2)"
  Set-Content -LiteralPath (Join-Path $repo "evidence\gate-3.3-recommit.json") -Value ([ordered]@{ gate = "3.3-recommit"; txHash = $txh2; validUntil = $validUntil2; date = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json) -Encoding UTF8
  $storedValidUntil = $validUntil2
} else {
  "[OK] intent window still open (validUntil=$storedValidUntil now=$now)"
}
if ($now -ge $storedValidUntil) { throw "[FAIL-CLOSED] still after validUntil after re-commit ref" }

# ---- proof semantics (deterministic, non-secret) ----
$receiptHash = (Get-FileHash -LiteralPath (Join-Path $repo "evidence\gate-3.2-commitintent.json") -Algorithm SHA256).Hash.ToLowerInvariant()
$receiptId = "0x" + $receiptHash
$bundleHash = (Get-FileHash -LiteralPath (Join-Path $repo "contracts\EvidenceRegistryV2.sol") -Algorithm SHA256).Hash.ToLowerInvariant()
$proofCommitment = "0x" + $bundleHash
$pkgHash = (Get-FileHash -LiteralPath (Join-Path $repo "package.json") -Algorithm SHA256).Hash.ToLowerInvariant()
$verifierVersion = "0x" + $pkgHash.Substring(0, 64)
$result = "0"
$proofIdTxt = "CG|" + $intentId.TrimStart("0x") + "|" + $receiptId.TrimStart("0x") + "|" + $proofCommitment.TrimStart("0x") + "|" + $verifierVersion.TrimStart("0x") + "|" + $result
$proofId = (InvokeCast @("keccak", $proofIdTxt)).Trim()
"[OK] proofId=$($proofId.Substring(0,18))... receiptId=$($receiptId.Substring(0,18))..."

# ---- digest via anchorProofDigest (on-chain, authoritative) ----
$digest = (InvokeCast @("call", "--rpc-url", $rpc, $anchor, "anchorProofDigest(bytes32,bytes32,bytes32,bytes32,uint8,bytes32)(bytes32)", $proofId, $intentId, $receiptId, $proofCommitment, $result, $verifierVersion)).Trim()
if ($digest -notmatch "^0x[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] digest=$digest" }
"[OK] anchorProofDigest=$($digest.Substring(0,18))..."

# ---- EIP-712 authorization ----
$sig = (InvokeCast @("wallet", "sign", "--private-key", $pk, "--no-hash", $digest)).Split("`n") | Select-Object -Last 1
$sig = $sig.Trim()
if ($sig -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[FAIL-CLOSED] bad signature" }
"[OK] authorization signature produced (not echoed)"

# ---- broadcast ----
"[BROADCAST] anchorProof => $anchor ..."
$sendOut = InvokeCast @("send", "--rpc-url", $rpc, "--private-key", $pk, "--chain", "1116", "--legacy", "--json", $anchor, "anchorProof(bytes32,bytes32,bytes32,bytes32,uint8,bytes32,bytes)", $proofId, $intentId, $receiptId, $proofCommitment, $result, $verifierVersion, $sig)
$obj = $sendOut | ConvertFrom-Json
$txh = $obj.transactionHash; if (-not $txh) { $txh = $obj.hash }
if (-not $txh) { throw "[FAIL-CLOSED] no tx hash" }
"[BROADCASTED] txHash=$txh"

$rec = $null
for ($i = 0; $i -lt 40; $i++) { $rec = RpcP "eth_getTransactionReceipt" @($txh); if ($rec) { break }; Start-Sleep -Seconds 5 }
if (-not $rec) { throw "[FAIL-CLOSED] no receipt" }
if ([Convert]::ToInt64($rec.status, 16) -ne 1) { throw "[FAIL-CLOSED] reverted on chain" }
$bn = [Convert]::ToInt64($rec.blockNumber, 16)
"[OK] included block=$bn status=1"

$evidence = [ordered]@{
  gate = "3.3"; chainId = 1116; registry = $anchor; txHash = $txh; block = $bn
  proofId = $proofId; intentId = $intentId; receiptId = $receiptId
  proofCommitment = $proofCommitment; result = $result; verifierVersion = $verifierVersion
  signer = $signer; validUntil = $storedValidUntil
  verdict = "ANCHORED-ON-CHAIN"; date = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 4
Set-Content -LiteralPath (Join-Path $repo "evidence\gate-3.3-anchorproof.json") -Value $evidence -Encoding UTF8
"[OK] evidence pinned: evidence\gate-3.3-anchorproof.json"
"[GATE 3.3 COMPLETE] next = gate 3.4 (read-back) awaits separate GO"