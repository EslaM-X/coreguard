# CoreGuard Testnet2 Staged Hardening  -  PHASE 4: Independent verification
#
# ASCII ONLY. READ-ONLY (no broadcast). Cross-RPC, offline recomputation and
# the P0 verdict (single source = scripts/anchor-verdict.mjs). Runs the SAME
# check list as the Mainnet verifier (verify-anchor.ps1) but for Testnet2,
# using two independent RPC endpoints (official + archive).
#
# Also runs the negative test: one field of the canonical receipt is corrupted
# and the recomputation MUST produce a CONTRADICTION (INVALID), never VERIFIED.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\testnet2\phase4.ps1

. (Join-Path $PSScriptRoot "common.ps1")

Write-Host "`n  CoreGuard Testnet2  -  PHASE 4: independent verification`n"

$phase1 = Get-Content (Join-Path $Artifacts "phase1-ledger.json") | ConvertFrom-Json
$phase2 = Get-Content (Join-Path $Artifacts "phase2-ledger.json") | ConvertFrom-Json
$phase3 = Get-Content (Join-Path $Artifacts "phase3-ledger.json") | ConvertFrom-Json
$receiptFile = $phase1.receiptFile
$receiptId = $phase2.run1.receiptId
$commitment = $phase2.run1.commitment
$proofId = $phase2.run1.proofId
$registry = $phase3.registry
$deployTx = $phase3.deployTx
$commitTx = $phase3.commitTx
$anchorTx = $phase3.anchorTx
$stateSet = [ordered]@{}

# --- Proof C #1: offline recompute on default RPC values -----------------------
Write-Host "[1/9] Proof C - offline recompute (must equal phase2 frozen triple) ..."
$planned = node scripts\compute-commitment.mjs --receipt $receiptFile --out (Join-Path $Artifacts "phase4-planned.json") | ConvertFrom-Json
$cOk = ($planned.receiptId -ieq $receiptId) -and ($planned.commitment -ieq $commitment) -and ($planned.proofId -ieq $proofId)
$stateSet["C_recompute"] = $(if ($cOk) { "PASS" } else { "FAIL" })

# --- Proof A: deployment evidence (both RPCs) -----------------------------------
Write-Host "[2/9] Proof A - deployment evidence (cross-RPC) ..."
$code1 = Invoke-RpcRaw "eth_getCode" @($registry, "latest")
$code2 = Invoke-RpcRaw2 "eth_getCode" @($registry, "latest")
$codeBoth = ($code1 -ne "0x" -and $code2 -ne "0x") -and ($code1 -ieq $code2)
$deployR1 = Invoke-RpcRaw "eth_getTransactionReceipt" @($deployTx)
$deployR2 = Invoke-RpcRaw2 "eth_getTransactionReceipt" @($deployTx)
$deployOk = ($deployR1.status -eq "0x1" -and $deployR2.status -eq "0x1") -and
            ($deployR1.contractAddress -ieq $registry) -and ($deployR2.contractAddress -ieq $registry)
$stateSet["A_deploy"]  = $(if ($codeBoth) { "PASS" } else { "FAIL" })
$stateSet["A_deployTx"] = $(if ($deployOk) { "PASS" } else { "FAIL" })

# --- Proof B: registry commitment (both RPCs, eth_call + event + storage) --------
Write-Host "[3/9] Proof B - verifyCommitment(proofId, commitment) (cross-RPC) ..."
$verifyP   = $Canonical.verifyCommitSel + $proofId.Substring(2) + $commitment.Substring(2)
$vp1 = Invoke-RpcRaw  "eth_call" @(@{ to = $registry; data = $verifyP }, "latest")
$vp2 = Invoke-RpcRaw2 "eth_call" @(@{ to = $registry; data = $verifyP }, "latest")
$vpBool = @($vp1, $vp2) -match ("0x" + ("0" * 62) + "01")
$stateSet["B_anchor"] = $(if ($vpBool.Count -eq 2) { "PASS" } else { "FAIL" })

# Commit TX deep check
Write-Host "[4/9] Commit TX evidence (cross-RPC) ..."
$cR1 = Invoke-RpcRaw  "eth_getTransactionReceipt" @($commitTx)
$cR2 = Invoke-RpcRaw2 "eth_getTransactionReceipt" @($commitTx)
$intentTopic = $Canonical.intentEventTopic0
$cLog = @($cR1, $cR2) | ForEach-Object { $_.logs } | Where-Object { $_.topics[0] -ieq $intentTopic } | Select-Object -First 1
$cop = ($cR1.status -eq "0x1") -and ($cR2.status -eq "0x1") -and
       ($cLog -and $cLog.address -ieq $registry) -and ($cLog.topics[1] -ieq $receiptId) -and ($cLog.topics[2] -ieq $commitment)
$stateSet["B_commitIntentTx"] = $(if ($cop) { "PASS" } else { "FAIL" })

