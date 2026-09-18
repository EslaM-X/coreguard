# GATE 4.1 -- recovery-lib. Shared single-source helpers for the broadcast gate recovery path.
# ASCII-ONLY. NO network, NO cast, NO key material. Dot-sourced by BOTH the gate
# (scripts/mainnet/gate-4.1-broadcast.ps1) and the offline mock harness
# (scripts/mainnet/tests/gate-4.1-recovery-harness.ps1) so the recovery evidence logic is tested
# against the SAME code the gate executes, without ever sending a real transaction.
#
# Contract
#   - Write-RecoveryEvidence ALWAYS writes a recovery record even when $TxHash cannot be parsed
#     (txHashParsed=$false) as long as the caller indicates a send WAS attempted.
#   - The record NEVER contains a private key, a passphrase, a signature, or raw calldata.
#   - automaticResend is ALWAYS $false.

function New-RecoveryRecord {
  param(
    [Parameter(Mandatory = $true)][string]$FailurePhase,
    [Parameter(Mandatory = $true)][string]$Reason,
    [AllowNull()][string]$TxHash,
    [AllowNull()][object]$Receipt,
    [string]$From, [string]$To, [string]$Nonce,
    [string]$GasLimit, [string]$GasPriceWei,
    [string]$IntentId, [string]$IntentCommitment, [string]$ValidUntil,
    [string]$CalldataSha256,
    [AllowNull()][string]$Winner,
    [AllowNull()][object]$Readback
  )
  $onChainCommitted = $false
  $onChainCommitment = ""
  $onChainValidUntil = ""
  if ($Readback) {
    try {
      if (([string]$Readback.signer) -and ([string]$Readback.signer) -ne "0x0000000000000000000000000000000000000000") {
        $onChainCommitted = $true
        $onChainCommitment = [string]$Readback.intentCommitment
        $onChainValidUntil = [string]$Readback.validUntilHex
      }
    } catch { }
  }
  $rec = [ordered]@{
    gate = "4.1"; phase = "commit-intent-broadcast"; status = "BROADCAST-RECOVERY-REQUIRED"
    recoveryRequired = $true; automaticResend = $false
    failurePhase = $FailurePhase
    reason = $Reason
    txHash = $TxHash; txHashParsed = -not [string]::IsNullOrEmpty($TxHash)
    from = $From; to = $To; nonce = $Nonce
    gasLimit = $GasLimit; gasPriceWei = $GasPriceWei
    intentId = $IntentId; intentCommitment = $IntentCommitment; validUntil = $ValidUntil
    calldataSha256 = $CalldataSha256
    receiptStatus = if ($Receipt) { $Receipt.status } else { $null }
    receiptBlockNumber = if ($Receipt) { $Receipt.blockNumber } else { $null }
    onChainNowCommitted = $onChainCommitted
    onChainNowCommittedBy = if ($onChainCommitted) { $Winner } else { "" }
    onChainNowCommitment = $onChainCommitment
    onChainNowValidUntil = $onChainValidUntil
    date = (Get-Date).ToUniversalTime().ToString("o")
    note = "A send was attempted and a transaction MAY have reached the chain even if txHash could not be parsed. recoveryRequired=true; manual review mandatory; this gate NEVER resends."
  }
  return $rec
}

function Write-RecoveryEvidence {
  param(
    [Parameter(Mandatory = $true)][string]$RecPath,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Record
  )
  $json = $Record | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($RecPath, $json, (New-Object Text.UTF8Encoding($false)))
  return $RecPath
}

