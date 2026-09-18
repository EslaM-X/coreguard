# ============================================================================
# CORE GUARD GATE 4.1 - INDEPENDENT PREFLIGHT VERIFIER (VERIFICATION ONLY)
# ----------------------------------------------------------------------------
# By design this tool:
#   - NEVER imports a keystore, reads/creates a password file, or signs anything
#   - makes NO network call and starts NO subprocess
# It performs AST-based static analysis and identity verification only.
#
# WHAT IT CLAIMS (narrow, per review finding 5):
#   "Under the current rule set (AST enumeration of command invocations, .NET
#    type references, dynamic-invocation forms, and the RPC allow-list), NO
#    execution or network path was found beyond the enumerated sites."
#   This is NOT a proof of absence of such a path. A full manual review and
#   independent testing remain required before C8 can be signed.
#
# SECURITY MODEL (review A-D):
#   A) -CastPath and -ExpectedCastSha256 are supplied by the reviewer from an
#      INDEPENDENT trusted record; this tool NEVER derives the approved value.
#   B) No secret handling.
#   C) Verification is separated from any signing/simulation step.
#   D) Static analysis is AST-based (not regex) and covers commands, types,
#      dynamic invocation, and reachability-by-containing-function.
#
# STAGES (classified in the report):
#   read-only identity/static checks .. PERFORMED BY THIS TOOL
#   local signing test ................ NOT PERFORMED (separate human step)
#   signed simulation ................. NOT PERFORMED (separate human step)
#   broadcast ......................... NOT AUTHORIZED (no site detected)
# ============================================================================
[CmdletBinding()]
param(
    [string]$Kit = "",
    [string]$ExpectedKitSha256 = "0x05e1ba756586740288863164b8e66a944f4b76008eda7e45b80940d2f5cd8ad3",
    [int]$ExpectedKitBytes = 37152,
    [string]$CastPath = "",
    [string]$ExpectedCastSha256 = "",
    [string]$Manifest = "",
    [string]$ExpectedManifestSha256 = "",
    [string]$ReportPath = "",
    [switch]$SelfTest,
    [int]$ExpectStartProcess = 1,
    [int]$ExpectGit = 5
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ---- Single source of truth for classification ------------------------------
$EXEC_COMMANDS = @('start-process', 'invoke-expression', 'iex', 'start-job', 'start-threadjob',
    'invoke-command', 'add-type', 'cmd', 'cmd.exe', 'wmic', 'schtasks', 'register-scheduledtask',
    'sc', 'reg', 'curl', 'wget', 'bitsadmin', 'powershell', 'pwsh', 'bash', 'sh',
    'git', 'node', 'python', 'python3', 'npm', 'npx')
$NET_COMMANDS = @('invoke-restmethod', 'invoke-webrequest', 'irm', 'iwr', 'start-bitstransfer', 'curl', 'wget')
$PROC_TYPE_RE = '^System\.Diagnostics\.Process'
$NET_TYPE_RE = '^System\.Net\.(WebClient|Http|Sockets|WebRequest|WebResponse|Mail|Dns|NetworkInformation)'
$SAFE_GIT_VERBS = @('status', 'diff', 'ls-files', 'log')
$FORBIDDEN_GIT_VERBS = @('push', 'send-email', 'request-pull', 'fetch', 'pull', 'clone', 'ls-remote', 'remote')

$script:Failed = $false
$script:Results = [ordered]@{}
$script:Seen = @{}

function Check([string]$name, [bool]$ok, [string]$detail = "") {
    if ($script:Seen.ContainsKey($name)) {
        $script:Results["META-duplicate-check-id"] = "FAIL"
        $script:Failed = $true
        "[FAIL] META-duplicate-check-id :: repeated id '$name' (results would be overwritten)"
        return
    }
    $script:Seen[$name] = $true
    $script:Results[$name] = if ($ok) { "PASS" } else { "FAIL" }
    if (-not $ok) { $script:Failed = $true }
    if (-not $script:Quiet) {
        "[{0}] {1}{2}" -f ($(if ($ok) { "PASS" } else { "FAIL" }), $name, $(if ($detail) { " :: $detail" } else { "" }))
    }
}

function Get-Sha256Hex([string]$p) {
    $s = [System.Security.Cryptography.SHA256]::Create()
    try { $h = $s.ComputeHash([IO.File]::ReadAllBytes($p)) } finally { $s.Dispose() }
    return ("0x" + (($h | ForEach-Object { $_.ToString('x2') }) -join ''))
}

function Test-HashEq([string]$a, [string]$b) {
    if ([string]::IsNullOrWhiteSpace($a) -or [string]::IsNullOrWhiteSpace($b)) { return $false }
    return (($a -replace '^0x', '') -ieq ($b -replace '^0x', ''))
}

function CanonicalPath([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return "" }
    try { return [IO.Path]::GetFullPath($p) } catch { return $p }
}

function Get-TrustRoots() {
    $roots = @{}
    $roots["user_foundry"] = CanonicalPath (Join-Path $env:USERPROFILE ".foundry")
    $i = 0
    foreach ($pf in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($pf) { $i++; $roots["pf$i"] = CanonicalPath $pf }
    }
    return ($roots.Values | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
}

function Test-TrustedRoot([string]$canonical, [string[]]$roots) {
    if ([string]::IsNullOrWhiteSpace($canonical)) { return $false }
    foreach ($r in $roots) {
        $rb = $r.TrimEnd('\'); $cb = $canonical.TrimEnd('\')
        if ($cb -eq $rb) { return $true }
        if ($cb.StartsWith($rb + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

# ---- AST inventory ----------------------------------------------------------
function Get-Owner($fns, [int]$ln) {
    $o = $fns | Where-Object { $_.Extent.StartLineNumber -le $ln -and $_.Extent.EndLineNumber -ge $ln } | Select-Object -First 1
    if ($o) { return $o.Name } else { return '<script>' }
}

function Get-Inventory([string]$path) {
    $errs = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errs)
    $fns = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
    $cmds = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true))
    $types = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.TypeExpressionAst] }, $true))
    $members = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] }, $true))
    $assigns = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true))

    $inv = [ordered]@{
        parseErrors     = @($errs).Count
        execSites       = @()
        netSites        = @()
        dynamicSites    = @()
        procTypeRefs    = @()
        netTypeRefs     = @()
        gitSites        = @()
        invokeCastVerbs = @()
        rpcMethods      = @()
        allowList       = @()
        allowListFound  = $false
        functionNames   = @($fns | ForEach-Object { $_.Name })
    }

    foreach ($c in $cmds) {
        $ln = $c.Extent.StartLineNumber
        $name = $c.GetCommandName()
        if (-not $name) {
            $inv.dynamicSites += [ordered]@{ line = $ln; op = "$($c.InvocationOperator)"; text = $c.Extent.Text.Trim() }
            continue
        }
        $lname = $name.ToLowerInvariant()
        if ($EXEC_COMMANDS -contains $lname) {
            $inv.execSites += [ordered]@{ line = $ln; command = $name; owner = (Get-Owner $fns $ln); text = $c.Extent.Text.Trim() }
        }
        if ($NET_COMMANDS -contains $lname) {
            $inv.netSites += [ordered]@{ line = $ln; command = $name; owner = (Get-Owner $fns $ln); text = $c.Extent.Text.Trim() }
        }
        if ($lname -eq 'invokecast') {
            if ($c.Extent.Text -match "InvokeCast\s+@\(\s*['""]([^'""]+)['""]") { $inv.invokeCastVerbs += $matches[1] }
        }
        if ($lname -eq 'new-object') {
            foreach ($sc in @($c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } | Select-Object -Skip 1)) {
                $tn = $sc.Value
                if ($tn -match $PROC_TYPE_RE) { $inv.procTypeRefs += [ordered]@{ line = $ln; type = $tn } }
                if ($tn -match $NET_TYPE_RE) { $inv.netTypeRefs += [ordered]@{ line = $ln; type = $tn } }
            }
        }
        if ($lname -eq 'rpcp') {
            $s0 = $c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } | Select-Object -Skip 1 -First 1
            if ($s0) { $inv.rpcMethods += $s0.Value }
        }
        if ($lname -eq 'git') {
            $strs = @($c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } | ForEach-Object { $_.Value })
            $inv.gitSites += [ordered]@{ line = $ln; tokens = $strs; verb = ($strs | Where-Object { $SAFE_GIT_VERBS -contains $_ } | Select-Object -First 1) }
        }
    }

    foreach ($t in $types) {
        $nf = $t.TypeName.FullName; $nn = $t.TypeName.Name
        if ($nf -match $PROC_TYPE_RE -or $nn -match $PROC_TYPE_RE) { $inv.procTypeRefs += [ordered]@{ line = $t.Extent.StartLineNumber; type = $nf } }
        if ($nf -match $NET_TYPE_RE -or $nn -match $NET_TYPE_RE) { $inv.netTypeRefs += [ordered]@{ line = $t.Extent.StartLineNumber; type = $nf } }
    }

    foreach ($m in $members) {
        $memName = "$($m.Member.Value)".ToLowerInvariant()
        $recv = $m.Expression.Extent.Text
        $isDyn = $false
        if ($memName -eq 'frombase64string' -or $memName -eq 'invokereturnasis') { $isDyn = $true }
        if ($memName -eq 'create' -and $recv -match '(?i)scriptblock') { $isDyn = $true }
        if ($isDyn) {
            $inv.dynamicSites += [ordered]@{ line = $m.Extent.StartLineNumber; op = "member:$memName"; text = $m.Extent.Text.Trim() }
        }
    }

    foreach ($a in $assigns) {
        if ($a.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
            $a.Left.VariablePath.UserPath -eq 'ALLOWED_RPC') {
            $inv.allowListFound = $true
            foreach ($mm in [regex]::Matches($a.Right.Extent.Text, "['""]([^'""]+)['""]")) { $inv.allowList += $mm.Groups[1].Value }
        }
    }
    return [pscustomobject]$inv
}