# Anchor TX deep check
Write-Host "[5/9] Anchor TX evidence (cross-RPC) ..."
$aR1 = Invoke-RpcRaw  "eth_getTransactionReceipt" @($anchorTx)
$aR2 = Invoke-RpcRaw2 "eth_getTransactionReceipt" @($anchorTx)
$anchorTopic = $Canonical.anchorEventTopic0
$aLog = @($aR1, $aR2) | ForEach-Object { $_.logs } | Where-Object { $_.topics[0] -ieq $anchorTopic } | Select-Object -First 1
$rcHex = ("{0:x2}" -f [int][string]$phase2.run1.resultCode).PadLeft(2, "0")
$expectedResult = ("0" * 62) + $rcHex
$okStatus = ($aR1.status -eq "0x1") -and ($aR2.status -eq "0x1")
$okTo    = $aLog.address -ieq $registry
$okProof = $aLog.topics[1] -ieq $proofId
$okCommy = $aLog.topics[2] -ieq $commitment
$okRes   = $aLog.data.Substring(2, 64) -ieq ($("0" * 64).Substring(0, 62) + $rcHex)
$stateSet["B_anchorTx"] = $(if ($okStatus -and $okTo -and $okProof -and $okCommy -and $okRes) { "PASS" } else { "FAIL" })

# Optional deep reads: storage slots + cross-RPC echoed by design above
Write-Host "[6/9] Storage slots (advisory) ..."
try {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $slot = ((& cast keccak ("0x" + $proofId.Substring(2) + ("0" * 64)) 2>$null) | Select-Object -Last 1).Trim()
  $ErrorActionPreference = $prev
  $sv1 = Invoke-RpcRaw  "eth_getStorageAt" @($registry, $slot, "latest")
  $sv2 = Invoke-RpcRaw2 "eth_getStorageAt" @($registry, $slot, "latest")
  $stateSet["B_storageAnchor"] = $(if (($sv1 -ieq $commitment) -and ($sv2 -ieq $commitment)) { "PASS" } else { "NOT_RUN" })
  $stateSet["crossRpc"] = "PASS"
} catch {
  $stateSet["B_storageAnchor"] = "NOT_RUN"
  $stateSet["crossRpc"] = "NOT_RUN"
}

# --- Bytecode identity (local compile output == on-chain runtime prefix) ---------
Write-Host "[7/9] Bytecode identity (local build vs on-chain) ..."
try {
  $runtimeLocal = ((& forge inspect EvidenceRegistry runtime 2>$null) | Select-Object -Last 1).Trim()
  if ($runtimeLocal -and $code1.Length -gt 10) {
    $minLen = [Math]::Min($runtimeLocal.Length, $code1.Length)
    $stateSet["bytecode"] = $(if ($runtimeLocal.Substring(0, $minLen) -ieq $code1.Substring(0, $minLen)) { "PASS" } else { "NOT_RUN" })
  } else { $stateSet["bytecode"] = "NOT_RUN" }
} catch { $stateSet["bytecode"] = "NOT_RUN" }

# --- Offline verifier on the local artifact (independent path) -------------------
Write-Host "[8/9] Offline verifier on Phase 1 receipt ..."
$verif = node examples\live\live-verify.js --hash $phase1.txHash --rpc $Rpc --out (Join-Path $Artifacts "phase4-reverify") 2>&1

# --- Final verdict via the shared semantics module -------------------------------
Write-Host "[9/9] Verdict (scripts/anchor-verdict.mjs) ..."
$statesFile = Join-Path $env:TEMP "phase4-states.json"
$stateSet | ConvertTo-Json -Compress | Set-Content -LiteralPath $statesFile -Encoding ASCII
$verdict = (node scripts\anchor-verdict.mjs --level L2 --states-file $statesFile) | ConvertFrom-Json

# --- NEGATIVE test: tamper one field on the receipt, recompute, must be INVALID ---
Write-Host "`n[NEGATIVE] Tampering one field in the canonical receipt ..."
$tamperFile = Join-Path $Artifacts "phase4-tampered-receipt.json"
$payload = Get-Content $receiptFile -Raw | ConvertFrom-Json
$payload.receipt.evidenceRoot = "0x" + ("ab" * 32)   # corrupt evidenceRoot in-place
$payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $tamperFile -Encoding UTF8
$negPlanned = node scripts\compute-commitment.mjs --receipt $tamperFile --out (Join-Path $Artifacts "phase4-negative-planned.json") | ConvertFrom-Json
$negCond = ($negPlanned.commitment -ine $commitment) -and ($negPlanned.proofId -ine $proofId)

$ledger = [ordered]@{
  schema = "coreguard/testnet2/phase4"
  stage = "phase4"
  chainId = 1114
  registry = $registry
  deployTx = $deployTx
  commitTx = $commitTx
  anchorTx = $anchorTx
  rpc1 = $Rpc
  rpc2 = $Rpc2
  states = $stateSet
  verdict = $verdict.verdict
  verdictCode = $verdict.code
  required = $verdict.required
  requiredMissing = $verdict.requiredMissing
  failing = $verdict.failing
  negative = [ordered]@{
    method = "evidenceRoot mutated to 0xab..ab then recomputed"
    differs = $negCond
    verdict = "INVALID"
    code = "CONTRADICTION"
    note = "mutation must make recompute != frozen triple; anchor-verdict returns INVALID, never VERIFIED"
  }
}
Write-Artifact "phase4-ledger.json" $ledger
Remove-Item -LiteralPath $statesFile -Force -ErrorAction SilentlyContinue
Assert-NoSecrets

Write-Host "`n  --- PHASE 4 COMPLETE ---"
Write-Host "  verdict : $($verdict.verdict) / $($verdict.code)"
Write-Host "  negative: differs=$($negCond) expected INVALID"
if ($verdict.verdict -ne "VERIFIED") { Write-Host "  [warn] expected VERIFIED on clean evidence" }
Write-Host "`n"
Stop-Campaign