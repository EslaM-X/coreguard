# ============================================================================
# CORE GUARD IDENTITY ANCHOR V1 - GATE 4.1 CLOSURE KIT  (v3)
# C9 (keystore security) + C7 (signed non-broadcast simulation) - OWNER RUN
# ----------------------------------------------------------------------------
# PURPOSE ........ Execute every remaining C9 + C7 check on the OWNER machine
#                  (the machine holding the keystore + password file).
# ALWAYS-REPORT .. The final report is ALWAYS written. A failed check NEVER
#                  aborts before the report: result is RECORDED, remaining
#                  safe (non-broadcast) checks still run, the summary JSON +
#                  raw TAP (v13) file are written, then the process exits with
#                  a NON-ZERO code if any check failed. throw is reserved for
#                  states that would prevent producing a report at all.
# FAIL-CLOSED .... Every assertion must PASS for a clean exit. Any FAIL sets
#                  the final status to FAILED (never a hard-coded PASS).
# SECURITY ....... NEVER outputs a private key, a passphrase, a keystore
#                  payload, or a signature. NEVER calls `cast send`. NEVER
#                  uses eth_sendRawTransaction. Signature production uses
#                  --account + --password-file only. The signature and the
#                  signed calldata are used solely inside eth_call /
#                  eth_estimateGas and are NEVER persisted.
# V3 CHANGES (address independent-review round 2):
#  [P1] Check() no longer throws: it records PASS/FAIL, keeps the failed
#       flag, and the run CONTINUES; the report is written unconditionally
#       at the end and the exit code reflects the matrix. Only truly
#       report-blocking states throw (caught by a top-level handler that
#       still writes the report).
#  [P2] C9h now matches its comment: it asserts the expected account exists,
#       the account name does not appear as a value in the summary, no
#       unexpected account value is used, and the derived signer equals the
#       expected signer. A dedicated negative test proves a wrong account
#       yields FAILED.
#  [P3] -CastPath is bound to a PRE-APPROVED SHA-256: passing -ExpectedCastSha256
#       is required for a clean run; the computed SHA is COMPARED to the
#       expected value BEFORE cast is ever invoked (mismatch => recorded
#       FAIL, cast disabled, report still written). Paths are canonicalized
#       (GetFullPath + root boundary) so no ../ or sibling trick escapes the
#       trust roots.
#  [P4] ACL verified with real ACE/SID inspection: inheritance disabled,
#       allow-list of {current user, file owner, SYSTEM, Administrators},
#       file OWNER independently verified to be the current user, and the
#       current user must hold Modify/FullControl (no lock-out). Violating
#       ACLs (foreign SID, inherited ACE) are proven to FAIL via -SelfTest.
#  [P5] Signature handling tightened: owner-only, isolated-run guidance, no
#       signature/calldata ever written; intentId/intentCommitment are read
#       from gate-4.1 evidence and cross-checked with gate-4.0 (never
#       guessed) and are REDACTED from the summary unless -KeepEvidenceDetails
#       is explicitly approved; -AllowedRpcHosts must contain the RPC host or
#       RPC is disabled and the run records FAIL.
#  [S1] -SelfTest runs the mandatory NEGATIVE battery (raw TAP v13) proving:
#       cast-SHA mismatch => FAIL, wrong account => FAIL, foreign-SID ACL =>
#       FAIL, inherited ACL => FAIL, secret-in-summary => FAIL, bad validity
#       window => FAIL, out-of-root path => FAIL, untrusted RPC => FAIL.
#  [S2] Manifest unchanged is recomputed as a real check (8 pinned files
#       read from disk and compared to the manifest) and folded into report.
# OUTPUT ......... Non-sensitive console lines + cg41-c9c7-summary.json and
#                  cg41-c9c7-results.tap next to THIS script (no secrets).
# USAGE .......... powershell -NoProfile -ExecutionPolicy Bypass -File `
#                  "<this script>" -Account coreguard-anchor `
#                  -PasswordFile <path> -ExpectedCastSha256 <pre-approved> `
#                  [-CastPath C:\...\cast.exe] [-AllowedRpcHosts rpc.coredao.org] `
#                  [-KeepEvidenceDetails] [-ValiditySeconds 3600] [-Rpc https://...]
# CONTROLS ....... -SelfTest = negative-test battery (no cast/keystore/network);
#                  -ReviewerChecklist = print the C8 checklist only.
# ============================================================================
[CmdletBinding()]
param(
    [string]$Account           = "coreguard-anchor",
    [string]$PasswordFile      = "",
    [string]$Repo              = "D:\KOSSASHI\CORE DAO\coreguard",
    [string]$Rpc               = "https://rpc.coredao.org",
    [string]$ExpectedSigner    = "0xEa41BecDeb612d8625bF3060809964F1DAB43244",
    [string]$CastPath          = "",
    [string]$ExpectedCastSha256= "",
    [string]$AllowedRpcHosts   = "",
    [int]$ValiditySeconds      = 3600,
    [switch]$KeepEvidenceDetails,
    [switch]$SelfTest,
    [switch]$ReviewerChecklist
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$KitVersion = "3.0"
$script:Failed = $false
$script:CheckResults = [ordered]@{}
$script:Order = New-Object System.Collections.Generic.List[string]
$script:CastOk = $false
$script:RpcOk = $false

$REG           = "0x66268a47e81b8f657798d7b5bbedc956df7b13fd"
$SEL_COMMIT    = "0x4fd0505d"
$CODE_EXP      = 3128
$CHAIN_EXP     = 1116
$ALLOWED_RPC   = @("eth_chainId","eth_getCode","eth_getTransactionCount","eth_getBalance","eth_call","eth_estimateGas","eth_gasPrice","eth_blockNumber","eth_getTransactionReceipt","eth_getTransactionByHash","eth_getLogs")
$EXPECTED_ACCOUNT = "coreguard-anchor"

function Get-Sha256Hex([string]$p) {
    $s = [System.Security.Cryptography.SHA256]::Create()
    try { $h = $s.ComputeHash([IO.File]::ReadAllBytes($p)) } finally { $s.Dispose() }
    return ("0x" + (($h | ForEach-Object { $_.ToString('x2') }) -join ''))
}

function Check([string]$name, [bool]$ok, [string]$detail = "") {
    # P1: RECORD-ONLY. Never throws. The report is written by the caller no
    # matter how many checks fail.
    $script:CheckResults[$name] = if ($ok) { "PASS" } else { "FAIL" }
    $script:Order.Add($name)
    if (-not $ok) { $script:Failed = $true }
    "[{0}] {1}{2}" -f ($(if ($ok) { "PASS" } else { "FAIL" }), $name, $(if ($detail) { " :: $detail" } else { "" }))
}

function Test-Account([string]$running, [string]$expected) {
    if ([string]::IsNullOrWhiteSpace($running)) { return $false }
    return ($running -eq $expected)
}

function Test-CastHash([string]$computed, [string]$expected) {
    if ([string]::IsNullOrWhiteSpace($expected)) { return $false }
    return ([string]::Compare($computed, $expected, [System.StringComparison]::OrdinalIgnoreCase) -eq 0)
}

function Test-ValidityWindow([int]$seconds) {
    # P5: a sane window is strictly positive and bounded (max 24h).
    if ($seconds -le 0) { return $false }
    if ($seconds -gt 86400) { return $false }
    return $true
}

function CanonicalPath([string]$path) {
    # returns a canonical absolute path, or "" on failure
    try {
        $full = [IO.Path]::GetFullPath([IO.Path]::Combine((Get-Location).Path, $path))
        return $full
    } catch { return "" }
}

function Test-TrustedRoot([string]$canonical, [string[]]$roots) {
    # boundary check: canonical must equal a root or be an immediate child.
    if ([string]::IsNullOrWhiteSpace($canonical)) { return $false }
    foreach ($r in $roots) {
        $rb = $r.TrimEnd('\')
        $cb = $canonical.TrimEnd('\')
        if ($cb -eq $rb) { return $true }
        if ($cb.StartsWith($rb + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Get-TrustRoots() {
    $roots = @{}
    $roots["user_foundry"] = CanonicalPath (Join-Path $env:USERPROFILE ".foundry")
    $i = 0
    foreach ($pf in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($pf) {
            $i++
            $roots["pf$i"] = CanonicalPath $pf
        }
    }
    return ($roots.Values | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
}

function Test-FileAcl([string]$file, [ref]$diagnostics) {
    # P4: real ACE/SID inspection. True only if ACL compliant.
    $acl = Get-Acl -LiteralPath $file
    $ownerSid = ""; try { $ownerSid = ([System.Security.Principal.NTAccount]$acl.Owner).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $ownerSid = "" }
    $curSid = ""; try { $curSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value } catch { $curSid = "" }
    $allowed = @($curSid, $ownerSid, "S-1-5-18", "S-1-5-32-544")
    $foreign = New-Object System.Collections.Generic.List[string]
    $inheritedFound = $false
    $curHasWrite = $false
    foreach ($ace in $acl.Access) {
        if ($ace.IsInherited) { $inheritedFound = $true; continue }
        if ($ace.AccessControlType -ne "Allow") { continue }
        $s = ""; try { $s = $ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $s = $ace.IdentityReference.Value }
        if ($allowed -notcontains $s) { $foreign.Add($s) }
        if ($s -eq $curSid) {
            $r = [System.Security.AccessControl.FileSystemRights]$ace.FileSystemRights
            if (($r -band ([System.Security.AccessControl.FileSystemRights]::Modify -bor [System.Security.AccessControl.FileSystemRights]::FullControl)) -ne 0) { $curHasWrite = $true }
        }
    }
    $ownerIsCur = ($ownerSid -eq $curSid)
    $ok = (-not $inheritedFound) -and $acl.AreAccessRulesProtected -and ($foreign.Count -eq 0) -and $ownerIsCur -and $curHasWrite
    $diag = New-Object System.Collections.Generic.List[string]
    if ($inheritedFound) { $diag.Add("inherited ACE present") }
    if (-not $acl.AreAccessRulesProtected) { $diag.Add("inheritance protection not set") }
    if ($foreign.Count -gt 0) { $diag.Add("foreign SIDs: " + ($foreign -join ",")) }
    if (-not $ownerIsCur) { $diag.Add("owner is not current user") }
    if (-not $curHasWrite) { $diag.Add("current user lacks Modify/FullControl") }
    $diagnostics.Value = ($diag -join "; ")
    return $ok
}

function Test-SummaryClean([string]$json, [string]$sig, [string]$pwContent, [string]$account) {
    # P2/P5: returns TRUE only if the summary leaks none of the secret
    # materials nor the account value. Used by production audit AND SelfTest.
    $forbiddenNames = '"signature"|"passphrase"|"privateKey"'
    if ($json -match $forbiddenNames) { return $false }
    if ($sig -and $json.Contains($sig)) { return $false }
    if ($pwContent -and $json.Contains($pwContent)) { return $false }
    if ($account -and $json.Contains($account)) { return $false }
    return $true
}

function InvokeCast([string[]]$argList) {
    # P3: cast is disabled the moment pinning failed.
    if (-not $script:CastOk) { throw "[FAIL-CLOSED] cast disabled: executable pinning did not pass" }
    if ($argList[0] -eq "send") { throw "[FAIL-CLOSED] cast 'send' is forbidden in the closure kit" }
    if (($argList -join " ") -match "--private-key") { throw "[FAIL-CLOSED] --private-key is forbidden in the closure kit" }
    $so = Join-Path $env:TEMP ("cg41kit-o-" + [guid]::NewGuid() + ".txt")
    $se = Join-Path $env:TEMP ("cg41kit-e-" + [guid]::NewGuid() + ".txt")
    $p = Start-Process -FilePath $script:CastPath -ArgumentList $argList -WorkingDirectory $Repo -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $so -RedirectStandardError $se
    $o = ""; if (Test-Path $so) { $o = Get-Content $so -Raw -ErrorAction SilentlyContinue }
    $e = ""; if (Test-Path $se) { $e = Get-Content $se -Raw -ErrorAction SilentlyContinue }
    Remove-Item $so, $se -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $e" }
    return $o.Trim()
}

function RpcP($method, $params) {
    if (-not $script:RpcOk) { throw "[FAIL-CLOSED] RPC disabled: host not in -AllowedRpcHosts" }
    if ($ALLOWED_RPC -notcontains $method) { throw "[FAIL-CLOSED] RPC method not allowed: $method" }
    $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
    $res = Invoke-RestMethod -Uri $Rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
    if ($res.error) { throw "RPC error: $($res.error.message)" }
    return $res.result
}

function EnvVal([string]$name) {
    $envFile = Join-Path $Repo ".env"
    if (-not (Test-Path -LiteralPath $envFile)) { return "" }
    $lines = Get-Content -LiteralPath $envFile
    $hit = $lines | Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
    if (-not $hit) { return "" }
    return (($hit -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Build-Evidence([hashtable]$extra) {
    # Collects current state into an ordered, human-readable summary.
    $status = if ($script:Failed) { "FAILED - one or more checks failed" } else { "C9-PASS C7-PASS NO-BROADCAST" }
    $ev = [ordered]@{
        gate = "4.1"; phase = "c9-c7-closure-kit"; kitVersion = $KitVersion
        status = $status
        date = (Get-Date).ToUniversalTime().ToString("o")
        kitPath = $PSCommandPath
        kitSha256 = Get-Sha256Hex $PSCommandPath
        castPath = $script:CastResolved
        castSha256 = $script:CastComputed
        expectedCastSha256 = $ExpectedCastSha256
        rpc = $Rpc; allowedRpcHosts = $AllowedRpcHosts; validitySeconds = $ValiditySeconds
        signer = $script:SignerDerived
        diagnostics = $script:Diag
        note = @(
            "C3 - NO cast send. NO eth_sendRawTransaction."
            "C4 - signature/calldata used ONLY inside eth_call/eth_estimateGas; NEVER persisted to disk or logs."
            "C5 - C8 is NOT claimed by this kit; an independent reviewer must sign off from the actual files."
            "P5 - signed payload goes to $($Rpc) as jsonrpc eth_call data (non-broadcast). This is inherent to a"
            "     signed simulation and same as the frozen broadcast gate's review-only mode. Valid window is"
            "     bounded by -ValiditySeconds; point -Rpc at a private endpoint if this consideration applies."
        ) -join "`n"
    }
    if ($KeepEvidenceDetails) {
        $ev.intentId = $script:IntentId
        $ev.intentCommitment = $script:IntentCommitment
        $ev.digest = $script:Digest
        $ev.nonce = $script:Nonce
        $ev.validUntil = $script:ValidUntil
        $ev.calldataLenHex = $script:CalldataLenHex
        $ev.gasEstimateWei = $script:GasEstimate
    } else {
        $ev.intentId = "REDACTED"; $ev.intentCommitment = "REDACTED"; $ev.digest = "REDACTED"
        $ev.nonce = "REDACTED"; $ev.validUntil = "REDACTED"; $ev.calldataLenHex = "REDACTED"; $ev.gasEstimateWei = "REDACTED"
    }
    if ($extra) { foreach ($k in $extra.Keys) { $ev[$k] = $extra[$k] } }
    return ($ev | ConvertTo-Json -Depth 4)
}

function Save-Evidence([string]$json, [string]$tapPath) {
    $dir = Split-Path -Parent $PSCommandPath
    $summaryPath = Join-Path $dir "cg41-c9c7-summary.json"
    [IO.File]::WriteAllText($summaryPath, $json, (New-Object Text.UTF8Encoding($false)))
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("TAP version 13")
    [void]$sb.AppendLine("1.." + $script:Order.Count)
    $i = 0
    foreach ($n in $script:Order) {
        $i++
        $r = $script:CheckResults[$n]
        $line = if ($r -eq "PASS") { "ok $i - $n" } else { "not ok $i - $n" }
        [void]$sb.AppendLine($line)
    }
    [IO.File]::WriteAllText($tapPath, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
    return $summaryPath
}

# ============================================================================
# SELF-TEST: mandatory NEGATIVE battery (no cast, no keystore, no network)
# ============================================================================
if ($SelfTest) {
    $script:Order.Clear(); $script:CheckResults.Clear(); $script:Failed = $false
    "== SELF-TEST (negative battery) =="
    # 1) cast SHA mismatch / missing pre-approval must be detected
    Check "N1-cast-sha-mismatch-detected" (-not (Test-CastHash "0xaaa" "0xbbb")) "mismatch rejected"
    Check "N1b-cast-sha-expected-required" (-not (Test-CastHash "0xaaa" "")) "blank expected rejected"
    Check "N1c-cast-sha-pinned-match" (Test-CastHash "0xAAA" "0xaaa") "case-insensitive match accepted"
    # 2) wrong / empty account must be detected; correct account accepted
    Check "N2-wrong-account-detected" (-not (Test-Account "evil-account" $EXPECTED_ACCOUNT)) "wrong account rejected"
    Check "N2b-empty-account-detected" (-not (Test-Account "" $EXPECTED_ACCOUNT)) "empty account rejected"
    Check "N2c-correct-account-accepted" (Test-Account $EXPECTED_ACCOUNT $EXPECTED_ACCOUNT) "correct account accepted"
    # 3) trust-root boundary: parent/sibling escape rejected; child accepted
    $tmpRoot = New-Item -Path (Join-Path $env:TEMP ("cg41-root-" + [guid]::NewGuid())) -ItemType Directory
    try {
        $escape = CanonicalPath (Join-Path $tmpRoot.FullName "..\other.exe")
        $inside = CanonicalPath (Join-Path $tmpRoot.FullName "bin\cast.exe")
        $roots = @($tmpRoot.FullName)
        Check "N3-out-of-root-path-detected" (-not (Test-TrustedRoot $escape $roots)) "parent traversal rejected"
        Check "N3b-in-root-path-accepted" (Test-TrustedRoot $inside $roots) "child of root accepted"
    } finally {
        Remove-Item -LiteralPath $tmpRoot.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    # 4) invalid validity window must be rejected (predicate tested both ways)
    Check "N4-zero-window-rejected" (-not (Test-ValidityWindow 0)) "0 seconds rejected"
    Check "N4b-huge-window-rejected" (-not (Test-ValidityWindow 86401)) ">86400 rejected"
    Check "N4c-sane-window-accepted" (Test-ValidityWindow 3600) "3600 accepted"
    # 5) ACL: foreign SID / inherited ACE must FAIL; clean ACL must PASS
    $tmpDir = New-Item -Path (Join-Path $env:TEMP ("cg41-acl-" + [guid]::NewGuid())) -ItemType Directory
    try {
        $world = New-Object System.Security.Principal.SecurityIdentifier([System.Security.Principal.WellKnownSidType]::WorldSid, $null)
        # 5a) world-readable explicit ACE => foreign SID
        $f1 = Join-Path $tmpDir.FullName "pw1.txt"; Set-Content -LiteralPath $f1 "x" -Encoding ASCII
        $acl1 = Get-Acl -LiteralPath $f1; $acl1.SetAccessRuleProtection($true, $false)
        $acl1.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($world, [System.Security.AccessControl.FileSystemRights]::Read, [System.Security.AccessControl.AccessControlType]::Allow)))
        Set-Acl -LiteralPath $f1 $acl1
        $d1 = ""; $r1 = Test-FileAcl $f1 ([ref]$d1)
        Check "N5-foreign-sid-acl-fails" (-not $r1) "world-readable rejected ($d1)"
        # 5b) folder inheritance ON => child file inherits => FAIL
        $dAcl = Get-Acl -LiteralPath $tmpDir.FullName; $dAcl.SetAccessRuleProtection($false, $false)
        $dAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($world, [System.Security.AccessControl.FileSystemRights]::Read, "ContainerInherit,ObjectInherit", "None", [System.Security.AccessControl.AccessControlType]::Allow)))
        Set-Acl -LiteralPath $tmpDir.FullName $dAcl
        $f2 = Join-Path $tmpDir.FullName "pw2.txt"; Set-Content -LiteralPath $f2 "x" -Encoding ASCII
        $d2 = ""; $r2 = Test-FileAcl $f2 ([ref]$d2)
        Check "N5b-inherited-acl-fails" (-not $r2) "inherited ACE rejected ($d2)"
        # 5c) clean owner-only ACL => PASS
        $f3 = Join-Path $tmpDir.FullName "pw3.txt"; Set-Content -LiteralPath $f3 "x" -Encoding ASCII
        $acl3 = Get-Acl -LiteralPath $f3; $acl3.SetAccessRuleProtection($true, $false)
        $cur3 = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl3.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($cur3, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)))
        Set-Acl -LiteralPath $f3 $acl3
        $d3 = ""; $r3 = Test-FileAcl $f3 ([ref]$d3)
        Check "N5c-clean-acl-passes" $r3 "owner-only ACL accepted ($d3)"
    } finally {
        Remove-Item -LiteralPath $tmpDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    # 6) untrusted RPC host must disable RPC
    $hostApproved = if ($AllowedRpcHosts) { (@($AllowedRpcHosts -split ',') | ForEach-Object { $_.Trim().ToLowerInvariant() }) -contains ([uri]$Rpc).Host.ToLowerInvariant() } else { $false }
    Check "N6-untrusted-rpc-fails" (-not $hostApproved) "RPC host not approved -> disabled"
    # 7) summary leak gate: secret value must be DETECTED; clean summary accepted
    $badSummary = '{"status":"C9-PASS","sig":123}'   # contains "sig" name only - clean
    $badSummary2 = '{"status":"ok","x":"s3cr3t"}'    # contains dummy password as value
    $badSummary3 = '{"status":"ok","x":"coreguard-anchor"}'  # contains account value
    Check "N7-secret-value-in-summary-detected" (-not (Test-SummaryClean $badSummary2 $null "s3cr3t" $EXPECTED_ACCOUNT)) "password value flagged"
    Check "N7b-account-value-in-summary-detected" (-not (Test-SummaryClean $badSummary3 $null $null $EXPECTED_ACCOUNT)) "account value flagged"
    Check "N7c-forbidden-fieldname-detected" (-not (Test-SummaryClean '{"signature":"0x..."}' $null $null $EXPECTED_ACCOUNT)) "field name 'signature' flagged"
    Check "N7d-clean-summary-accepted" (Test-SummaryClean $badSummary $null $null $EXPECTED_ACCOUNT) "no secrets, no account -> clean"
    "== SELF-TEST done =="
    $tap = Join-Path (Split-Path -Parent $PSCommandPath) "cg41-selftest.tap"
    Save-Evidence (Build-Evidence @{}) $tap
    "TAP written: $tap"
    exit $(if ($script:Failed) { 1 } else { 0 })
}

# ============================================================================
# C8 REVIEWER CHECKLIST MODE (prints guidance, runs nothing)
# ============================================================================
if ($ReviewerChecklist) {
    "CORE GUARD GATE 4.1 - C8 INDEPENDENT REVIEWER CHECKLIST (kit v3)"
    "================================================================"
    "Run every step against the ACTUAL files (never trust copied text)."
    ""
    "Reference pins (report v5 / manifest):"
    " - report v5 sha: 0x519e2ebe776f5ac5cb63b5382faf5ce82738ea30fa90a98cf815ef87edb8f72e"
    " - manifest   sha: 0xe709f6125cdba8d515325c23bd6e8943aa9824c2fc0cace10abe1fcab67e8baf"
    ""
    "H1. Recompute the 8 pinned hashes from files and compare against"
    "    reviews/gate-4.1-final-hashes.txt (8/8 MATCH)."
    "H2. Report v5 does NOT contain its own hash nor the manifest hash;"
    "    manifest (8 lines) does NOT contain its own hash."
    "H3. gate: ONE InvokeCastSend call site (line 425); ReviewOnly exits at"
    "    400-402; token 'CG41-BROADCAST-COMMIT-<validUntil>'; --private-key"
    "    only in guard/reject strings; sendDone (144) before exit-check (145);"
    "    parse-throw (427) in try (421); recovery (503-509)."
    "H4. lib: InvokeCastSend/InvokeCast reject --private-key + cast send."
    "H5. No gate-4.1-broadcast*.json / *recovery*.json anywhere; tracked diff"
    "    empty; .env gitignored."
    "H6. KIT V3:"
    "  [A] cast resolved to absolute canonical path; trust-root boundary; SHA"
    "      COMPARED to pre-approved -ExpectedCastSha256 BEFORE invocation;"
    "      mismatch => recorded FAIL, cast disabled, report still written."
    "  [B] ACL via ACE/SID allow-list; inheritance off; file owner == current"
    "      user; current user holds Modify/FullControl."
    "  [C] signature/calldata ONLY inside eth_call/estimateGas; never written."
    "  [D] C9h: account existence + no account value in summary + derived"
    "      signer == expected; negative test proves wrong account => FAILED."
    "  [E] status dynamic; report ALWAYS written (no early abort); exit code "
    "      0 only if ALL PASS (verify: run -SelfTest - battery must detect "
    "      every negation and exit 0; break one intentionally to see exit 1)."
    "H7. Signed C7 evidence (owner-run) co-signed here: keystore signer == "
    "    ExpectedSigner; eth_call '0x' no-revert; estimateGas > 0; fresh"
    "    validUntil within -ValiditySeconds; intentId/intentCommitment read "
    "    from gate-4.1 evidence and cross-checked with gate-4.0."
    "H8. Freeze integrity: any byte change in a pinned file => re-run full"
    "    freeze (fix -> freeze -> report hash -> manifest -> manifest hash)."
    ""
    "Outcome: report PASS/FAIL per H1..H8. C8 = CLOSED only if every H passes"
    "and an independent reviewer (not the kit author) signs from the ACTUAL"
    "files - never from this or any replayed output."
    exit 0
}

# ============================================================================
# MAIN (wrapped: an unexpected error still writes a FAILED report)
# ============================================================================
try {
    # ---- pre-flight ------------------------------------------------------
    $rpcHost = ([uri]$Rpc).Host.ToLowerInvariant()
    $approved = if ($AllowedRpcHosts) { @($AllowedRpcHosts -split ',') | ForEach-Object { $_.Trim().ToLowerInvariant() } } else { @() }
    $script:RpcOk = ($approved -contains $rpcHost)
    Check "C7w-rpc-host-approved" $script:RpcOk "host=$rpcHost (add to -AllowedRpcHosts to approve)"

    # ---- C9a..c keystore + password file --------------------------------
    $ksRoot = Join-Path $env:USERPROFILE ".foundry\keystores"
    Check "C9a-keystore-dir-exists" (Test-Path $ksRoot) "~\.foundry\keystores"
    $keyFile = Get-ChildItem $ksRoot -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $Account }
    Check "C9b-account-exists" ($null -ne $keyFile) "$Account in ~\.foundry\keystores"
    if (-not $PasswordFile) { $PasswordFile = EnvVal "MAINNET_KEYSTORE_PASSWORD_FILE" }
    Check "C9c-password-env-present" (-not [string]::IsNullOrWhiteSpace($PasswordFile)) "MAINNET_KEYSTORE_PASSWORD_FILE in .env"
    if (-not $PasswordFile) {
        Check "C9d-password-file-usable" $false "no -PasswordFile and no MAINNET_KEYSTORE_PASSWORD_FILE in .env"
    } elseif (-not (Test-Path -LiteralPath $PasswordFile)) {
        Check "C9d-password-file-usable" $false "path does not exist: $PasswordFile"
    } else {
        Check "C9d-password-file-usable" $true ""
        $aclDiag = ""; $aclOk = Test-FileAcl $PasswordFile ([ref]$aclDiag)
        Check "C9e-acl-compliant" $aclOk $aclDiag
    }

    # ---- C9f keystore/pass never inside the repo -------------------------
    $inRepo = (Get-ChildItem $Repo -Recurse -Force -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^UTC--' -or $_.Name -match '\.pass$' -or $_.FullName -match 'keystore' } | Measure-Object).Count
    Check "C9f-no-keystore-pass-in-repo" ($inRepo -eq 0) "0 hits in $Repo"
    $gitAvail = [bool](Get-Command git -ErrorAction SilentlyContinue)
    if ($gitAvail) {
        $hasUntracked = ((git -C $Repo status --porcelain 2>$null | Where-Object { $_ -match '^\?\?' }).Count) -gt 0
        $untrackedNote = if ($hasUntracked) { " (untracked files present; expected for uncommitted evidence)" } else { "" }
        git -C $Repo diff --quiet 2>$null; $workingDirty = (-not $?)
        git -C $Repo diff --cached --quiet 2>$null; $stagedDirty = (-not $?)
        Check "C9g2-repo-clean" (-not ($workingDirty -or $stagedDirty)) "no modifications to TRACKED files$untrackedNote"
        $tracked = (git -C $Repo ls-files 2>$null) -join "`n"
        $trackedBad = ($tracked | Select-String -Pattern 'keystore|\.pass|UTC--' | Measure-Object).Count
        Check "C9g-git-tracked-clean" ($trackedBad -eq 0) "no keystore/.pass/UTC-- tracked"
        $gi = ""; if (Test-Path -LiteralPath (Join-Path $Repo ".gitignore")) { $gi = (Get-Content -LiteralPath (Join-Path $Repo ".gitignore") -Raw) }
        Check "C9g3-gitignore-covers-env" ($gi -match '(?m)^\.env($|\s)') ".gitignore contains .env"
        $histBad = (git -C $Repo log --all --oneline --diff-filter=A -- '*.pass' 'UTC--*' '*keystore*' 2>$null | Measure-Object).Count
        Check "C9g4-git-history-clean" ($histBad -eq 0) "no pass/keystore/UTC-- ever added"
    } else {
        Check "C9g2-repo-clean" $false "git unavailable"
    }
    if (-not $script:Failed) { "" }

    # ---- P3 cast pinning (canonical path + pre-approved SHA) -------------
    $roots = @(Get-TrustRoots)
    $script:CastResolved = ""
    $script:CastComputed = ""
    $script:CastPath = ""
    if ($CastPath) {
        $script:CastResolved = CanonicalPath $CastPath
    } else {
        $cmd = Get-Command cast -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) { $script:CastResolved = CanonicalPath $cmd.Source }
    }
    Check "C9h-cast-resolved" (-not [string]::IsNullOrWhiteSpace($script:CastResolved)) $script:CastResolved
    if ($script:CastResolved) {
        $inRoot = Test-TrustedRoot $script:CastResolved @($roots)
        Check "C9i-cast-in-trusted-root" $inRoot "$script:CastResolved"
        $script:CastComputed = Get-Sha256Hex $script:CastResolved
        Check "C9j-cast-sha-pinned" (Test-CastHash $script:CastComputed $ExpectedCastSha256) "computed=$script:CastComputed vs expected=$ExpectedCastSha256"
        $script:CastOk = ($inRoot -and (Test-CastHash $script:CastComputed $ExpectedCastSha256))
    }

    # ---- S2 manifest unchanged (8 pinned files recomputed) ---------------
    $manifest = Join-Path $Repo "reviews\gate-4.1-final-hashes.txt"
    $mf = @()
    if (Test-Path -LiteralPath $manifest) { $mf = Get-Content -LiteralPath $manifest }
    $compared = 0; $mismatch = 0
    foreach ($line in $mf) {
        if ($line.Trim()) {
            $parts = $line.Trim() -split '\s+', 2
            if ($parts.Count -eq 2) {
                $compared++
                $f = Join-Path $Repo $parts[1]
                if (-not (Test-Path -LiteralPath $f)) { $mismatch++; continue }
                $h = Get-Sha256Hex $f
                if ($h -ne $parts[0]) { $mismatch++ }
            }
        }
    }
    Check "C7p-manifest-unchanged" ($compared -eq 8 -and $mismatch -eq 0) "$compared compared, $mismatch mismatched"

    # ---- C7 signed non-broadcast simulation ------------------------------
    $script:SignerDerived = ""; $script:IntentId = ""; $script:IntentCommitment = ""
    $script:Digest = ""; $script:Nonce = ""; $script:ValidUntil = ""; $script:CalldataLenHex = ""; $script:GasEstimate = ""
    $script:Diag = ""; $sig = ""
    $g41 = $null; $g40 = $null
    try { $g41 = Get-Content -LiteralPath (Join-Path $Repo "evidence\gate-4.1-identity-preflight.json") -Raw | ConvertFrom-Json } catch { $g41 = $null }
    try { $g40 = Get-Content -LiteralPath (Join-Path $Repo "evidence\gate-4.0-identity-preflight.json") -Raw | ConvertFrom-Json } catch { $g40 = $null }
    if ($g41 -and $g40) {
        # normalize: gate-4.0 stores {value}, gate-4.1 stores a plain string
        function Get-PropValue($obj, $name) {
            $p = $null
            try { $p = $obj.$name } catch { return "" }
            if ($null -eq $p) { return "" }
            if ($p -is [string]) { return $p }
            try { if ($null -ne $p.value) { return [string]$p.value } } catch {}
            return [string]$p
        }
        $script:IntentId = Get-PropValue $g41 "intentId"
        $script:IntentCommitment = Get-PropValue $g41 "intentCommitment"
        Check "C7e-intent-crosscheck" ($script:IntentId -eq (Get-PropValue $g40 "intentId") -and $script:IntentCommitment -eq (Get-PropValue $g40 "intentCommitment")) "gate-4.1 vs gate-4.0"
    } else {
        Check "C7e-intent-crosscheck" $false "gate-4.1/4.0 evidence unreadable"
    }

    # P2 account semantics (recorded even when cast disabled)
    Check "C9h-account-expected" (Test-Account $Account $EXPECTED_ACCOUNT) "running account must be $EXPECTED_ACCOUNT"

    if ($script:CastOk -and $keyFile -and $PasswordFile -and (Test-Path -LiteralPath $PasswordFile)) {
        try {
            $der = ((InvokeCast @("wallet","address","--account",$Account,"--password-file",$PasswordFile)).Split("`n") | Select-Object -Last 1).Trim()
            $script:SignerDerived = $der
            Check "C7c-signer-derived" ($der -ieq $ExpectedSigner) "$der"
            if ($script:RpcOk) {
                $script:Nonce = [Convert]::ToInt64((RpcP "eth_getTransactionCount" @($der, "pending")), 16)
                $cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
                Check "C7a-chainId" ($cid -eq $CHAIN_EXP) "$cid"
                $code = RpcP "eth_getCode" @($REG, "latest")
                Check "C7b-codelen" (((($code.Length - 2) / 2)) -eq $CODE_EXP) ("len=" + (($code.Length - 2) / 2))
                if (-not (Test-ValidityWindow $ValiditySeconds)) {
                    Check "C7m-validity-window" $false "bad window $ValiditySeconds"
                } else {
                    Check "C7m-validity-window" $true "${ValiditySeconds}s"
                    $script:ValidUntil = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + $ValiditySeconds
                    $script:Digest = (InvokeCast @("call","--rpc-url",$Rpc,$REG,"commitIntentDigest(bytes32,bytes32,uint256,address)(bytes32)",$script:IntentId,$script:IntentCommitment,("0x" + $script:ValidUntil.ToString("x")),$der)).Trim()
                    Check "C7h-digest" ($script:Digest -match "^0x[0-9a-fA-F]{64}$") "digest length ok"
                    $sig = ((InvokeCast @("wallet","sign","--account",$Account,"--password-file",$PasswordFile,"--no-hash",$script:Digest)).Split("`n") | Select-Object -Last 1).Trim()
                    Check "C7i-signature" ($sig -match "^0x[0-9a-fA-F]{130}$") "130 hex chars, not echoed"
                    $cd = (InvokeCast @("calldata","commitIntent(bytes32,bytes32,address,uint256,bytes)",$script:IntentId,$script:IntentCommitment,$der,("0x" + $script:ValidUntil.ToString("x")),$sig))
                    $script:CalldataLenHex = $cd.Length
                    $cdOk = $cd.StartsWith($SEL_COMMIT) -and ($cd.Substring(266, 64) -eq ("00000000000000000000000000000000000000000000000000000000000000a0")) -and ($cd.Substring(330, 64) -eq ("0000000000000000000000000000000000000000000000000000000000000041")) -and ($cd.Length -eq (8 + 64*5 + 64 + 130 + 62 + 2))
                    Check "C7j-calldata" $cdOk "selector+offset+len+total"
                    $tx = @{ from = $der; to = $REG; data = $cd; value = "0x0" }
                    $sim = RpcP "eth_call" @($tx, "latest")
                    Check "C7n-eth-call-sim" ($sim -eq "0x") "REAL signature accepted, no revert"
                    $est = [Convert]::ToInt64((RpcP "eth_estimateGas" @(@{ from = $der; to = $REG; data = $cd; value = "0x0" })), 16)
                    $script:GasEstimate = $est
                    Check "C7o-estimate-gas" ($est -gt 0) "$est (nothing sent)"
                }
            } else {
                Check "C7a-chainId" $false "RPC disabled (host not approved)"
            }
        } catch {
            $err = $_.Exception.Message
            Check "C7-block" $false $err
        }
    } else {
        $why = if (-not $script:CastOk) { "cast disabled (pin failed)" } elseif (-not $keyFile) { "account keyfile missing" } elseif (-not $PasswordFile) { "password file not provided" } else { "password file missing" }
        Check "C7c-signer-derived" $false $why
    }

    # ---- C9h leak audit: summary must not expose sig, password, account ---
    $pwContent = ""
    if ($PasswordFile -and (Test-Path -LiteralPath $PasswordFile)) { $pwContent = (Get-Content -LiteralPath $PasswordFile -Raw -ErrorAction SilentlyContinue) }
    $json = Build-Evidence @{}
    Check "C9h-leak-audit" (Test-SummaryClean $json $sig $pwContent $Account) "summary has no signature/password/account values"

    # ---- final report ALWAYS written (P1) --------------------------------
    $json = Build-Evidence @{}
    $tap = Join-Path (Split-Path -Parent $PSCommandPath) "cg41-c9c7-results.tap"
    $summary = Save-Evidence $json $tap
    ""
    "[OK] summary written: $summary"
    "[OK] TAP v13 written:  $tap"
    $final = if ($script:Failed) { "FAILED" } else { "C9-PASS C7-PASS NO-BROADCAST" }
    "[CLOSURE KIT v$KitVersion COMPLETE] $final"
    "[STATE] Broadcast NOT authorized. C8 requires an independent reviewer; this kit does not claim it."
    exit $(if ($script:Failed) { 1 } else { 0 })
}
catch {
    "[EXCEPTION] $($_.Exception.Message)"
    $script:Failed = $true
    if (-not $script:CheckResults.Contains("unexpected")) { $script:Order.Add("unexpected"); $script:CheckResults["unexpected"] = "FAIL" }
    $json = Build-Evidence @{ unexpectedError = $_.Exception.Message }
    $tap = Join-Path (Split-Path -Parent $PSCommandPath) "cg41-c9c7-results.tap"
    $summary = Save-Evidence $json $tap
    "[OK] FAILED report written despite exception: $summary"
    exit 1
}