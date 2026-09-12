# CoreGuard Testnet2 Staged Hardening  -  PHASE 2: Deterministic recomputation
#
# ASCII ONLY. READ-ONLY (no broadcast). Recomputes receiptId -> commitment ->
# proofId TWICE from the frozen input produced in Phase 1, and proves the two
# runs are identical (run#1 == run#2). Relies on compute-commitment.mjs writing
# to an explicit --out path so the tracked scripts/live-anchor-planned.json is
# never touched by the campaign.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\testnet2\phase2.ps1

. (Join-Path $PSScriptRoot "common.ps1")

Write-Host "`n  CoreGuard Testnet2  -  PHASE 2: deterministic recomputation`n"

$phase1 = Get-Content (Join-Path $Artifacts "phase1-ledger.json") | ConvertFrom-Json
$receiptFile = $phase1.receiptFile
if (-not (Test-Path $receiptFile)) { throw "phase1 receipt missing: $receiptFile - run phase1 first" }

Write-Host "[1/3] Recompute run #1 ..."
$run1 = node scripts\compute-commitment.mjs --receipt $receiptFile --out (Join-Path $Artifacts "phase2-run1.json") | ConvertFrom-Json

Write-Host "[2/3] Recompute run #2 ..."
$run2 = node scripts\compute-commitment.mjs --receipt $receiptFile --out (Join-Path $Artifacts "phase2-run2.json") | ConvertFrom-Json

Write-Host "[3/3] Comparing run#1 vs run#2 on the full triple ..."
$fields = @("receiptId", "commitment", "proofId", "evidenceRoot", "resultCode")
foreach ($f in $fields) {
  $a = $run1.$f; $b = $run2.$f
  if ($a -ine $b) { throw "DETERMINISM FAIL at $f : $a vs $b" }
}
Write-Host "      run#1 == run#2 on receiptId/commitment/proofId/evidenceRoot/resultCode"

$ledger = [ordered]@{
  schema = "coreguard/testnet2/phase2"
  stage = "phase2"
  chainId = 1114
  incumbentReceiptFile = $receiptFile
  run1 = $run1
  run2 = $run2
  deterministic = $true
  method = "node scripts/compute-commitment.mjs --receipt <phase1 receipt> run twice; identical output required"
  semanticNote = "commitment binds receiptId + evidenceRoot; proofId is domain-separated (never assumed = receiptId)."
}
Write-Artifact "phase2-ledger.json" $ledger

Write-Host "`n  --- PHASE 2 COMPLETE ---"
Write-Host "  receiptId : $($run1.receiptId)"
Write-Host "  commitment: $($run1.commitment)"
Write-Host "  proofId   : $($run1.proofId)`n"
Stop-Campaign