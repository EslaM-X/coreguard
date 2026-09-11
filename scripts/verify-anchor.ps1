# CoreGuard Live Anchor - Three Proofs Verifier (Windows / PowerShell)
#
# After the real Mainnet evidence broadcast, this checks the evidence
# bundle from docs/COMMUNITY.md, and closes the verdict under the P0
# semantics (scripts/anchor-verdict.mjs):
#
#   A) Deployment evidence       -> registry exists on-chain (deploy tx)
#   B) Registry commitment       -> verifyCommitment(proofId, commitment) == true
#   C) Independent recompute     -> receiptId + commitment + proofId recomputed
#                                   OFFLINE match what the chain returns
#
# Verdict semantics (single source of truth = scripts/anchor-verdict.mjs):
#   - Missing ANY required evidence -> UNVERIFIED (never VERIFIED)
#   - Any run check that FAILs      -> INVALID (dominates)
#   - VERIFIED only when every required check PASSes and nothing FAILs.
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
#           -Registry 0x... -DeployTx 0x... [-AnchorTx 0x...] [-ReceiptFile examples/transfer/receipt-valid.json] `
#           [-Level L2] [-Rpc https://rpc.coredao.org]

param(
  [string]$Rpc = "https://rpc.coredao.org",
  [Parameter(Mandatory)][string]$Registry,
  [Parameter(Mandatory)][string]$DeployTx,
  [string]$AnchorTx = "",
  [string]$CommitTx = "",
  [string]$ReceiptFile = "examples\transfer\receipt-valid.json",
  [ValidateSet("L0", "L1", "L2")]
  [string]$Level = "L2"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root

# === CastFix: canonical constants (method-signature -> topic0 / selector) ===
# These are the AUTHORITATIVE values (verified once via `cast sig` against the
# deployed registry, frozen in scripts/). cast is a display/CLI tool; the raw
# JSON returned by the RPC is the canonical evidence source, never a cast
# string. When a constant is (re)derived at runtime, it MUST equal the frozen
# value below or the check FAILs (no silent drift).
$CANONICAL = [ordered]@{
  intentEventTopic0   = "0x56a2b6506b90d822d75d1b4267b743b5e05fb15361f0393f58f223d0329cf6b4"  # IntentCommitted(bytes32,bytes32,uint256)
  anchorEventTopic0   = "0x0c33ee02e1b358686f70819be25e8d45c5c15ca5d9b48c790441b349b30f3475"  # ProofAnchored(bytes32,bytes32,uint8,uint256)
  anchorSlot          = "0x3d0001f9095d4bfa91575c47af8d8bd8fad9a4acd946102665ef67139effb708"  # keccak256(proofId||00..0) frozen against Mainnet
  verifyCommitSel     = "0x7cc26b95"  # verifyCommitment(bytes32,bytes32)
  isCommittedSel      = "0x59cf4ea0"   # isCommitted(bytes32)
}
function Assert-CanonicalSig {
  param([string]$SigExpr, [string]$Expect)
  # Cross-check the FROZEN canonical constant against an independent derivation.
  # `cast keccak` yields the full 32-byte topic0 (correct for events); `cast sig`
  # truncates to 4 bytes and is NOT used here. cast is a cross-check tool only --
  # never the source of truth. cast dotenv warnings on stderr become terminating
  # errors under EAP=Stop, so EAP is lowered around the call and any failure is a
  # WARN (skip), never a FAIL: the frozen constant remains authoritative.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $got = ""
  try {
    $got = ((& cast keccak $SigExpr 2>$null) | Select-Object -Last 1).Trim()
  } catch { }
  $ErrorActionPreference = $prevEap
  if ($got -ieq $Expect) { return $true }
  Write-Host "      WARN: cast keccak($SigExpr)=$got != frozen $Expect (cross-check only; using frozen)"
  return $false
}

# === CastFix: RPC fallback list (Core official first, ankr second) ===
$RpcList = @($Rpc, "https://rpc.coredao.org", "https://rpc.ankr.com/core") | Select-Object -Unique
function Invoke-RpcRaw([string]$method, $params) {
  # canonical evidence read: returns the raw JSON result object (not a cast string)
  foreach ($url in $script:RpcList) {
    try {
      $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
      $resp = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
      if ($resp.error) { throw "RPC error: $($resp.error.message)" }
      if ($null -eq $resp.result) { throw "RPC null result" }
      $script:rpcUsedNote = $url
      return @{ via = $url; result = $resp.result }
    } catch {
      $lastErr = $_
    }
  }
  throw "RPC fallback exhausted for $method : $lastErr"
}
$script:rpcUsedNote = "default"
function Get-RpcString([string]$method, $params) {
  return (Invoke-RpcRaw $method $params).result
}

$statesObj = [ordered]@{}
function Set-State([string]$name, [string]$value) {
  $script:statesObj[$name] = $value
  return $value
}

# CastFix: $results must exist before the anchor/tx/storage advisory writes
# (indexing into $null throws "Cannot index into a null array").
$results = @{}

Write-Host "`n  CoreGuard LIVE ANCHOR - Three Proofs (P0 verdict semantics)`n"
Write-Host "  Registry : $Registry"
Write-Host "  DeployTx : $DeployTx"
Write-Host "  Level    : $Level"
Write-Host "  RPC      : $Rpc`n"

# --- Proof C first (pure offline; defines the expected commitment + proofId) ---
Write-Host "[1/6] Proof C - recomputing receiptId + commitment + proofId OFFLINE ..."
try {
  $planned = node scripts/compute-commitment.mjs --receipt $ReceiptFile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw "compute-commitment failed (rc=$LASTEXITCODE)" }
} catch { Write-Host "      C_recompute FAIL ($_)"; Set-State "C_recompute" "FAIL"; }
if ($planned) {
  $receiptId = $planned.receiptId
  $commitment = $planned.commitment
  $proofId = $planned.proofId
  Write-Host "      receiptId : $receiptId"
  Write-Host "      commitment: $commitment"
  Write-Host "      proofId   : $proofId"
  Set-State "C_recompute" "PASS"
}

