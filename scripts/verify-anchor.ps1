# CoreGuard Live Anchor - Three Proofs Verifier (Windows / PowerShell)
#
# After the real Testnet2 EvidenceRegistry broadcast, this checks the three
# independent proofs from docs/COMMUNITY.md:
#   A) Deployment TX  -> registry exists on-chain
#   B) Anchor TX      -> verifyCommitment(receiptId, commitment) == true
#   C) Independent    -> commitment recomputed OFFLINE matches the chain
#
# NOTE: ASCII only on purpose - PowerShell 5.1 misreads non-ASCII bytes as ANSI
# and a UTF-8 em-dash becomes a stray double-quote, breaking string parsing.
#
# Prereq: Foundry (cast) + Node.js on PATH.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/verify-anchor.ps1 `
#           -Registry 0x... -DeployTx 0x... [-AnchorTx 0x...] [-ReceiptFile examples/transfer/receipt-valid.json]

param(
  [string]$Rpc = "https://rpc.test2.btcs.network",
  [Parameter(Mandatory)][string]$Registry,
  [Parameter(Mandatory)][string]$DeployTx,
  [string]$AnchorTx = "",
  [string]$ReceiptFile = "examples\transfer\receipt-valid.json"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root

$results = [ordered]@{}

Write-Host "`n  CoreGuard LIVE ANCHOR - Three Proofs`n"
Write-Host "  Registry : $Registry"
Write-Host "  DeployTx : $DeployTx"
Write-Host "  RPC      : $Rpc`n"

# --- Proof C first (pure offline; defines the expected commitment) -----------
Write-Host "[1/5] Proof C - recomputing receiptId + commitment OFFLINE ..."
$planned = node scripts/compute-commitment.mjs --receipt $ReceiptFile | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "compute-commitment failed" }
$receiptId = $planned.receiptId
$commitment = $planned.commitment
Write-Host "      receiptId : $receiptId"
Write-Host "      commitment: $commitment"
$results["C_recompute"] = "PASS (offline: $receiptId / $commitment)"

# --- Proof A - deployment ----------------------------------------------------
Write-Host "[2/5] Proof A - deployment TX receipt ..."
$code = & cast code --rpc-url $Rpc $Registry
if ($LASTEXITCODE -ne 0) { $results["A_deploy"] = "FAIL (cast code rc=$LASTEXITCODE)" }
else { $results["A_deploy"] = if ($code -ne "0x" -and $code -ne "") { "PASS (code present)" } else { "FAIL (no code)" } }

$receiptRaw = & cast rpc --rpc-url $Rpc eth_getTransactionReceipt $DeployTx
if ($LASTEXITCODE -ne 0) { throw "eth_getTransactionReceipt failed (rc=$LASTEXITCODE)" }
$deployReceipt = $receiptRaw | ConvertFrom-Json
$deployOk = ($deployReceipt.status -eq "0x1")
$contractMatches = ($deployReceipt.contractAddress -ieq $Registry)
$results["A_deployTx"] = if ($deployOk -and $contractMatches) { "PASS (status 0x1, contractAddress == registry)" } else { "FAIL (status=$($deployReceipt.status) contract=$($deployReceipt.contractAddress))" }

# --- Proof B - anchor commitment on chain ------------------------------------
Write-Host "[3/5] Proof B - verifyCommitment on chain ..."
$onChain = & cast call --rpc-url $Rpc $Registry "verifyCommitment(bytes32,bytes32)(bool)" $receiptId $commitment
if ($LASTEXITCODE -ne 0) { throw "verifyCommitment call failed (rc=$LASTEXITCODE)" }
$results["B_anchor"] = if ($onChain.Trim() -eq "true") { "PASS (chain returns true)" } else { "FAIL (chain returned $onChain)" }

if ($AnchorTx) {
  Write-Host "[4/5] Anchor TX $AnchorTx ..."
  $anchorRaw = & cast rpc --rpc-url $Rpc eth_getTransactionReceipt $AnchorTx
  if ($LASTEXITCODE -ne 0) { $results["B_anchorTx"] = "FAIL (rc=$LASTEXITCODE)" }
  else {
    $aReceipt = $anchorRaw | ConvertFrom-Json
    $results["B_anchorTx"] = if ($aReceipt.status -eq "0x1") { "PASS (status 0x1)" } else { "FAIL (status $($aReceipt.status))" }
  }
}

# --- Final + README block -----------------------------------------------------
$pass = @($results.Values | Where-Object { $_ -match "^PASS" }).Count
$fail = @($results.Values | Where-Object { $_ -match "^FAIL" }).Count
$results | Format-Table -AutoSize | Out-String | Write-Host

$artifact = [ordered]@{
  network = "core-testnet2 (1114)"
  rpc = $Rpc
  registry = $Registry
  deployTx = $DeployTx
  anchorTx = $AnchorTx
  receiptFile = $ReceiptFile
  receiptId = $receiptId
  commitment = $commitment
  proofs = $results
  passed = $pass
  failed = $fail
  verdict = if ($fail -eq 0) { "VERIFIED" } else { "INCOMPLETE" }
}
$artifactFile = Join-Path $Root "scripts\verify-live.json"
$artifact | ConvertTo-Json -Depth 5 | Set-Content -Path $artifactFile -Encoding UTF8
Write-Host "  Artifact: $artifactFile"
Write-Host "  Verdict  : $($artifact.verdict) ($pass PASS / $fail FAIL)`n"

if ($fail -gt 0) { throw "live anchor verification: $fail proof(s) failed" }

Write-Host "  --- paste into README (fill Anchor Tx/Block/Proof ID) ---"
Write-Host "  ## LIVE CORE TESTNET2 ANCHOR"
Write-Host "  | Network | Chain ID | Contract | Deployment TX | Anchor TX | Block | Proof ID | Verification |"
Write-Host "  |---|---|---|---|---|---|---|---|"
Write-Host "  | Core Testnet2 | 1114 | $Registry | $DeployTx | $AnchorTx | <block> | $receiptId | VERIFIED |"

Pop-Location