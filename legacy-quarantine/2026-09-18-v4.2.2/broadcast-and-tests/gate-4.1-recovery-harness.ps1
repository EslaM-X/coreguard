# GATE 4.1 RECOVERY HARNESS -- offline mock tests of the recovery evidence path.
# ASCII-ONLY. NO network, NO cast, NO real transaction ever leaves this process.
# Uses the SAME lib functions the gate executes (scripts/mainnet/gate-4.1-recovery-lib.ps1) so the
# recovery logic under test is the production code, not a copy - and no evidence is ever written to
# the repo (all writes go to a temp dir that is removed on success).
#
# Exit 0 => all scenarios passed. Any failure throws with a message (non-zero exit).

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$libPath = Join-Path (Split-Path -Parent $here) "gate-4.1-recovery-lib.ps1"
if (-not (Test-Path -LiteralPath $libPath)) { throw "lib not found: $libPath" }
. $libPath

$work = Join-Path $env:TEMP ("cg41-harness-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
$passList = New-Object System.Collections.Generic.List[string]
$failList = New-Object System.Collections.Generic.List[string]

function Assert-True([bool]$cond, [string]$msg) {
  if ($cond) { $script:passList.Add($msg) } else { $script:failList.Add($msg) }
}

function FakeReadback([string]$signer, [string]$intentCommitment = "", [string]$validUntilHex = "0") {
  return [pscustomobject]@{
    intentCommitment = if ($intentCommitment) { "0x" + $intentCommitment } else { "0x0000000000000000000000000000000000000000000000000000000000000000" }
    proofCommitment  = "0x0000000000000000000000000000000000000000000000000000000000000000"
    receiptId        = "0x0000000000000000000000000000000000000000000000000000000000000000"
    validUntilHex    = $validUntilHex
    signer           = $signer
  }
}

function Invoke-RecoveryScenario {
  param(
    [string]$Name,
    [bool]$SendAttempted,
    [AllowNull()][string]$TxHash,
    [AllowNull()][string]$LastSendStdout,
    [AllowNull()][object]$Receipt,
    [AllowNull()][scriptblock]$ReadbackProvider
  )
  $recPath = Join-Path $script:work ("rec-" + $Name + ".json")
  if (-not $SendAttempted) {
    $threw = $false
    try { Write-RecoveryEvidenceRecord -RecPath $recPath -FailurePhase "send" -Reason "no-send" -TxHash $TxHash -SendAttempted $false -LastSendStdout $LastSendStdout -From "0xa" -To "0xb" -Nonce "7" -GasLimit "0" -GasPriceWei "0" -IntentId "0xid" -IntentCommitment "0xcm" -ValidUntil "0" -CalldataSha256 "" -ReadbackProvider $ReadbackProvider } catch { $threw = $true }
    Assert-True ($threw) "$Name : no-send must throw"
    Assert-True (-not (Test-Path -LiteralPath $recPath)) "$Name : no-send must write nothing"
    return
  }
  $rec = Write-RecoveryEvidenceRecord -RecPath $recPath -FailurePhase $Name -Reason "scenario-$Name" -TxHash $TxHash -SendAttempted $true -LastSendStdout $LastSendStdout -Receipt $Receipt -From "0x1111111111111111111111111111111111111111" -To "0x66268a47e81b8f657798d7b5bbedc956df7b13fd" -Nonce "8" -GasLimit "150000" -GasPriceWei "60000000000" -IntentId "0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d" -IntentCommitment "0xb82f1f8073286fdf5a598e69a17246fdea09d10a9958fbc52f9ee8f7f925cee6" -ValidUntil "1789695391" -CalldataSha256 "0xabc" -ReadbackProvider $ReadbackProvider
  Assert-True (Test-Path -LiteralPath $recPath) "$Name : evidence file written"
  $parsed = Get-Content -LiteralPath $recPath -Raw | ConvertFrom-Json
  $parsed  # return for caller assertions
}

# ---- S1) SEND ATTEMPT BUT cast output has NO parseable hash (tx reached chain, hash unknown) ----
$rec = Invoke-RecoveryScenario -Name "s1-parse-fail" -SendAttempted $true -TxHash $null -LastSendStdout "random garbage with no 64hex here" -ReadbackProvider $null
Assert-True ($rec.recoveryRequired -eq $true)         "S1: recoveryRequired=true"
Assert-True ($rec.automaticResend -eq $false)         "S1: automaticResend=false"
Assert-True ($rec.status -eq "BROADCAST-RECOVERY-REQUIRED") "S1: status"
Assert-True ($rec.txHashParsed -eq $false)            "S1: txHashParsed=false when hash absent"
Assert-True (-not $rec.txHash)                        "S1: txHash empty"
Assert-True ($rec.failurePhase -eq "s1-parse-fail")   "S1: failurePhase recorded"

# ---- S2) SEND OUTPUT CARRIES THE HASH REGARDLESS OF PARSE METHOD (JSON hash / JSON transactionHash / bare) ----
$t1 = '{"hash":"0x1111111111111111111111111111111111111111111111111111111111111111","status":"OK"}'
$t2 = '{"transactionHash":"0x2222222222222222222222222222222222222222222222222222222222222222"}'
$t3 = "Transaction: 0x3333333333333333333333333333333333333333333333333333333333333333 confirmed"
Assert-True ((ExtractTxHash $t1) -eq "0x1111111111111111111111111111111111111111111111111111111111111111") "S2a: JSON hash"
Assert-True ((ExtractTxHash $t2) -eq "0x2222222222222222222222222222222222222222222222222222222222222222") "S2b: JSON transactionHash"
Assert-True ((ExtractTxHash $t3) -eq "0x3333333333333333333333333333333333333333333333333333333333333333") "S2c: bare hex fallback"
Assert-True ($null -eq (ExtractTxHash "no meaningful output")) "S2d: unparseable -> null"

# ---- S3) RECEIPT STATUS 0x0 IS CAPTURED (tx mined but reverted e.g. race/AlreadyCommitted) ----
$rec = Invoke-RecoveryScenario -Name "s3-receipt-revert" -SendAttempted $true -TxHash "0x4444444444444444444444444444444444444444444444444444444444444444" -LastSendStdout "" -Receipt ([pscustomobject]@{ status = "0x0"; blockNumber = "0xabc" }) -ReadbackProvider { FakeReadback "0x0000000000000000000000000000000000000000" }
Assert-True ($rec.receiptStatus -eq "0x0") "S3: receiptStatus=0x0 captured"

# ---- S4) RACE: READBACK SHOWS THE INTENT NOW COMMITTED BY ANOTHER (winner recorded, never resend) ----
$rec = Invoke-RecoveryScenario -Name "s4-race-other-won" -SendAttempted $true -TxHash $null -LastSendStdout "" -Receipt $null -ReadbackProvider { FakeReadback "0x9999999999999999999999999999999999999999" "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899" "0x1234" }
Assert-True ($rec.onChainNowCommitted -eq $true) "S4: onChainNowCommitted=true"
Assert-True ($rec.onChainNowCommittedBy -eq "0x9999999999999999999999999999999999999999") "S4: winner recorded"

# ---- S5) CLEAN ABORT BEFORE ANY SEND WRITES NOTHING ----
$rec = Invoke-RecoveryScenario -Name "s5-no-send" -SendAttempted $false -TxHash $null -LastSendStdout "" -Receipt $null -ReadbackProvider $null

# ---- S6) RECOVERY RECORD HYGIENE: no key / signature / raw calldata material ----
$rec = Invoke-RecoveryScenario -Name "s6-hygiene" -SendAttempted $true -TxHash ("0x" + ("5" * 64)) -LastSendStdout "" -Receipt $null -ReadbackProvider { FakeReadback "0x1111111111111111111111111111111111111111" }
$json = $rec | ConvertTo-Json -Depth 6
Assert-True ($json -notmatch "private.?key") "S6: no private key"
Assert-True ($json -notmatch "passphrase|password") "S6: no passphrase"
Assert-True ($json -notmatch "0x[a-fA-F0-9]{130}") "S6: no 65-byte signature blob"

# ---- S7) rUNTIME CODE HASH VIEWS ARE DISTINCT AND CONSISTENT (text vs raw bytes) ----
$codeText = "0x6000600060006000"  # 6 bytes runtime sample
$textSha  = Get-HexTextSha256 $codeText
$bytesSha = Get-RawBytesSha256 $codeText
Assert-True ($textSha -eq (Get-HexTextSha256 "0x6000600060006000")) "S7a: text sha deterministic"
Assert-True ($bytesSha -eq (Get-RawBytesSha256 "6000600060006000")) "S7b: raw sha tolerant to 0x removal"
Assert-True ($textSha -ne $bytesSha) "S7c: text-sha != bytes-sha (views must not be confused)"

# ---- S8) EVIDENCE FROM THE SUCCESS PATH NEVER CONTAINS KEY/SIG/CALLDATA (schema check via lib record) ----
$rec = New-RecoveryRecord -FailurePhase "receipt" -Reason "test" -TxHash ("0x" + ("6" * 64)) -Receipt $null -From "0x1111111111111111111111111111111111111111" -To "0x66268a47e81b8f657798d7b5bbedc956df7b13fd" -Nonce "8" -GasLimit "150000" -GasPriceWei "60000000000" -IntentId "0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d" -IntentCommitment "0xb82f1f8073286fdf5a598e69a17246fdea09d10a9958fbc52f9ee8f7f925cee6" -ValidUntil "1789695391" -CalldataSha256 "0xdeadbeef" -Readback $null
Assert-True ($rec.gate -eq "4.1" -and $rec.status -eq "BROADCAST-RECOVERY-REQUIRED") "S8: schema gate/status"
Assert-True ($rec.intentId -eq "0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d") "S8: intentId preserved"
Assert-True ($rec.calldataSha256 -eq "0xdeadbeef") "S8: calldataSha256 (hash only, no raw calldata)"
Assert-True ($rec.recoveryRequired -eq $true -and $rec.automaticResend -eq $false) "S8: recovery required, no resend"

# ---- S9) PARSE-FAIL-AFTER-SEND STILL WRITES EVIDENCE END-TO-END (the key NO-GO concern) ----
$recPath = Join-Path $work "rec-s9-end-to-end.json"
$rr = New-RecoveryRecord -FailurePhase "send" -Reason "could not parse txHash from cast send output" -TxHash $null -Receipt $null -From "0x1111111111111111111111111111111111111111" -To "0x66268a47e81b8f657798d7b5bbedc956df7b13fd" -Nonce "8" -GasLimit "150000" -GasPriceWei "60000000000" -IntentId "0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d" -IntentCommitment "0xb82f1f8073286fdf5a598e69a17246fdea09d10a9958fbc52f9ee8f7f925cee6" -ValidUntil "1789695391" -CalldataSha256 "" -Readback $null
$null = Write-RecoveryEvidence -RecPath $recPath -Record $rr
Assert-True (Test-Path -LiteralPath $recPath) "S9: evidence written despite unparseable hash"
$s9 = (Get-Content -LiteralPath $recPath -Raw | ConvertFrom-Json)
Assert-True ($s9.txHashParsed -eq $false) "S9: txHashParsed=false"
Assert-True ($s9.status -eq "BROADCAST-RECOVERY-REQUIRED") "S9: recovery required"

# ---- S10) DEPLOYED ABI FINGERPRINT (C4 closure): selectors as PUSH4, topic0 as PUSH32 ----
$selA = "4fd0505d"; $selB = "46f2d74b"; $selC = "9291d3a5"
$topic = "21185740565de73255b4ef838318b711254ec3031e2f21af71bbcf7bef3f8127"
$snippet = "63" + $selA + "63" + $selB + "7f" + $topic + "00" + "63" + $selC + "00" + "6300000001"
$fpSet = Get-DeployedSelectors ("0x" + $snippet)
Assert-True ($fpSet.Count -eq 4) "S10a: PUSH4 set parsed (3 real + 1 dummy)"
Assert-True ($fpSet.Contains("0x" + $selA) -and $fpSet.Contains("0x4fd0505d")) "S10b: commitIntent selector present"
Assert-True ($fpSet.Contains("0x46f2d74b")) "S10c: commitIntentDigest selector present"
Assert-True ($fpSet.Contains("0x9291d3a5")) "S10d: intentCommits selector present"
$null = Assert-DeployedAbiFingerprint -HexCode ("0x" + $snippet) -ExpectedSelectors @("0x4fd0505d","0x46f2d74b","0x9291d3a5") -ExpectedTopic0 ("0x" + $topic)
Assert-True ($true) "S10e: fingerprint passes when all present"
$missingThrew = $false
try { $null = Assert-DeployedAbiFingerprint -HexCode ("0x" + $snippet) -ExpectedSelectors @("0x4fd0505d","0xdeadbeef") -ExpectedTopic0 ("0x" + $topic) } catch { $missingThrew = $true }
Assert-True ($missingThrew) "S10f: fingerprint throws on missing selector"

# ---- S11) HARNESS OUTPUT PRESERVED FOR REPRODUCTION ----
$resultFile = Join-Path $env:TEMP ("cg41-harness-result-" + [guid]::NewGuid() + ".txt")
$report = "GATE 4.1 RECOVERY HARNESS - " + (Get-Date).ToUniversalTime().ToString("o") + "`r`n"
$report += "passed=" + $passList.Count + " failed=" + $failList.Count + "`r`n"
$report += (($passList | ForEach-Object { "ok  " + $_ }) -join "`r`n") + "`r`n"
[IO.File]::WriteAllText($resultFile, $report, (New-Object Text.UTF8Encoding($false)))
Assert-True (Test-Path -LiteralPath $resultFile) "S11: results artifact written"

# ---- REPORT ----
if ($failList.Count -gt 0) {
  Write-Host ("RECOVERY HARNESS FAIL: " + $failList.Count + " failed")
  $failList | ForEach-Object { Write-Host ("  FAIL " + $_) }
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host ("RECOVERY HARNESS PASS: " + $passList.Count + " assertions")
$passList | ForEach-Object { Write-Host ("  ok " + $_) }
Write-Host ("results artifact: " + $resultFile + " (sha256 0x" + ((Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash).ToLowerInvariant() + ")")
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
exit 0