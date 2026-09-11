# CoreGuard Live Anchor - Three Proofs Verifier (Windows / PowerShell)
#
# After the real Testnet2 EvidenceRegistry broadcast, this checks the three
# independent proofs from docs/COMMUNITY.md:
#   A) Deployment evidence       -> registry exists on-chain (deploy tx)
#   B) Registry commitment       -> verifyCommitment(proofId, commitment) == true
#   C) Independent recompute     -> receiptId + commitment + proofId recomputed
#                                   OFFLINE match what the chain returns
#
# proofId = H("CGEP/1:ANCHOR", {chainId, receiptId, commitment}) and is NEVER
# assumed equal to receiptId. A+B+C = VERIFIED ANCHOR INTEGRITY, NOT execution
# truth - the execution claim is supported by the receipt/evidence/replay bound
# to the commitment.
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

# --- Proof C first (pure offline; defines the expected commitment + proofId) ---
Write-Host "[1/5] Proof C - recomputing receiptId + commitment + proofId OFFLINE ..."
$planned = node scripts/compute-commitment.mjs --receipt $ReceiptFile | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "compute-commitment failed" }
$receiptId = $planned.receiptId
$commitment = $planned.commitment
$proofId = $planned.proofId
Write-Host "      receiptId : $receiptId"
Write-Host "      commitment: $commitment"
Write-Host "      proofId   : $proofId"
$results["C_recompute"] = "PASS (offline: receiptId/commitment/proofId derived from artifact)"

# --- Proof A - deployment evidence -------------------------------------------------
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

# --- Proof B - registry commitment verification (on the ANCHOR id = proofId) --------
Write-Host "[3/5] Proof B - verifyCommitment on chain (proofId) ..."
$onChain = & cast call --rpc-url $Rpc $Registry "verifyCommitment(bytes32,bytes32)(bool)" $proofId $commitment
if ($LASTEXITCODE -ne 0) { throw "verifyCommitment call failed (rc=$LASTEXITCODE)" }
$results["B_anchor"] = if ($onChain.Trim() -eq "true") { "PASS (chain returns true for proofId)" } else { "FAIL (chain returned $onChain)" }

# --- Anchor TX deep check (optional but recorded when provided) ---------------------
if ($AnchorTx) {
  Write-Host "[4/5] Anchor TX $AnchorTx ..."
  $anchorRaw = & cast rpc --rpc-url $Rpc eth_getTransactionReceipt $AnchorTx
  if ($LASTEXITCODE -ne 0) { $results["B_anchorTx"] = "FAIL (rc=$LASTEXITCODE)" }
  else {
    $aReceipt = $anchorRaw | ConvertFrom-Json
    $sig = (& cast sig "ProofAnchored(bytes32,bytes32,uint8,uint256)").Trim()
    $anchorLog = $aReceipt.logs | Where-Object { $_.topics[0] -like "$sig*" } | Select-Object -First 1
    $okStatus = ($aReceipt.status -eq "0x1")
    $okTo = (-not $anchorLog) -or ($anchorLog.address -ieq $Registry)
    $okProof = $anchorLog -and ($anchorLog.topics[1] -ieq $proofId)
    $okCommit = $anchorLog -and ($anchorLog.topics[2] -ieq $commitment)
    $rcHex = ("{0:x2}" -f $planned.resultCode)
    $resultExpected = ("0" * (64 - $rcHex.Length)) + $rcHex
    $resultPadded = if ($anchorLog) { $anchorLog.data.Substring(2, 64) } else { "" }
    $okResult = $resultPadded -eq $resultExpected
    $results["B_anchorTx"] = if ($okStatus -and $okTo -and $okProof -and $okCommit -and $okResult) {
      "PASS (status 0x1, to==registry, ProofAnchored[proofId,commitment,result=$rcHex])"
    } else {
      "FAIL (status=$($aReceipt.status) toOk=$okTo proofOk=$okProof commitOk=$okCommit resultOk=$okResult)"
    }
    $block = $aReceipt.blockNumber
  }
}
if (-not $block) { $block = $deployReceipt.blockNumber }

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
  block = $block
  proofId = $proofId
  receiptId = $receiptId
  commitment = $commitment
  evidenceRoot = $planned.evidenceRoot
  semanticNote = "A+B+C = VERIFIED ANCHOR INTEGRITY; execution claim is carried by the receipt/evidence/replay bound to the commitment."
  proofs = $results
  passed = $pass
  failed = $fail
  verdict = if ($fail -eq 0) { "VERIFIED ANCHOR INTEGRITY" } else { "INCOMPLETE" }
}
$artifactFile = Join-Path $Root "scripts\verify-live.json"
$artifact | ConvertTo-Json -Depth 5 | Set-Content -Path $artifactFile -Encoding UTF8
Write-Host "  Artifact: $artifactFile"
Write-Host "  Verdict  : $($artifact.verdict) ($pass PASS / $fail FAIL)`n"

if ($fail -gt 0) { throw "live anchor verification: $fail proof(s) failed" }

Write-Host "  --- paste into README ---"
Write-Host "  | Network | Chain ID | Contract | Deployment TX | Anchor TX | Block | Proof ID | Receipt ID | Commitment | Verification |"
Write-Host "  |---|---|---|---|---|---|---|---|---|---|"
Write-Host "  | Core Testnet2 | 1114 | $Registry | $DeployTx | $AnchorTx | $block | $proofId | $receiptId | $commitment | VERIFIED (A+B+C = anchor integrity) |"

Pop-Location