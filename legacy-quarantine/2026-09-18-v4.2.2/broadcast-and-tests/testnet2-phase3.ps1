# CoreGuard Testnet2 Staged Hardening  -  PHASE 3: Registry interaction
#
# ASCII ONLY. Broadcast phase. Each of the three state-changing transactions
# (deploy, commitIntent, anchorProof) is preceded by a READ-ONLY gate:
#   Assert-Testnet2  +  Assert-BalanceGate  +  read-only chain read.
#
# Requires Phases 1+2: the receipt/commitment/proofId triple from phase2-ledger.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\testnet2\phase3.ps1
#   -PkHex <hex>   REQUIRED. Deployer private key (NOT logged, NOT written).

param([Parameter(Mandatory)][string]$PkHex)

. (Join-Path $PSScriptRoot "common.ps1")

Write-Host "`n  CoreGuard Testnet2  -  PHASE 3: registry interaction`n"

$phase2 = Get-Content (Join-Path $Artifacts "phase2-ledger.json") | ConvertFrom-Json
if (-not $phase2.deterministic) { throw "phase2 did not converge - fix before broadcasting" }
$receiptId = $phase2.run1.receiptId
$commitment = $phase2.run1.commitment
$proofId = $phase2.run1.proofId
$resultCode = $phase2.run1.resultCode
Write-Host "      receiptId : $receiptId"
Write-Host "      commitment: $commitment"
Write-Host "      proofId   : $proofId"
Write-Host "      resultCode: $resultCode"

# ----------------------------------------------------------------------------
Write-Host "`n[GATE] Before deploy (read-only) ..."
Assert-Testnet2
Assert-BalanceGate
$registry = ""

# Deploy exactly the bytecode whose runtime output is compared against Mainnet
# in Phase 4. Same compiler (solc 0.8.24, shanghai, optimizer 200 runs, foundry).
Write-Host "[1/3] Deploying EvidenceRegistry ..."
$bytecode = ((& forge inspect EvidenceRegistry bytecode 2>$null) | Select-Object -Last 1).Trim()
$deployOut = & cast send --rpc-url $Rpc --private-key $PkHex --legacy --json --create $bytecode 2>$null | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $deployOut) { throw "deploy failed (rc=$LASTEXITCODE)" }
$deployed = $deployOut | ConvertFrom-Json
$registry = $deployed.contractAddress
$deployTx = $deployed.transactionHash
if (-not $registry) { throw "deploy returned no contractAddress" }

# Read-only post-deploy evidence: code at address must be present non-empty.
$code = Invoke-RpcRaw "eth_getCode" @($registry, "latest")
if ($code -eq "0x" -or $code.Length -lt 40) { throw "registry code not present on chain" }
Write-Host "      registry=$registry deployTx=$deployTx codeLen=$($code.Length)"
$deployReceipt = Invoke-RpcRaw "eth_getTransactionReceipt" @($deployTx)
if ($deployReceipt.status -ne "0x1") { throw "deploy tx status != success" }
$deployGas = [Convert]::ToInt64($deployReceipt.gasUsed, 16)

# ----------------------------------------------------------------------------
Write-Host "`n[GATE] Before commitIntent (read-only) ..."
Assert-Testnet2
Assert-BalanceGate
Write-Host "[2/3] commitIntent($receiptId, $commitment) ..."
# canonical selector = IntentCommitted(bytes32,bytes32) -> cast sig is only a
# cross-check; we build calldata from the frozen contract source directly.
$commitTxHash = ""
$commitOut = & cast send --rpc-url $Rpc --private-key $PkHex --legacy --json $registry "commitIntent(bytes32,bytes32)" $receiptId $commitment 2>$null | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $commitOut) { throw "commitIntent failed (rc=$LASTEXITCODE)" }
$commitTxHash = ($commitOut | ConvertFrom-Json).transactionHash
$commitReceipt = Invoke-RpcRaw "eth_getTransactionReceipt" @($commitTxHash)
if ($commitReceipt.status -ne "0x1") { throw "commitIntent tx status != success" }
$commitGas = [Convert]::ToInt64($commitReceipt.gasUsed, 16)

# read-back right after: verifyCommitment(receiptId, commitment) must be true
$verifyCalldata = $Canonical.verifyCommitSel + $receiptId.Substring(2) + $commitment.Substring(2)
$verifyRaw = (Invoke-RpcRaw "eth_call" @(@{ to = $registry; data = $verifyCalldata }, "latest"))
$verifyOk = ($verifyRaw -in @("0x" + ("0" * 63) + "1", ("0x" + ("0" * 62) + "01")))
if (-not $verifyOk) { throw "verifyCommitment(receiptId,..) != true after commit" }
Write-Host "      commitTx=$commitTxHash verifyCommitment(receiptId)=true"

# ----------------------------------------------------------------------------
Write-Host "`n[GATE] Before anchorProof (read-only) ..."
Assert-Testnet2
Assert-BalanceGate
Write-Host "[3/3] anchorProof($proofId, $commitment, $resultCode) ..."
$anchorOut = & cast send --rpc-url $Rpc --private-key $PkHex --legacy --json $registry "anchorProof(bytes32,bytes32,uint8)" $proofId $commitment $resultCode 2>$null | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $anchorOut) { throw "anchorProof failed (rc=$LASTEXITCODE)" }
$anchorTx = ($anchorOut | ConvertFrom-Json).transactionHash
$anchorReceipt = Invoke-RpcRaw "eth_getTransactionReceipt" @($anchorTx)
if ($anchorReceipt.status -ne "0x1") { throw "anchorProof tx status != success" }
$anchorGas = [Convert]::ToInt64($anchorReceipt.gasUsed, 16)
$anchorBlock = [Convert]::ToString([Convert]::ToInt64($anchorReceipt.blockNumber, 16), 10)
$anchorBlockHash = $anchorReceipt.blockHash

# read-back: verifyCommitment(proofId, commitment) must be true
$verifyP = $Canonical.verifyCommitSel + $proofId.Substring(2) + $commitment.Substring(2)
$verifyPRaw = Invoke-RpcRaw "eth_call" @(@{ to = $registry; data = $verifyP }, "latest")
$verifyPbool = ($verifyPRaw -in @("0x" + ("0" * 63) + "1", ("0x" + ("0" * 62) + "01")))
if (-not $verifyPbool) { throw "verifyCommitment(proofId,..) != true after anchor" }

$ledger = [ordered]@{
  schema = "coreguard/testnet2/phase3"
  stage = "phase3"
  chainId = 1114
  registry = $registry
  deployTx = $deployTx
  deployGas = $deployGas
  commitTx = $commitTxHash
  commitGas = $commitGas
  anchorTx = $anchorTx
  anchorGas = $anchorGas
  anchorBlockNumber = $anchorBlock
  anchorBlockHash = $anchorBlockHash
  receiptId = $receiptId
  commitment = $commitment
  proofId = $proofId
  resultCode = $resultCode
  verifyCommitmentReceiptId = $verifyOk
  verifyCommitmentProofId = $verifyPbool
  gasTotal = ($deployGas + $commitGas + $anchorGas)
}
Write-Artifact "phase3-ledger.json" $ledger
Assert-NoSecrets

Write-Host "`n  --- PHASE 3 COMPLETE ---"
Write-Host "  registry : $registry"
Write-Host "  deployTx : $deployTx  ($deployGas gas)"
Write-Host "  commitTx : $commitTxHash  ($commitGas gas)"
Write-Host "  anchorTx : $anchorTx  ($anchorGas gas)"
Write-Host "  total    : $($ledger.gasTotal) gas`n"
Stop-Campaign