# ---- Self-test fixtures -----------------------------------------------------
function New-Fixture([string]$dir, [string]$name, [string]$body) {
    $p = Join-Path $dir $name
    [IO.File]::WriteAllText($p, $body, (New-Object Text.UTF8Encoding($false)))
    return $p
}

if ($SelfTest) {
    $tmp = Join-Path $env:TEMP ("cg41verify-selftest-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $tap = New-Object System.Collections.Generic.List[string]
    $script:SelfFailed = $false
    function Assert([string]$id, [bool]$ok) {
        $tap.Add("$(if ($ok) { 'ok' } else { 'not ok' }) - $id")
        "[{0}] {1}" -f ($(if ($ok) { 'PASS' } else { 'FAIL' }), $id)
        if (-not $ok) { $script:SelfFailed = $true }
    }
    try {
        $base = "`$ALLOWED_RPC = @('eth_chainId','eth_getCode','eth_call')`nfunction InvokeCast([string[]]`$a){ if (`$a[0] -eq 'send'){throw 'forbidden'}; if ((`$a -join ' ') -match '--private-key'){throw 'forbidden'}; Start-Process -FilePath 'x' }`nfunction RpcP(`$m){ if (`$ALLOWED_RPC -notcontains `$m){throw}; Invoke-RestMethod -Uri 'x' }`n"

        $fClean = New-Fixture $tmp "clean.ps1" $base
        $i = Get-Inventory $fClean
        Assert "ST1-clean-no-dynamic" ($i.dynamicSites.Count -eq 0)
        Assert "ST2-clean-allowlist-parsed" ($i.allowList.Count -eq 3)
        Assert "ST3-clean-exec-inventory" ($i.execSites.Count -eq 1 -and $i.netSites.Count -eq 1)
        Assert "ST4-clean-invokeCast-verbs-none" ($i.invokeCastVerbs.Count -eq 0)

        $fSend = New-Fixture $tmp "send.ps1" ($base + "InvokeCast @('send','--foo')`n")
        $i = Get-Inventory $fSend
        Assert "ST5-send-verb-detected" ($i.invokeCastVerbs -contains 'send')

        $fRpc = New-Fixture $tmp "rpc.ps1" ($base + "RpcP 'eth_sendRawTransaction'`n")
        $i = Get-Inventory $fRpc
        Assert "ST6-unlisted-rpc-detected" ((@($i.rpcMethods | Where-Object { $i.allowList -notcontains $_ })).Count -eq 1)

        $fEmpty = New-Fixture $tmp "empty.ps1" ("`$ALLOWED_RPC = @()`n")
        $i = Get-Inventory $fEmpty
        Assert "ST7-empty-allowlist-detected" ($i.allowListFound -and $i.allowList.Count -eq 0)

        $fSendList = New-Fixture $tmp "sendlist.ps1" ("`$ALLOWED_RPC = @('eth_chainId','eth_sendRawTransaction')`n")
        $i = Get-Inventory $fSendList
        Assert "ST8-send-in-allowlist-detected" ((@($i.allowList | Where-Object { $_ -match 'send' })).Count -eq 1)

        $fDyn = New-Fixture $tmp "dyn.ps1" ("`$c = 'Get-Date'`n& `$c`n")
        $i = Get-Inventory $fDyn
        Assert "ST9-dynamic-invocation-detected" ($i.dynamicSites.Count -ge 1)

        $fNet = New-Fixture $tmp "net.ps1" ("`$w = New-Object System.Net.WebClient`n")
        $i = Get-Inventory $fNet
        Assert "ST10-net-type-detected" ($i.netTypeRefs.Count -ge 1)

        $fProc = New-Fixture $tmp "proc.ps1" ("Start-Process x`nStart-Process y`n")
        $i = Get-Inventory $fProc
        Assert "ST11-double-startprocess-detected" ($i.execSites.Count -eq 2)

        $fGit = New-Fixture $tmp "git.ps1" ("git -C `$r push origin main`n")
        $i = Get-Inventory $fGit
        $bad = @($i.gitSites | Where-Object { @($_.tokens | Where-Object { $FORBIDDEN_GIT_VERBS -contains $_ }).Count -gt 0 })
        Assert "ST12-forbidden-git-verb-detected" ($bad.Count -eq 1)

        $fIex = New-Fixture $tmp "iex.ps1" ("Invoke-Expression 'x'`n")
        $i = Get-Inventory $fIex
        $m = @($i.execSites | Where-Object { $_.command -eq 'Invoke-Expression' })
        Assert "ST13-invoke-expression-detected" ($m.Count -eq 1)

        $script:Quiet = $true
        Check "ST14-dup-probe" $true
        Check "ST14-dup-probe" $true
        $script:Quiet = $false
        Assert "ST14-duplicate-check-id-guard" ($script:Results.Contains('META-duplicate-check-id'))
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    $tapPath = Join-Path (Split-Path -Parent $PSCommandPath) "gate-4.1-verify-selftest.tap"
    [IO.File]::WriteAllText($tapPath, (($tap -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
    ""
    "TAP: $tapPath"
    "checks: $($tap.Count); failures: $(@($tap | Where-Object { $_ -like 'not ok*' }).Count)"
    exit $(if ($script:SelfFailed) { 1 } else { 0 })
}

# ---- Main -------------------------------------------------------------------
$dir = Split-Path -Parent $PSCommandPath
if (-not $Kit) { $Kit = Join-Path $dir "cg41-c9-c7-closure-kit.ps1" }
if (-not $ReportPath) { $ReportPath = Join-Path $dir "gate-4.1-verify-report.json" }

Check "V01-kit-exists" (Test-Path -LiteralPath $Kit) $Kit
Check "V05-cast-exists" (Test-Path -LiteralPath $CastPath) (CanonicalPath $CastPath)

$kitSha = Get-Sha256Hex $Kit
$kitLen = (Get-Item -LiteralPath $Kit).Length
Check "V03-kit-sha-preapproved" (Test-HashEq $kitSha $ExpectedKitSha256) $kitSha
Check "V04-kit-bytes-preapproved" ($kitLen -eq $ExpectedKitBytes) "$kitLen bytes"

$kitInv = Get-Inventory $Kit
Check "V02-kit-parse-ok" ($kitInv.parseErrors -eq 0) "errors=$($kitInv.parseErrors)"

$castCanon = CanonicalPath $CastPath
$roots = @(Get-TrustRoots)
Check "V06-cast-within-trust-root" (Test-TrustedRoot $castCanon $roots) ("roots=" + ($roots -join '; '))
$castSha = Get-Sha256Hex $CastPath
Check "V07-cast-sha-matches-preapproved" (Test-HashEq $castSha $ExpectedCastSha256) ("actual=$castSha")

Check "V08-no-dynamic-invocation" ($kitInv.dynamicSites.Count -eq 0) ("sites=" + $kitInv.dynamicSites.Count)
Check "V09-exec-inventory-exact" ($kitInv.execSites.Count -eq ($ExpectStartProcess + $ExpectGit)) ("execSites=$($kitInv.execSites.Count) expected=$($ExpectStartProcess + $ExpectGit)")
$sp = @($kitInv.execSites | Where-Object { $_.command -eq 'Start-Process' })
$git = @($kitInv.execSites | Where-Object { $_.command -eq 'git' })
Check "V10-startprocess-count" ($sp.Count -eq $ExpectStartProcess) "$($sp.Count)"
Check "V11-startprocess-in-InvokeCast-only" ((@($sp | Where-Object { $_.owner -ne 'InvokeCast' })).Count -eq 0) (($sp | ForEach-Object { $_.owner }) -join ',')
Check "V12-git-count" ($git.Count -eq $ExpectGit) "$($git.Count)"
$gitBad = @($kitInv.gitSites | Where-Object { @($_.tokens | Where-Object { $FORBIDDEN_GIT_VERBS -contains $_ }).Count -gt 0 })
Check "V13-git-verbs-safe" ($gitBad.Count -eq 0) (($kitInv.gitSites | ForEach-Object { "L$($_.line):$($_.verb)" }) -join ',')
Check "V14-net-inventory-exact" ($kitInv.netSites.Count -eq 1) "$($kitInv.netSites.Count)"
Check "V15-net-in-RpcP-only" ((@($kitInv.netSites | Where-Object { $_.owner -ne 'RpcP' })).Count -eq 0) (($kitInv.netSites | ForEach-Object { $_.owner }) -join ',')
Check "V16-no-process-types" ($kitInv.procTypeRefs.Count -eq 0) "$($kitInv.procTypeRefs.Count)"
Check "V17-no-net-types" ($kitInv.netTypeRefs.Count -eq 0) "$($kitInv.netTypeRefs.Count)"
$sendVerbs = @($kitInv.invokeCastVerbs | Where-Object { $_ -in @('send', 'publish', 'mktx') })
Check "V18-invokeCast-no-send-verb" ($sendVerbs.Count -eq 0) ("verbs=" + ($kitInv.invokeCastVerbs -join ','))

$raw = Get-Content -LiteralPath $Kit -Raw
Check "V19-send-guard-present" ($raw -match '\$argList\[0\]\s*-eq\s*"send"')
Check "V20-privatekey-guard-present" ($raw -match '--private-key' -and $raw -match 'forbidden')

Check "V21-allowlist-parsed" ($kitInv.allowListFound -and $kitInv.allowList.Count -gt 0) ("found=$($kitInv.allowListFound) count=$($kitInv.allowList.Count)")
$notListed = @($kitInv.rpcMethods | Where-Object { $kitInv.allowList -notcontains $_ })
Check "V22-rpc-methods-whitelisted" ($notListed.Count -eq 0) ("methods=" + ($kitInv.rpcMethods -join ',') + " notListed=" + ($notListed -join ','))
$sendListed = @($kitInv.allowList | Where-Object { $_ -match 'send' })
Check "V23-allowlist-no-send" ($sendListed.Count -eq 0) ("sendEntries=" + ($sendListed -join ','))

$selfInv = Get-Inventory $PSCommandPath
Check "V24-verifier-self-parse" ($selfInv.parseErrors -eq 0) "errors=$($selfInv.parseErrors)"
Check "V25-verifier-self-no-exec-net" ($selfInv.execSites.Count -eq 0 -and $selfInv.netSites.Count -eq 0 -and $selfInv.dynamicSites.Count -eq 0) ("exec=$($selfInv.execSites.Count) net=$($selfInv.netSites.Count) dyn=$($selfInv.dynamicSites.Count)")

$manifestInfo = $null
if ($Manifest -and (Test-Path -LiteralPath $Manifest)) {
    $manifestInfo = [ordered]@{ path = (CanonicalPath $Manifest); match = 0; mismatch = 0; entries = @() }
    if ($ExpectedManifestSha256) {
        $mSha = Get-Sha256Hex $Manifest
        Check "V26-manifest-sha-preapproved" (Test-HashEq $mSha $ExpectedManifestSha256) $mSha
    }
    $mBase = Split-Path -Parent (Split-Path -Parent $Manifest)
    foreach ($row in (Get-Content -LiteralPath $Manifest | Where-Object { $_.Trim() -ne "" })) {
        $parts = $row.Trim() -split '\s+', 2
        $exp = $parts[0]; $rel = $parts[1]
        $full = Join-Path $mBase ($rel -replace '/', '\')
        if (-not (Test-Path -LiteralPath $full)) { $manifestInfo.entries += [ordered]@{ file = $rel; status = "MISSING" }; $manifestInfo.mismatch++; continue }
        $act = Get-Sha256Hex $full
        if (Test-HashEq $act $exp) { $manifestInfo.entries += [ordered]@{ file = $rel; status = "MATCH" }; $manifestInfo.match++ }
        else { $manifestInfo.entries += [ordered]@{ file = $rel; status = "MISMATCH"; expected = $exp; actual = $act }; $manifestInfo.mismatch++ }
    }
    Check "V27-manifest-all-match" ($manifestInfo.mismatch -eq 0) ("match=$($manifestInfo.match) mismatch=$($manifestInfo.mismatch)")
}

$report = [ordered]@{
    verifier = "gate-4.1-verify.ps1"
    dateUtc  = (Get-Date).ToUniversalTime().ToString("o")
    status   = if ($script:Failed) { "FAILED - verification did not pass" } else { "VERIFIED-READONLY-ONLY" }
    claim    = "Under the current rule set (AST enumeration of commands, .NET types, dynamic-invocation forms, and the RPC allow-list), NO execution or network path was found beyond the enumerated sites. This is NOT a proof of absence."
    stages   = [ordered]@{
        readOnlyIdentityAndStatic = "PERFORMED"
        localSigningTest          = "NOT-PERFORMED (separate, human-driven step)"
        signedSimulation          = "NOT-PERFORMED (separate, human-driven step)"
        broadcast                 = "NOT-AUTHORIZED (no site detected under current rules)"
    }
    inputs   = [ordered]@{
        kitPath            = (CanonicalPath $Kit)
        kitSha256          = $kitSha
        expectedKitSha256  = $ExpectedKitSha256
        castPath           = $castCanon
        castSha256         = $castSha
        expectedCastSha256 = $ExpectedCastSha256
        trustRoots         = @($roots)
    }
    analysis = [ordered]@{
        commandInventory = $kitInv.execSites
        networkInventory = $kitInv.netSites
        dynamicSites     = $kitInv.dynamicSites
        processTypeRefs  = $kitInv.procTypeRefs
        networkTypeRefs  = $kitInv.netTypeRefs
        gitSites         = $kitInv.gitSites
        invokeCastVerbs  = @($kitInv.invokeCastVerbs)
        rpcMethods       = @($kitInv.rpcMethods)
        rpcAllowList     = @($kitInv.allowList)
        functions        = @($kitInv.functionNames)
    }
    manifest = $manifestInfo
    checks   = $script:Results
}
[IO.File]::WriteAllText($ReportPath, ($report | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
""
"report: $ReportPath"
"status: $($report.status)"
exit $(if ($script:Failed) { 1 } else { 0 })