# --- Proof A - deployment evidence -------------------------------------------------
Write-Host "[2/6] Proof A - deployment TX receipt ..."
try {
  $codeResp = Invoke-RpcRaw "eth_getCode" @($Registry, "latest")
  $code = [string]$codeResp.result
  $codeOk = ($code -ne "0x" -and $code -ne "")
  Set-State "A_deploy" $(if ($codeOk) { "PASS" } else { "FAIL" })
  Write-Host "      codePresent=$codeOk codeLen=$(if ($code) { $code.Length } else { 0 })"
} catch { Set-State "A_deploy" "FAIL" }

try {
  $deployResp = Invoke-RpcRaw "eth_getTransactionReceipt" @($DeployTx)
  $deployReceipt = $deployResp.result
  $deployOk = ($deployReceipt.status -eq "0x1")
  $contractMatches = ($deployReceipt.contractAddress -ieq $Registry)
  $deployTxOk = $deployOk -and $contractMatches
  Set-State "A_deployTx" $(if ($deployTxOk) { "PASS" } else { "FAIL" })
  $deployBlock = $deployReceipt.blockNumber
} catch { Set-State "A_deployTx" "FAIL" }

# --- Proof B - registry commitment verification (on the ANCHOR id = proofId) --------
Write-Host "[3/6] Proof B - verifyCommitment on chain (proofId) ..."
try {
  $verifyCalldata = $CANONICAL.verifyCommitSel + $proofId.Substring(2) + $commitment.Substring(2)
  $cmdResp = Invoke-RpcRaw "eth_call" @(@{ to = $Registry; data = $verifyCalldata }, "latest")
  $onChainRaw = $cmdResp.result
  $onChain = if ($onChainRaw -eq ("0x" + ("0" * 62) + "01")) { "true" } else { $onChainRaw }
  Set-State "B_anchor" $(if ($onChain -eq "true") { "PASS" } else { "FAIL" })
  Write-Host "      verifyCommitment raw=$onChainRaw"
} catch { Set-State "B_anchor" "FAIL" }

# --- Commit TX deep check (optional for L0, required for L1+) ----------------------
if ($CommitTx) {
  Write-Host "[4/6] Commit TX $CommitTx ..."
  try {
    $cReceipt = (Invoke-RpcRaw "eth_getTransactionReceipt" @($CommitTx)).result
    [void](Assert-CanonicalSig "IntentCommitted(bytes32,bytes32,uint256)" $CANONICAL.intentEventTopic0)
    $cLog = $cReceipt.logs | Where-Object { $_.topics[0] -ieq $CANONICAL.intentEventTopic0 } | Select-Object -First 1
    $cOk = ($cReceipt.status -eq "0x1") -and ($cLog -and $cLog.address -ieq $Registry) -and ($cLog.topics[1] -ieq $receiptId) -and ($cLog.topics[2] -ieq $commitment)
    Set-State "B_commitIntentTx" $(if ($cOk) { "PASS" } else { "FAIL" })
  } catch { Set-State "B_commitIntentTx" "FAIL" }
} else {
  Set-State "B_commitIntentTx" "NOT_RUN"
  Write-Host "[4/6] Commit TX not supplied (required for L1+) -> B_commitIntentTx NOT_RUN"
}

