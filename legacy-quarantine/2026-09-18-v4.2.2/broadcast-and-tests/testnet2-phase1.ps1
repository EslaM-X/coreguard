# CoreGuard Testnet2 Staged Hardening  -  PHASE 1: Tiny evidence transaction
#
# ASCII ONLY. Broadcast phase. Gate runs FIRST (Assert-BalanceGate): if the
# wallet is not funded, the campaign stops here - no transaction is sent.
#
# Produces a real Testnet2 execution evidence transaction (tiny self-transfer),
# then builds the canonical receipt via the independent live pipeline:
#   live-verify.js --hash <txHash>  ->  evidence bundle + receipt + receiptId
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\testnet2\phase1.ps1
#   -PkHex <hex>   REQUIRED. Deployer private key (NOT logged, NOT written).

param([Parameter(Mandatory)][string]$PkHex)

. (Join-Path $PSScriptRoot "common.ps1")

Write-Host "`n  CoreGuard Testnet2  -  PHASE 1: tiny evidence transaction`n"

Assert-Testnet2
Assert-BalanceGate
Assert-CleanTree

# Tiny self-transfer: wallet -> itself, 1 gwei. Enough to produce a live
# receipt with a real gas cost, negligible value.
$VAL_WEI = "1000000000"

Write-Host "[1/4] Broadcasting tiny self-transfer ($VAL_WEI wei) ..."
$sendOut = & cast send --rpc-url $Rpc --private-key $PkHex --legacy --json --value $VAL_WEI $Wallet 2>$null | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $sendOut) { throw "cast send failed (rc=$LASTEXITCODE)" }
$sent = $sendOut | ConvertFrom-Json
$txHash = $sent.transactionHash
Write-Host "      txHash: $txHash"

Write-Host "[2/4] Waiting for receipt ..."
$receipt = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  try { $receipt = Invoke-RpcRaw "eth_getTransactionReceipt" @($txHash) } catch { }
  if ($receipt) { break }
}
if (-not $receipt) { throw "receipt not found for $txHash" }
if ($receipt.status -ne "0x1") { throw "tx status != success: $($receipt.status)" }
$blockNumber = [Convert]::ToString([Convert]::ToInt64($receipt.blockNumber, 16), 10)
$blockHash = $receipt.blockHash
$gasUsed = [Convert]::ToInt64($receipt.gasUsed, 16)
$effectiveGasPrice = [Convert]::ToInt64($receipt.effectiveGasPrice, 16)
Write-Host "      block=$blockNumber hash=$blockHash gas=$gasUsed gasPrice=$effectiveGasPrice"

Write-Host "[3/4] Verifying txHash<->blockHash binding (ever byte of both) ..."
$tx = Invoke-RpcRaw "eth_getTransactionByHash" @($txHash)
if ($tx.hash -ine $txHash) { throw "txByHash.hash mismatch" }
if ($tx.blockHash -ine $blockHash) { throw "txByHash.blockHash != receipt.blockHash" }

Write-Host "[4/4] Building canonical receipt via live pipeline ..."
$liveDir = Join-Path $Artifacts "phase1-live"
$nodeOut = & node examples\live\live-verify.js --hash $txHash --rpc $Rpc --out $liveDir 2>&1
if ($LASTEXITCODE -ne 0) { throw "live-verify failed`n$nodeOut" }
$receiptJson = Join-Path $liveDir "receipt.json"
if (-not (Test-Path $receiptJson)) { throw "live-verify did not write receipt.json" }

# Capture the four canonical ids from the live output for the campaign ledger.
$livePlanned = node scripts\compute-commitment.mjs --receipt $receiptJson --out (Join-Path $Artifacts "phase1-planned.json")
if ($LASTEXITCODE -ne 0) { throw "compute-commitment failed" }

$ledger = [ordered]@{
  schema = "coreguard/testnet2/phase1"
  stage = "phase1"
  chainId = 1114
  wallet = $Wallet
  txHash = $txHash
  blockNumber = $blockNumber
  blockHash = $blockHash
  gasUsed = $gasUsed
  effectiveGasPrice = $effectiveGasPrice
  valueWei = $VAL_WEI
  txBlockBinding = "PASS"
  receiptFile = $receiptJson
  planned = ($livePlanned | ConvertFrom-Json)
}
Write-Artifact "phase1-ledger.json" $ledger
Assert-NoSecrets

Write-Host "`n  --- PHASE 1 COMPLETE ---"
Write-Host "  txHash     : $txHash"
Write-Host "  block      : $blockNumber ($blockHash)"
Write-Host "  receiptId  : $($ledger.planned.receiptId)`n"
Stop-Campaign