# The single recovery ORCHESTRATION used by the gate's catch handler AND the offline harness:
#   - $SendAttempted=$false  => clean pre-send abort: a hard throw, NOTHING is written.
#   - $SendAttempted=$true   => a send WAS attempted; the record is written ALWAYS - even if $TxHash
#     is null and cast output cannot be parsed (txHashParsed=$false; the tx may still be on-chain).
#   - optional $ReadbackProvider (scriptblock returning the intentCommits readback) captures who
#     committed the intent on-chain (race/AlreadyCommitted revert) for the recovery record.
# Never sends anything; automaticResend is always false.
function Write-RecoveryEvidenceRecord {
  param(
    [Parameter(Mandatory = $true)][string]$RecPath,
    [Parameter(Mandatory = $true)][string]$FailurePhase,
    [Parameter(Mandatory = $true)][string]$Reason,
    [Parameter(Mandatory = $false)][bool]$SendAttempted,
    [AllowNull()][string]$TxHash,
    [AllowNull()][string]$LastSendStdout,
    [AllowNull()][object]$Receipt,
    [string]$From, [string]$To, [string]$Nonce,
    [string]$GasLimit, [string]$GasPriceWei,
    [string]$IntentId, [string]$IntentCommitment, [string]$ValidUntil,
    [AllowNull()][string]$CalldataSha256,
    [AllowNull()][scriptblock]$ReadbackProvider
  )
  if (-not $SendAttempted) { throw "[CLEAN-ABORT] no send attempted - no transaction reached the chain; nothing written" }
  $readback = $null
  $winner = ""
  if ($ReadbackProvider) {
    try { $readback = & $ReadbackProvider } catch { }
    if ($readback -and $readback.signer) { $winner = [string]$readback.signer }
  }
  if (-not $TxHash -and $LastSendStdout) { $TxHash = ExtractTxHash $LastSendStdout }
  $rec = New-RecoveryRecord -FailurePhase $FailurePhase -Reason $Reason -TxHash $TxHash -Receipt $Receipt `
         -From $From -To $To -Nonce $Nonce -GasLimit $GasLimit -GasPriceWei $GasPriceWei `
         -IntentId $IntentId -IntentCommitment $IntentCommitment -ValidUntil $ValidUntil `
         -CalldataSha256 $CalldataSha256 -Winner $winner -Readback $readback
  Write-RecoveryEvidence -RecPath $RecPath -Record $rec
  return $rec
}

# sha256 over the UTF-8 bytes of a hex TEXT string (0x-prefixed). Deterministic view "A".
function Get-HexTextSha256([string]$hexText) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $b = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($hexText))
  return "0x" + (($b | ForEach-Object { $_.ToString("x2") }) -join "")
}

# sha256 over the RAW decoded BYTES of a hex string (0x stripped). Deterministic view "B".
function Get-RawBytesSha256([string]$hexText) {
  $t = $hexText.Trim()
  if ($t.StartsWith("0x") -or $t.StartsWith("0X")) { $t = $t.Substring(2) }
  if ($t.Length % 2 -ne 0) { throw "[ABORT] odd hex length: $t" }
  $raw = New-Object 'System.Byte[]' ($t.Length / 2)
  for ($i = 0; $i -lt $raw.Length; $i++) { $raw[$i] = [Convert]::ToByte($t.Substring($i * 2, 2), 16) }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $b = $sha.ComputeHash($raw)
  return "0x" + (($b | ForEach-Object { $_.ToString("x2") }) -join "")
}

# extraction of a tx hash from cast output. JSON (hash / transactionHash) then a bare 0x..64 pattern.
function ExtractTxHash([string]$text) {
  if (-not $text) { return $null }
  try {
    $j = $text | ConvertFrom-Json
    if ($j.hash) { return ([string]$j.hash).Trim() }
    if ($j.transactionHash) { return ([string]$j.transactionHash).Trim() }
  } catch { }
  $m = [regex]::Match($text, "0x[0-9a-fA-F]{64}")
  if ($m.Success) { return $m.Value }
  return $null
}

# ---- C4 closure (deployed ABI fingerprint) ----
# Pure, offline scan of DEPLOYED runtime bytecode (eth_getCode hex text). Proves the deployed code
# actually contains the expected ABI surface: function selectors as PUSH4 (0x63) immediates and the
# event topic0 as a PUSH32 (0x7f) immediate. This closes the residual "bytecode hash is not enough":
# we now additionally assert the dispatcher/event material of the ON-CHAIN code matches the pinned
# ABI, not merely that some hash of the code is stable.

# Extract the set of 4-byte function selectors embedded as PUSH4 (0x63) immediates.
function Get-DeployedSelectors([string]$hexCode) {
  $t = $hexCode.Trim()
  if ($t.StartsWith("0x") -or $t.StartsWith("0X")) { $t = $t.Substring(2) }
  if ($t.Length % 2 -ne 0) { throw "[ABORT] odd hex length in bytecode parse: $($t.Length)" }
  $set = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  for ($i = 0; ($i + 10) -le $t.Length; $i += 2) {
    if ($t.Substring($i, 2) -ceq "63") {
      $null = $set.Add("0x" + $t.Substring($i + 2, 8))
    }
  }
  return $set
}

# Assert the deployed runtime bytecode fingerprints match the expected ABI surface. Throws on any
# missing selector or a missing event topic0.
function Assert-DeployedAbiFingerprint {
  param(
    [Parameter(Mandatory = $true)][string]$HexCode,
    [Parameter(Mandatory = $true)][string[]]$ExpectedSelectors,
    [Parameter(Mandatory = $true)][string]$ExpectedTopic0
  )
  $set = Get-DeployedSelectors $HexCode
  $missing = @()
  foreach ($s in $ExpectedSelectors) {
    if (-not $set.Contains($s)) { $missing += $s }
  }
  $normTopic = $ExpectedTopic0
  if ($normTopic.StartsWith("0x") -or $normTopic.StartsWith("0X")) { $normTopic = $normTopic.Substring(2) }
  $normTopic = $normTopic.ToLowerInvariant()
  $t = $HexCode.Trim()
  if ($t.StartsWith("0x") -or $t.StartsWith("0X")) { $t = $t.Substring(2) }
  $topicFound = $t.Contains("7f" + $normTopic)
  if ($missing.Count -gt 0 -or -not $topicFound) {
    throw "[ABORT] deployed ABI fingerprint mismatch: missingSelectors=$($missing -join '|') topic0AsPush32=$topicFound"
  }
  return $true
}