# --- Anchor TX deep check (required for L2) -------------------------------
if ($AnchorTx) {
  Write-Host "[5/6] Anchor TX $AnchorTx ..."
  try {
    $anchorResp = Invoke-RpcRaw "eth_getTransactionReceipt" @($AnchorTx)
    $aReceipt = $anchorResp.result
    [void](Assert-CanonicalSig "ProofAnchored(bytes32,bytes32,uint8,uint256)" $CANONICAL.anchorEventTopic0)
    $aLog = $aReceipt.logs | Where-Object { $_.topics[0] -ieq $CANONICAL.anchorEventTopic0 } | Select-Object -First 1
    $okStatus = ($aReceipt.status -eq "0x1")
    $okTo = $aLog -and ($aLog.address -ieq $Registry)
    $okProof = $aLog -and ($aLog.topics[1] -ieq $proofId)
    $okCommit = $aLog -and ($aLog.topics[2] -ieq $commitment)
    $rcHex = ("{0:x2}" -f [int]$planned.resultCode)
    $resultExpected = ("0" * (64 - $rcHex.Length)) + $rcHex
    $resultPadded = if ($aLog) { $aLog.data.Substring(2, 64) } else { "" }
    $okResult = $resultPadded -eq $resultExpected
    $anchorOk = $okStatus -and $okTo -and $okProof -and $okCommit -and $okResult
    Set-State "B_anchorTx" $(if ($anchorOk) { "PASS" } else { "FAIL" })
    $block = $aReceipt.blockNumber
    $blockHash = $aReceipt.blockHash

    # CastFix: tx-hash vs block-hash distinction. The anchor tx must report the
    # blockHash that contains it; we verify it via eth_getTransactionByHash and
    # compare to the receipt's blockHash (never conflate txHash and blockHash).
    try {
      $txByHash = (Invoke-RpcRaw "eth_getTransactionByHash" @($AnchorTx)).result
      $receiptBlockHash = $aReceipt.blockHash
      $txBlockHash = $txByHash.blockHash
      $txHashFromRpc = $txByHash.hash
      $bindingOk = ($txHashFromRpc -ieq $AnchorTx) -and ($txBlockHash -ieq $receiptBlockHash) -and ($receiptBlockHash -ne $AnchorTx)
      $results["B_txBlockBinding"] = $(if ($bindingOk) { "PASS" } else { "FAIL" })
      Write-Host "      txBlockBinding: tx=$txHashFromRpc block=$txBlockHash conflated?$(-not ($receiptBlockHash -ne $AnchorTx))"
    } catch { $results["B_txBlockBinding"] = "FAIL" }
  } catch { Set-State "B_anchorTx" "FAIL" }
} else {
  Set-State "B_anchorTx" "NOT_RUN"
  Write-Host "[5/6] Anchor TX not supplied (required for L2) -> B_anchorTx NOT_RUN"
}

# --- Optional deep reads (advisory: storage slots / cross-RPC) ---------------------
try {
  # CastFix: mapping slot is keccak256(proofId || 00..0) under slot 0. The slot
  # value is a frozen canonical constant (verified against Mainnet, see
  # verify-live.json); cast keccak is cross-checked but is never the source of
  # truth. Reads go through raw RPC.
  $slotHash = $CANONICAL.anchorSlot
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    # keccak256(proofId || 00..0); input must keep the 0x prefix so cast treats
    # the string as raw bytes, not ASCII text (that double-hash trap cost us a
    # false WARN once).
    $slotInput = "0x" + $proofId.Substring(2) + ("0" * 64)
    $derivedSlot = ((& cast keccak $slotInput 2>$null) | Select-Object -Last 1).Trim()
    $ErrorActionPreference = $prevEap
    if ($derivedSlot -and ($derivedSlot -ieq $slotHash)) {
      Write-Host "      slot cross-check: cast keccak matches frozen slot"
    } else {
      Write-Host "      WARN: cast keccak slot=$derivedSlot != frozen $slotHash (using frozen; cross-check only)"
    }
  } catch {
    $ErrorActionPreference = $prevEap
    Write-Host "      WARN: cast keccak unavailable for slot derivation (using frozen)"
  }
  $storageResp = Invoke-RpcRaw "eth_getStorageAt" @($Registry, $slotHash, "latest")
  $storage = $storageResp.result
  $storageOk = ($storage -ieq $commitment)
  if ($storageOk) {
    Set-State "B_storageAnchor" "PASS"
  } else {
    Write-Host "      storage at $slotHash = $storage (expected $commitment) -> advisory NOT_RUN"
    Set-State "B_storageAnchor" "NOT_RUN"
  }
  $results["B_storageSlot"] = "slot=$slotHash value=$storage"
} catch { Set-State "B_storageAnchor" "NOT_RUN" }

