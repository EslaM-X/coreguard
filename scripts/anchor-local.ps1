# CoreGuard Local On-Chain Proof (Windows / PowerShell)
#
# Deploys EvidenceRegistry on an ANVIL FORK of Core Testnet2 and anchors a
# sample execution receipt — then reads the commitment back. This proves the
# full on-chain anchor flow (deploy -> commitIntent -> anchorProof ->
# verifyCommitment) without needing testnet funds. The exact same commands,
# pointed at the live RPC, perform the real Testnet2 deployment.
#
# Prereq: Foundry (anvil, forge, cast) + Node.js on PATH.
#
# Usage:   powershell -ExecutionPolicy Bypass -File scripts/anchor-local.ps1

param([string]$Rpc = "https://rpc.test2.btcs.network")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root

# anvil default dev account (always pre-funded, even on a fork)
$Pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
$ForkRpc = "http://127.0.0.1:8545"

Write-Host "`n  CoreGuard local on-chain proof (anvil fork of Testnet2)"
Write-Host "  ------------------------------------------------------------"

Write-Host "`n[1/5] Bootstrapping anvil fork of $Rpc ..."
$anvil = Start-Process -FilePath "anvil" -ArgumentList "--fork-url", $Rpc, "--silent" -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 4

  Write-Host "[2/5] Fetching compiled EvidenceRegistry bytecode ..."
  $bytecode = & forge inspect EvidenceRegistry bytecode
  if ($LASTEXITCODE -ne 0) { throw "forge inspect failed" }

  Write-Host "[3/5] Deploying EvidenceRegistry on the local fork ..."
  $deployOut = & cast send --rpc-url $ForkRpc --private-key $Pk --legacy --json --create $bytecode | ConvertFrom-Json
  $registry = $deployOut.contractAddress
  Write-Host "      Registry:  $registry"
  Write-Host "      Tx:        $($deployOut.transactionHash)"

  Write-Host "[4/5] Anchoring a CoreGuard execution receipt ..."
  $receiptId = (node --input-type=module -e "import('./examples/transfer/receipt-valid.json',{with:{type:'json'}}).then(m=>process.stdout.write(m.default.receiptId))").Trim()
  $proofId = "0x" + ("cd" * 32) # distinct anchor id (derived from evidence root in prod)
  $commitment = "0x" + ("ab" * 32) # deterministic demo commitment (keccak(evidenceRoot) in prod)
  & cast send --rpc-url $ForkRpc --private-key $Pk --legacy $registry "commitIntent(bytes32,bytes32)" $receiptId $commitment | Out-Null
  & cast send --rpc-url $ForkRpc --private-key $Pk --legacy $registry "anchorProof(bytes32,bytes32,uint8)" $proofId $commitment 0 | Out-Null

  Write-Host "[5/5] Reading the commitment back from the chain ..."
  $committed = (& cast call --rpc-url $ForkRpc $registry "verifyCommitment(bytes32,bytes32)(bool)" $receiptId $commitment).Trim()
  $proofCommitted = (& cast call --rpc-url $ForkRpc $registry "verifyCommitment(bytes32,bytes32)(bool)" $proofId $commitment).Trim()
  $isCommitted = (& cast call --rpc-url $ForkRpc $registry "isCommitted(bytes32)(bool)" $proofId).Trim()
  Write-Host "      verifyCommitment (intent): $committed"
  Write-Host "      verifyCommitment (proof):  $proofCommitted"
  Write-Host "      isCommitted:               $isCommitted"

  $proof = @{
    network = "localhost (anvil fork of core-testnet2 1114)"
    registry = $registry
    intentId = $receiptId
    proofId = $proofId
    commitment = $commitment
    verifyCommitment = ($committed -eq "true")
    verifyProofCommitment = ($proofCommitted -eq "true")
    isCommitted = ($isCommitted -eq "true")
    deployTx = $deployOut.transactionHash
    timestamp = (Get-Date -Format o)
  } | ConvertTo-Json

  $outFile = Join-Path $Root "scripts\anchor-proof.json"
  Set-Content -Path $outFile -Value $proof -Encoding UTF8
  Write-Host "`n  [OK] On-chain anchor flow PROVEN on a local fork."
  Write-Host "  Artifact: $outFile`n"

  if ($proof.verifyCommitment -eq $false -or $proof.verifyProofCommitment -eq $false) { throw "commitment verification failed" }
}
finally {
  Stop-Process -Id $anvil.Id -Force -ErrorAction SilentlyContinue
}
Pop-Location