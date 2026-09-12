# CoreGuard Testnet2 Staged Hardening  -  PHASE 5: Freeze Testnet2 evidence
#
# ASCII ONLY. READ-ONLY (no broadcast). Assembles the single frozen campaign
# artifact from the four phase ledgers with explicit OBSERVED / DERIVED /
# VERIFIED separation. This artifact lives OUTSIDE the artifacts dir (which is
# gitignored) - it is committed as the durable Testnet2 evidence record and is
# NEVER rewritten after this phase. It is fully separate from the Mainnet
# frozen bundle (scripts/verify-live.json).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\testnet2\phase5.ps1

. (Join-Path $PSScriptRoot "common.ps1")

Write-Host "`n  CoreGuard Testnet2  -  PHASE 5: freeze evidence`n"

$p1 = Get-Content (Join-Path $Artifacts "phase1-ledger.json") | ConvertFrom-Json
$p2 = Get-Content (Join-Path $Artifacts "phase2-ledger.json") | ConvertFrom-Json
$p3 = Get-Content (Join-Path $Artifacts "phase3-ledger.json") | ConvertFrom-Json
$p4 = Get-Content (Join-Path $Artifacts "phase4-ledger.json") | ConvertFrom-Json

if ($p4.verdict -ne "VERIFIED") { throw "phase4 verdict is not VERIFIED - do not freeze" }
if (-not $p2.deterministic) { throw "phase2 not deterministic - do not freeze" }

$artifact = [ordered]@{
  schema = "coreguard/testnet2-hardening"
  version = "0.1.0"
  network = "core-testnet2"
  chainId = 1114
  wallet = $Wallet
  campaignRuns = [ordered]@{
    phase1EvidenceTx = $p1
    phase2Deterministic = $p2
    phase3Registry = $p3
    phase4IndependentVerification = $p4
  }
  OBSERVED = [ordered]@{
    chainId = 1114
    wallet = $Wallet
    evidenceTx = $p1.txHash
    evidenceBlockNumber = $p1.blockNumber
    evidenceBlockHash = $p1.blockHash
    evidenceGasUsed = $p1.gasUsed
    evidenceEffectiveGasPrice = $p1.effectiveGasPrice
    registry = $p3.registry
    deployTx = $p3.deployTx
    commitTx = $p3.commitTx
    anchorTx = $p3.anchorTx
    anchorBlockNumber = $p3.anchorBlockNumber
    anchorBlockHash = $p3.anchorBlockHash
    rpc1 = $Rpc
    rpc2 = $Rpc2
  }
  DERIVED = [ordered]@{
    receiptId = $p2.run1.receiptId
    commitment = $p2.run1.commitment
    proofId = $p2.run1.proofId
    evidenceRoot = $p2.run1.evidenceRoot
    resultCode = $p2.run1.resultCode
    deterministic = $p2.deterministic
    method = "run#1 == run#2 of compute-commitment.mjs on Phase 1 receipt"
  }
  VERIFIED = [ordered]@{
    verdict = $p4.verdict
    verdictCode = $p4.verdictCode
    levels = "L0/L1/L2 (proof-level profile)"
    required = $p4.required
    requiredMissing = $p4.requiredMissing
    failing = $p4.failing
    validators = @("rpc:$Rpc", "rpc2:$Rpc2", "offline recompute", "P0 verdict module")
  }
  gasBaseline = [ordered]@{
    evidenceTxBytes = $p1.gasUsed
    registryDeploy = $p3.deployGas
    commitIntent = $p3.commitGas
    anchorProof = $p3.anchorGas
    totalExecution = ($p3.deployGas + $p3.commitGas + $p3.anchorGas)
    mainnetObservedTotal = 329734
    mainnetEffectiveGasPriceGwei = 60
    mainnetObservedCostCORE = 0.01978404
    note = "Mainnet single-anchor observed baseline (historical, NOT a future cost promise). Testnet2 gas figures recorded per-transaction in campaignRuns."
  }
  negativeTest = $p4.negative
  semanticNote = "The registry proves that a specific commitment was anchored on Core Testnet2. The execution claim is supported by the independently verifiable evidence/replay bound to that commitment."
}

# Validators serialized inline above.

$outFile = Join-Path $Root "scripts\testnet2-hardening.json"
$artifact | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outFile -Encoding UTF8

Write-Host "  Frozen artifact: scripts/testnet2-hardening.json (committed; never rewritten)"
Assert-NoSecrets
Assert-CleanTree

Write-Host "`n  --- PHASE 5 COMPLETE ---"
Write-Host "  OBSERVED : tx=$($p1.txHash) registry=$($p3.registry)"
Write-Host "  DERIVED  : receiptId=$($p2.run1.receiptId)"
Write-Host "  VERIFIED : $($p4.verdict) / $($p4.verdictCode)`n"
Stop-Campaign