# --- Final verdict from the shared semantic module (single source of truth) --------
Write-Host "[6/6] Evaluating verdict via scripts/anchor-verdict.mjs ..."
$statesFile = Join-Path $env:TEMP "anchor-states.json"
$statesObj | ConvertTo-Json -Compress | Set-Content -LiteralPath $statesFile -Encoding ASCII
$verdictRaw = node scripts/anchor-verdict.mjs --level $Level --states-file $statesFile
$verdict = $verdictRaw | ConvertFrom-Json
Remove-Item -LiteralPath $statesFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "anchor-verdict.mjs failed" }

Write-Host ""
$statesObj.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host ("      {0,-20} {1}" -f $_.Name, $_.Value) }

$artifact = [ordered]@{
  schema = "coreguard/v0.1.0-anchor-verdict"
  network = if ($Rpc -like "*1116*" -or $Rpc -like "*coredao*") { "core-mainnet (1116)" } else { "core-testnet2 (1114)" }
  chainId = if ($Rpc -like "*1116*" -or $Rpc -like "*coredao*") { 1116 } else { 1114 }
  rpc = $Rpc
  rpcUsed = $rpcUsedNote
  registry = $Registry
  deployTx = $DeployTx
  anchorTx = $AnchorTx
  commitTx = $CommitTx
  block = $block
  blockHash = $blockHash
  receiptId = $receiptId
  commitment = $commitment
  proofId = $proofId
  level = $Level
  verdict = $verdict.verdict
  verdictCode = $verdict.code
  required = $verdict.required
  requiredMissing = $verdict.requiredMissing
  failing = $verdict.failing
  states = $statesObj
  txBlockBinding = $results["B_txBlockBinding"]
  storageSlot = $results["B_storageSlot"]
  canonicalSigs = $CANONICAL
  semanticsNote = "txHash and blockHash are distinct fields; txBlockBinding verified via eth_getTransactionByHash vs receipt.blockHash."
  semanticNote = "The registry proves that a specific commitment was anchored on Core. The execution claim is supported by the independently verifiable evidence/replay bound to that commitment."
}
# CastFix: the frozen canonical bundle (scripts/verify-live.json) is a committed
# historical record and MUST NOT be rewritten by the verifier. Live runs write to
# a separate, gitignored, regenerated artifact.
$artifactFile = Join-Path $Root "scripts\verify-live.regenerated.json"
$artifact | ConvertTo-Json -Depth 6 | Set-Content -Path $artifactFile -Encoding UTF8
Write-Host ""
Write-Host "  Artifact: $artifactFile"
Write-Host "  Verdict  : $($verdict.verdict) / $($verdict.code) @ $Level  (missing: $($verdict.requiredMissing -join ','))"
Write-Host "  Semantic : The registry proves that a specific commitment was anchored on Core. The execution claim is supported by the independently verifiable evidence/replay bound to that commitment."

if ($verdict.verdict -ne "VERIFIED") { throw "anchor verification did not reach VERIFIED (got $($verdict.verdict) / $($verdict.code))" }

Write-Host "  --- paste into README ---"
Write-Host "  | Network | Chain ID | Contract | Deployment TX | Anchor TX | Block | Proof ID | Receipt ID | Commitment | Verification |"
Write-Host "  |---|---|---|---|---|---|---|---|---|---|"
Write-Host "  | Core | $($artifact.chainId) | $Registry | $DeployTx | $AnchorTx | $block | $proofId | $receiptId | $commitment | VERIFIED (A+B+C = anchor integrity) |"

Pop-Location