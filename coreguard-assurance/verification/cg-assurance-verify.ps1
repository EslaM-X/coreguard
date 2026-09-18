# ============================================================================
# CORE GUARD ASSURANCE ENGINE (v1.0.0 / cg41-policy-v1)
# ----------------------------------------------------------------------------
# Verification-only. This engine:
#   - NEVER imports a keystore, reads or creates a password file, or signs
#   - NEVER makes a network call and NEVER starts a subprocess
#   - produces structured findings with explicit status values:
#         PASS | FAIL | BLOCKED | INCONCLUSIVE | NOT_APPLICABLE
#   - is driven by versioned JSON policies under <root>\policy
#
# WHY: a boolean PASS/FAIL printout is not an assurance artifact. This engine
# turns each check into a traceable finding (id, severity, ruleVersion,
# failClosed, evidence) and refuses to treat SKIPPED as PASS.
#
# SEPARATION OF DUTIES: this tool cannot sign and cannot authorize broadcast.
# ============================================================================
[CmdletBinding()]
param(
    [string]$Root = "",
    [string]$Kit = "",
    [string]$ExpectedKitSha256 = "",
    [int]$ExpectedKitBytes = 0,
    [string]$CastPath = "",
    [string]$ExpectedCastSha256 = "",
    [string]$Manifest = "",
    [string]$ExpectedManifestSha256 = "",
    [string[]]$LegacyRoots = @(),
    [string[]]$SecretScanRoots = @(),
    [string]$OutDir = "",
    [switch]$SelfTest,
    [switch]$SelfCheckReport,
    [switch]$NegativeSuite,
    [switch]$Release,
    [switch]$UpdateLock
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:ToolName = "cg-assurance-verify.ps1"
$script:ToolVersion = "2.0.0"
$script:SupersedesVersion = "1.0.0"
$script:SchemaVersion = "cg41-report/2"
$script:CoreVersion = "1.0.0"
$script:Findings = $null
$script:Seen = @{}
$script:FailClosedFailed = $false

# ---- stateless helpers ------------------------------------------------------
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
function Expand-Path([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return "" }
    return [Environment]::ExpandEnvironmentVariables($p)
}
function Read-JsonFile([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { return $null }
    return (Get-Content -LiteralPath $p -Raw | ConvertFrom-Json)
}
function Get-TrustRoots([object]$rootsPolicy) {
    $out = @()
    foreach ($r in @($rootsPolicy.roots)) { $out += (CanonicalPath (Expand-Path $r.path)) }
    return @($out | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
}
function Test-UnderRoot([string]$canonical, [string[]]$roots) {
    if ([string]::IsNullOrWhiteSpace($canonical)) { return $false }
    foreach ($r in $roots) {
        $rb = $r.TrimEnd('\'); $cb = $canonical.TrimEnd('\')
        if ($cb -eq $rb) { return $true }
        if ($cb.StartsWith($rb + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

# ---- AST ----------------------------------------------------------------
function Get-Owner($fns, [int]$ln) {
    $o = $fns | Where-Object { $_.Extent.StartLineNumber -le $ln -and $_.Extent.EndLineNumber -ge $ln } | Select-Object -First 1
    if ($o) { return $o.Name } else { return '<script>' }
}
function Get-Inventory([string]$path, [object]$fp) {
    $errs = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errs)
    $fns = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
    $cmds = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true))
    $types = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.TypeExpressionAst] }, $true))
    $members = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] }, $true))
    $assigns = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true))

    $execSet = @($fp.execCommands | ForEach-Object { $_.ToLowerInvariant() })
    $netSet = @($fp.netCommands | ForEach-Object { $_.ToLowerInvariant() })
    $dynMembers = @($fp.dynamicMemberPatterns | ForEach-Object { $_.ToLowerInvariant() })
    $dynCtors = @($fp.dynamicConstructorTypes | ForEach-Object { $_.ToLowerInvariant() })
    $safeGit = @($fp.safeGitVerbs)

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
        if ($execSet -contains $lname) { $inv.execSites += [ordered]@{ line = $ln; command = $name; owner = (Get-Owner $fns $ln); text = $c.Extent.Text.Trim() } }
        if ($netSet -contains $lname) { $inv.netSites += [ordered]@{ line = $ln; command = $name; owner = (Get-Owner $fns $ln); text = $c.Extent.Text.Trim() } }
        if ($lname -eq 'invokecast') {
            if ($c.Extent.Text -match "InvokeCast\s+@\(\s*['""]([^'""]+)['""]") { $inv.invokeCastVerbs += $matches[1] }
        }
        if ($lname -eq 'new-object') {
            foreach ($sc in @($c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } | Select-Object -Skip 1)) {
                $tn = $sc.Value
                foreach ($pat in @($fp.processTypePatterns)) { if ($tn -match $pat) { $inv.procTypeRefs += [ordered]@{ line = $ln; type = $tn } } }
                foreach ($pat in @($fp.networkTypePatterns)) { if ($tn -match $pat) { $inv.netTypeRefs += [ordered]@{ line = $ln; type = $tn } } }
            }
        }
        if ($lname -eq 'rpcp') {
            $s0 = $c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } | Select-Object -Skip 1 -First 1
            if ($s0) { $inv.rpcMethods += $s0.Value }
        }
        if ($lname -eq 'git') {
            $strs = @($c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } | ForEach-Object { $_.Value })
            $inv.gitSites += [ordered]@{ line = $ln; tokens = $strs; verb = ($strs | Where-Object { $safeGit -contains $_ } | Select-Object -First 1) }
        }
    }
    foreach ($t in $types) {
        $nf = $t.TypeName.FullName; $nn = $t.TypeName.Name
        foreach ($pat in @($fp.processTypePatterns)) { if ($nf -match $pat -or $nn -match $pat) { $inv.procTypeRefs += [ordered]@{ line = $t.Extent.StartLineNumber; type = $nf } } }
        foreach ($pat in @($fp.networkTypePatterns)) { if ($nf -match $pat -or $nn -match $pat) { $inv.netTypeRefs += [ordered]@{ line = $t.Extent.StartLineNumber; type = $nf } } }
    }
    foreach ($m in $members) {
        $memName = "$($m.Member.Value)".ToLowerInvariant()
        $recv = $m.Expression.Extent.Text
        $isDyn = $false
        if ($dynMembers -contains $memName) { $isDyn = $true }
        if ($memName -eq 'create' -and @($dynCtors | Where-Object { $recv -match $_ }).Count -gt 0) { $isDyn = $true }
        if ($isDyn) { $inv.dynamicSites += [ordered]@{ line = $m.Extent.StartLineNumber; op = "member:$memName"; text = $m.Extent.Text.Trim() } }
    }
    foreach ($a in $assigns) {
        if ($a.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and $a.Left.VariablePath.UserPath -eq 'ALLOWED_RPC') {
            $inv.allowListFound = $true
            foreach ($mm in [regex]::Matches($a.Right.Extent.Text, "['""]([^'""]+)['""]")) { $inv.allowList += $mm.Groups[1].Value }
        }
    }
    return [pscustomobject]$inv
}

# ---- finding emitter (duplicate-safe, fail-closed) --------------------------
function Add-Finding([string]$id, [string]$status, [string]$severity, [string]$description, [bool]$failClosed, $evidence) {
    $allowed = @('PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE', 'NOT_APPLICABLE')
    if (-not ($allowed -contains $status)) { $status = 'INCONCLUSIVE' }
    if ($script:Seen.ContainsKey($id)) {
        $m = [ordered]@{ id = 'META-001'; status = 'FAIL'; severity = 'BLOCKER'; ruleVersion = 'cg41-policy-v1'; description = 'Duplicate finding id emitted'; failClosed = $true; evidence = [ordered]@{ duplicateId = $id } }
        [void]$script:Findings.Add([pscustomobject]$m)
        $script:FailClosedFailed = $true
        Write-Host "[FAIL] META-001 :: duplicate id '$id'"
        return
    }
    $script:Seen[$id] = $true
    $f = [ordered]@{ id = $id; status = $status; severity = $severity; ruleVersion = 'cg41-policy-v1'; description = $description; failClosed = $failClosed; evidence = $evidence }
    [void]$script:Findings.Add([pscustomobject]$f)
    if ($failClosed -and @('FAIL', 'BLOCKED', 'INCONCLUSIVE') -contains $status) { $script:FailClosedFailed = $true }
    Write-Host ("[{0}] {1} ({2})" -f $status, $id, $severity)
}

# ---- fixture helper ---------------------------------------------------------
function New-Fixture([string]$dir, [string]$name, [string]$body) {
    $p = Join-Path $dir $name
    [IO.File]::WriteAllText($p, $body, [Text.UTF8Encoding]::new($false))
    return $p
}
function Html-Encode([string]$s) {
    if ($null -eq $s) { return "" }
    return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

# ---- evidence hashes + bounded claim (Assurance Spec v1, sections 3/7) ------
function Get-InputHashes([hashtable]$Cfg) {
    $roles = @(
        @{ role = 'kit';             path = $Cfg.KitPath }
        @{ role = 'cast';            path = $Cfg.CastPath }
        @{ role = 'manifest';        path = $Cfg.Manifest }
        @{ role = 'policy-core';     path = (Join-Path $Cfg.PolicyDir 'coreguard-policy-v1.json') }
        @{ role = 'policy-rpc';      path = (Join-Path $Cfg.PolicyDir 'allowed-rpc-methods.json') }
        @{ role = 'policy-roots';    path = (Join-Path $Cfg.PolicyDir 'trusted-tool-roots.json') }
        @{ role = 'policy-patterns'; path = (Join-Path $Cfg.PolicyDir 'forbidden-execution-patterns.json') }
        @{ role = 'policy-lock';     path = (Join-Path $Cfg.PolicyDir 'policy-lock.json') }
        @{ role = 'engine-self';     path = $PSCommandPath }
    )
    $out = @()
    foreach ($r in $roles) {
        if ($r.path -and (Test-Path -LiteralPath $r.path)) {
            $out += [ordered]@{ file = (CanonicalPath $r.path); sha256 = (Get-Sha256Hex $r.path); bytes = (Get-Item -LiteralPath $r.path).Length; role = $r.role }
        }
    }
    return @($out)
}
function Get-Sha256FromString([string]$s) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($s)
    $s2 = [System.Security.Cryptography.SHA256]::Create()
    try { $h = $s2.ComputeHash($bytes) } finally { $s2.Dispose() }
    return ("0x" + (($h | ForEach-Object { $_.ToString('x2') }) -join ''))
}
function Test-BoundedClaim([string]$claim) {
    # Spec section 4/7: the claim must stay bounded; strength claims are forbidden.
    if ([string]::IsNullOrWhiteSpace($claim)) { return $false }
    if ($claim -notmatch [regex]::Escape('NOT a proof of absence of such a path')) { return $false }
    foreach ($banned in @('guarantees no broadcast path', 'proves absence of every path', 'fully secure')) {
        if ($claim.ToLowerInvariant().Contains($banned)) { return $false }
    }
    return $true
}

# ---- core assurance run -----------------------------------------------------
function Invoke-Assurance([hashtable]$Cfg) {
    $script:Findings = New-Object System.Collections.Generic.List[object]
    $script:Seen = @{}
    $script:FailClosedFailed = $false

    $pol = $Cfg.Policy
    $thresholds = $pol.thresholds
    $kit = $Cfg.KitPath
    $wantSha = if ($Cfg.ContainsKey('ExpectedKitSha256') -and $Cfg.ExpectedKitSha256) { $Cfg.ExpectedKitSha256 } else { $thresholds.expectedKitSha256 }
    $wantBytes = if ($Cfg.ContainsKey('ExpectedKitBytes') -and $Cfg.ExpectedKitBytes) { [int]$Cfg.ExpectedKitBytes } else { [int]$thresholds.expectedKitBytes }
    $expSP = if ($Cfg.ContainsKey('ExpectStartProcess')) { [int]$Cfg.ExpectStartProcess } else { [int]$thresholds.expectedStartProcess }
    $expGit = if ($Cfg.ContainsKey('ExpectGitSites')) { [int]$Cfg.ExpectGitSites } else { [int]$thresholds.expectedGitSites }
    $expNet = if ($Cfg.ContainsKey('ExpectNetSites')) { [int]$Cfg.ExpectNetSites } else { [int]$thresholds.expectedNetSites }
    $minAllow = [int]$thresholds.minAllowListEntries

    $kitExists = Test-Path -LiteralPath $kit
    Add-Finding 'INV-001' ($(if ($kitExists) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Target kit exists' $true ([ordered]@{ path = (CanonicalPath $kit) })

    $kitInv = $null; $raw = ""; $kitSha = ""; $kitLen = 0
    if ($kitExists) {
        $kitSha = Get-Sha256Hex $kit
        $kitLen = (Get-Item -LiteralPath $kit).Length
        $raw = Get-Content -LiteralPath $kit -Raw
        $kitInv = Get-Inventory $kit $Cfg.Fingerprint
        Add-Finding 'INV-002' ($(if ($kitInv.parseErrors -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Target kit parses with zero syntax errors' $true ([ordered]@{ parseErrors = $kitInv.parseErrors })
        Add-Finding 'INV-003' ($(if (Test-HashEq $kitSha $wantSha) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Target kit SHA-256 matches pre-approved value' $true ([ordered]@{ actual = $kitSha; expected = $wantSha })
        Add-Finding 'INV-004' ($(if ($kitLen -eq $wantBytes) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Target kit byte length matches pre-approved value' $true ([ordered]@{ actual = $kitLen; expected = $wantBytes })
    } else {
        Add-Finding 'INV-002' 'INCONCLUSIVE' 'BLOCKER' 'Target kit parses' $true ([ordered]@{ reason = 'kit-missing' })
        Add-Finding 'INV-003' 'INCONCLUSIVE' 'BLOCKER' 'Target kit SHA-256' $true ([ordered]@{ reason = 'kit-missing' })
        Add-Finding 'INV-004' 'INCONCLUSIVE' 'MAJOR' 'Target kit byte length' $true ([ordered]@{ reason = 'kit-missing' })
    }

    $cast = $Cfg.CastPath
    $castExists = ($cast -and -not [string]::IsNullOrWhiteSpace($cast) -and (Test-Path -LiteralPath $cast))
    Add-Finding 'ENV-001' ($(if ($castExists) { 'PASS' } else { 'BLOCKED' })) 'BLOCKER' 'cast binary exists' $true ([ordered]@{ path = (CanonicalPath $cast); reason = $(if ($castExists) { 'present' } else { 'cast-path-not-provided-or-missing' }) })
    if ($castExists) {
        $castSha = Get-Sha256Hex $cast
        Add-Finding 'ENV-002' ($(if (Test-HashEq $castSha $Cfg.ExpectedCastSha256) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'cast binary SHA-256 matches pre-approved value' $true ([ordered]@{ actual = $castSha; expected = $Cfg.ExpectedCastSha256 })
        $roots = @(Get-TrustRoots $Cfg.RootsPolicy)
        $ok = Test-UnderRoot (CanonicalPath $cast) $roots
        Add-Finding 'ENV-003' ($(if ($ok) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'cast binary resides within a trusted tool root' $true ([ordered]@{ path = (CanonicalPath $cast); trustRoots = $roots; reason = $(if ($ok) { 'within-trust-root' } else { 'outside-trust-root' }) })
    } else {
        Add-Finding 'ENV-002' 'INCONCLUSIVE' 'BLOCKER' 'cast binary SHA-256' $true ([ordered]@{ reason = 'cast-missing' })
        Add-Finding 'ENV-003' 'BLOCKED' 'BLOCKER' 'cast binary trust root' $true ([ordered]@{ reason = 'cast-missing' })
    }

    if ($kitInv) {
        Add-Finding 'AST-001' ($(if ($kitInv.dynamicSites.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'No dynamic invocation sites in target kit' $true ([ordered]@{ sites = $kitInv.dynamicSites })
        Add-Finding 'AST-002' ($(if ($kitInv.execSites.Count -eq ($expSP + $expGit)) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Execution-command inventory matches policy expectation' $true ([ordered]@{ actual = $kitInv.execSites.Count; expected = ($expSP + $expGit) })
        $sp = @($kitInv.execSites | Where-Object { $_.command -eq 'Start-Process' })
        Add-Finding 'AST-003' ($(if ($sp.Count -eq $expSP) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Start-Process count matches policy expectation' $true ([ordered]@{ actual = $sp.Count; expected = $expSP })
        $spBad = @($sp | Where-Object { $_.owner -ne 'InvokeCast' })
        Add-Finding 'AST-004' ($(if ($spBad.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Every Start-Process site is owned by InvokeCast' $true ([ordered]@{ owners = @($sp | ForEach-Object { $_.owner }) })
        $git = @($kitInv.execSites | Where-Object { $_.command -eq 'git' })
        Add-Finding 'AST-005' ($(if ($git.Count -eq $expGit) { 'PASS' } else { 'FAIL' })) 'MINOR' 'git invocation count matches policy expectation' $false ([ordered]@{ actual = $git.Count; expected = $expGit })
        $forbiddenGit = @($Cfg.Fingerprint.forbiddenGitVerbs)
        $gitBad = @($kitInv.gitSites | Where-Object { @($_.tokens | Where-Object { $forbiddenGit -contains $_ }).Count -gt 0 })
        Add-Finding 'AST-006' ($(if ($gitBad.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'No forbidden git subcommand verb in any git site' $true ([ordered]@{ sites = @($kitInv.gitSites | ForEach-Object { "L$($_.line):$($_.verb)" }); offending = @($gitBad | ForEach-Object { "L$($_.line)" }) })
        Add-Finding 'AST-007' ($(if ($kitInv.netSites.Count -eq $expNet) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Network-command inventory matches policy expectation' $true ([ordered]@{ actual = $kitInv.netSites.Count; expected = $expNet })
        $netBad = @($kitInv.netSites | Where-Object { $_.owner -ne 'RpcP' })
        Add-Finding 'AST-008' ($(if ($netBad.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Every network-command site is owned by RpcP' $true ([ordered]@{ owners = @($kitInv.netSites | ForEach-Object { $_.owner }) })
        Add-Finding 'AST-009' ($(if ($kitInv.procTypeRefs.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'No .NET Process type reference' $true ([ordered]@{ refs = $kitInv.procTypeRefs })
        Add-Finding 'AST-010' ($(if ($kitInv.netTypeRefs.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'No .NET network type reference' $true ([ordered]@{ refs = $kitInv.netTypeRefs })

        $stateChanging = @('send', 'publish', 'mktx')
        $sendVerbs = @($kitInv.invokeCastVerbs | Where-Object { $stateChanging -contains $_ })
        Add-Finding 'RPC-001' ($(if ($sendVerbs.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'No state-changing cast verb passed to InvokeCast' $true ([ordered]@{ verbs = @($kitInv.invokeCastVerbs); stateChanging = @($sendVerbs) })
        $hasSendGuard = ($raw -match '\$argList\[0\]\s*-eq\s*"send"')
        Add-Finding 'RPC-002' ($(if ($hasSendGuard) { 'PASS' } else { 'FAIL' })) 'BLOCKER' "cast 'send' guard is present" $true ([ordered]@{ pattern = 'argList[0] -eq "send"' })
        $hasPkGuard = ($raw -match '--private-key' -and $raw -match 'forbidden')
        Add-Finding 'RPC-003' ($(if ($hasPkGuard) { 'PASS' } else { 'FAIL' })) 'BLOCKER' '--private-key guard is present' $true ([ordered]@{ pattern = '--private-key + forbidden' })
        $allowOk = ($kitInv.allowListFound -and $kitInv.allowList.Count -ge $minAllow)
        Add-Finding 'RPC-004' ($(if ($allowOk) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'RPC allow-list present and structurally parsed' $true ([ordered]@{ found = $kitInv.allowListFound; count = $kitInv.allowList.Count })
        $notListed = @($kitInv.rpcMethods | Where-Object { $kitInv.allowList -notcontains $_ })
        Add-Finding 'RPC-005' ($(if ($notListed.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Every invoked RPC method is present in the allow-list' $true ([ordered]@{ methods = @($kitInv.rpcMethods); notListed = @($notListed) })
        $rpcForbidden = @($Cfg.RpcPolicy.forbiddenPatterns)
        $sendListed = @($kitInv.allowList | Where-Object { $m = $_; @($rpcForbidden | Where-Object { $m -match $_ }).Count -gt 0 })
        Add-Finding 'RPC-006' ($(if ($sendListed.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'RPC allow-list contains no state-changing method' $true ([ordered]@{ allowList = @($kitInv.allowList); offending = @($sendListed) })
    } else {
        foreach ($rid in @('AST-001', 'AST-002', 'AST-003', 'AST-004', 'AST-005', 'AST-006', 'AST-007', 'AST-008', 'AST-009', 'AST-010', 'RPC-001', 'RPC-002', 'RPC-003', 'RPC-004', 'RPC-005', 'RPC-006')) {
            Add-Finding $rid 'INCONCLUSIVE' 'BLOCKER' "$rid (kit not analyzable)" $true ([ordered]@{ reason = 'kit-missing' })
        }
    }

    $selfInv = Get-Inventory $PSCommandPath $Cfg.Fingerprint
    Add-Finding 'SELF-001' ($(if ($selfInv.parseErrors -eq 0) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Assurance engine parses with zero syntax errors' $true ([ordered]@{ parseErrors = $selfInv.parseErrors })
    $selfOk = ($selfInv.execSites.Count -eq 0 -and $selfInv.netSites.Count -eq 0 -and $selfInv.dynamicSites.Count -eq 0)
    Add-Finding 'SELF-002' ($(if ($selfOk) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Assurance engine contains no exec/network/dynamic site' $true ([ordered]@{ exec = $selfInv.execSites.Count; net = $selfInv.netSites.Count; dyn = $selfInv.dynamicSites.Count })

    # Policy lock
    $lockPath = Join-Path $Cfg.PolicyDir 'policy-lock.json'
    $lock = Read-JsonFile $lockPath
    if ($lock) {
        $polFindings = @()
        $allOk = $true
        foreach ($e in @($lock.files)) {
            $fp = Join-Path $Cfg.PolicyDir $e.file
            if (-not (Test-Path -LiteralPath $fp)) { $allOk = $false; $polFindings += [ordered]@{ file = $e.file; status = 'MISSING' }; continue }
            $act = Get-Sha256Hex $fp
            if (Test-HashEq $act $e.sha256) { $polFindings += [ordered]@{ file = $e.file; status = 'MATCH' } } else { $allOk = $false; $polFindings += [ordered]@{ file = $e.file; status = 'MISMATCH'; expected = $e.sha256; actual = $act } }
        }
        Add-Finding 'POL-001' ($(if ($allOk) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Policy files load and match the policy lock hashes' $true ([ordered]@{ lock = (CanonicalPath $lockPath); files = $polFindings })
    } else {
        Add-Finding 'POL-001' 'BLOCKED' 'BLOCKER' 'Policy lock present' $true ([ordered]@{ path = (CanonicalPath $lockPath); reason = 'lock-missing' })
    }

    # Manifest
    if ($Cfg.Manifest -and (Test-Path -LiteralPath $Cfg.Manifest)) {
        $mEntries = @(); $mMatch = 0; $mMis = 0
        if ($Cfg.ExpectedManifestSha256) {
            $mSha = Get-Sha256Hex $Cfg.Manifest
            Add-Finding 'MAN-001' ($(if (Test-HashEq $mSha $Cfg.ExpectedManifestSha256) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Frozen manifest SHA-256 matches pre-approved value' $false ([ordered]@{ actual = $mSha; expected = $Cfg.ExpectedManifestSha256 })
        } else {
            Add-Finding 'MAN-001' 'NOT_APPLICABLE' 'MAJOR' 'Frozen manifest SHA-256 (not provided)' $false ([ordered]@{ reason = 'not-provided' })
        }
        $mBase = Split-Path -Parent (Split-Path -Parent $Cfg.Manifest)
        foreach ($row in (Get-Content -LiteralPath $Cfg.Manifest | Where-Object { $_.Trim() -ne "" })) {
            $parts = $row.Trim() -split '\s+', 2
            $exp = $parts[0]; $rel = $parts[1]
            $full = Join-Path $mBase ($rel -replace '/', '\')
            if (-not (Test-Path -LiteralPath $full)) { $mEntries += [ordered]@{ file = $rel; status = 'MISSING' }; $mMis++; continue }
            $act = Get-Sha256Hex $full
            if (Test-HashEq $act $exp) { $mEntries += [ordered]@{ file = $rel; status = 'MATCH' }; $mMatch++ } else { $mEntries += [ordered]@{ file = $rel; status = 'MISMATCH'; expected = $exp; actual = $act }; $mMis++ }
        }
        Add-Finding 'MAN-002' ($(if ($mMis -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Every frozen manifest entry matches on-disk SHA-256' $true ([ordered]@{ match = $mMatch; mismatch = $mMis; entries = $mEntries })
    } else {
        Add-Finding 'MAN-001' 'NOT_APPLICABLE' 'MAJOR' 'Frozen manifest SHA-256 (no manifest)' $false ([ordered]@{ reason = 'manifest-not-provided' })
        Add-Finding 'MAN-002' 'NOT_APPLICABLE' 'BLOCKER' 'Frozen manifest entries (no manifest)' $false ([ordered]@{ reason = 'manifest-not-provided' })
    }

    # Legacy execution surface
    $legacyHits = @()
    foreach ($lr in @($Cfg.LegacyRoots)) {
        if (-not (Test-Path -LiteralPath $lr)) { continue }
        foreach ($file in @(Get-ChildItem -LiteralPath $lr -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.ps1','.psm1' })) {
            $txt = Get-Content -LiteralPath $file.FullName -Raw
            foreach ($pat in @($Cfg.Fingerprint.legacySignaturePatterns)) {
                if ($txt -match [regex]::Escape($pat)) {
                    $legacyHits += [ordered]@{ file = (CanonicalPath $file.FullName); pattern = $pat }
                }
            }
        }
    }
    if ($Cfg.LegacyRoots.Count -eq 0) {
        Add-Finding 'LEG-001' 'NOT_APPLICABLE' 'MAJOR' 'Legacy scan (no roots configured)' $true ([ordered]@{ reason = 'no-roots' })
    } else {
        Add-Finding 'LEG-001' ($(if ($legacyHits.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'No unmitigated legacy private-key/send invocation in scanned roots' $true ([ordered]@{ roots = @($Cfg.LegacyRoots); hits = $legacyHits })
    }

    # Secret material scan
    $secretHits = @()
    foreach ($sr in @($Cfg.SecretScanRoots)) {
        if (-not (Test-Path -LiteralPath $sr)) { continue }
        foreach ($file in @(Get-ChildItem -LiteralPath $sr -Recurse -File -ErrorAction SilentlyContinue)) {
            foreach ($pat in @($Cfg.Fingerprint.secretFilePatterns)) {
                if ($file.Name -match $pat) { $secretHits += [ordered]@{ file = (CanonicalPath $file.FullName); pattern = $pat } }
            }
        }
    }
    Add-Finding 'SEC-001' ($(if ($secretHits.Count -eq 0) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'No secret material present in scanned review package' $true ([ordered]@{ roots = @($Cfg.SecretScanRoots); hits = $secretHits })

    # Bounded-claim verdict (spec sections 4/7): an unbounded or empty claim fails closed.
    Add-Finding 'CLAIM-001' ($(if (Test-BoundedClaim $pol.claim) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Report claim remains bounded (no strength claims beyond the rule set)' $true ([ordered]@{ claimSha256 = (Get-Sha256FromString $pol.claim) })

    # Documented drift map (spec rule F3): previously recorded hashes vs disk for
    # frozen review records. Deviations are RECORDED, never silently rewritten.
    $driftOk = $true; $driftFiles = @(); $driftPath = ''
    if ($Cfg.ContainsKey('Root') -and $Cfg.Root) { $driftPath = Join-Path $Cfg.Root 'verification-drift-map.json' }
    $driftMap = if ($driftPath) { Read-JsonFile $driftPath } else { $null }
    if ($driftMap) {
        foreach ($e in @($driftMap.entries)) {
            # PS 5.1 Test-Path -LiteralPath fails on '.\' path segments: normalize first.
            $p = CanonicalPath (Join-Path $Cfg.Root $e.file)
            if ([string]::IsNullOrWhiteSpace($p) -or -not (Test-Path -LiteralPath $p)) { $driftOk = $false; $driftFiles += [ordered]@{ file = $e.file; status = 'MISSING' }; continue }
            $act = Get-Sha256Hex $p
            if (Test-HashEq $act $e.currentSha256) { $driftFiles += [ordered]@{ file = $e.file; status = 'CONFIRMED'; sha256 = $act } }
            else { $driftOk = $false; $driftFiles += [ordered]@{ file = $e.file; status = 'UNEXPECTED'; expected = $e.currentSha256; actual = $act } }
        }
        Add-Finding 'EXT-001' ($(if ($driftOk) { 'PASS' } else { 'FAIL' })) 'MAJOR' 'Documented drift map confirmed against disk (frozen record history preserved, deviations documented)' $false ([ordered]@{ map = (CanonicalPath $driftPath); entries = $driftFiles })
    } else {
        Add-Finding 'EXT-001' 'NOT_APPLICABLE' 'MAJOR' 'Documented drift map (none provided)' $false ([ordered]@{ reason = 'drift-map-not-provided' })
    }

    # Coverage (POL-002)
    $catalog = @($pol.rules | ForEach-Object { $_.id })
    $emitted = @($script:Seen.Keys)
    $missing = @($catalog | Where-Object { $_ -ne 'POL-002' -and $emitted -notcontains $_ })
    foreach ($mid in $missing) {
        $sev = ($pol.rules | Where-Object { $_.id -eq $mid } | Select-Object -First 1).severity
        Add-Finding $mid 'INCONCLUSIVE' $sev "$mid (not emitted by engine)" $true ([ordered]@{ reason = 'rule-not-evaluated' })
    }
    $extra = @($emitted | Where-Object { $catalog -notcontains $_ -and $_ -ne 'META-001' -and $_ -ne 'POL-002' })
    $covOk = ($missing.Count -eq 0 -and $extra.Count -eq 0)
    Add-Finding 'POL-002' ($(if ($covOk) { 'PASS' } else { 'FAIL' })) 'BLOCKER' 'Emitted findings exactly cover the policy rule catalog' $true ([ordered]@{ missing = $missing; extra = $extra; catalogCount = $catalog.Count })

    $counts = [ordered]@{
        pass          = @($script:Findings | Where-Object { $_.status -eq 'PASS' }).Count
        fail          = @($script:Findings | Where-Object { $_.status -eq 'FAIL' }).Count
        blocked       = @($script:Findings | Where-Object { $_.status -eq 'BLOCKED' }).Count
        inconclusive  = @($script:Findings | Where-Object { $_.status -eq 'INCONCLUSIVE' }).Count
        notApplicable = @($script:Findings | Where-Object { $_.status -eq 'NOT_APPLICABLE' }).Count
        total         = $script:Findings.Count
        failClosedFailures = @($script:Findings | Where-Object { $_.failClosed -and @('FAIL', 'BLOCKED', 'INCONCLUSIVE') -contains $_.status }).Count
    }
    $blockers = @($script:Findings | Where-Object { $_.severity -eq 'BLOCKER' -and @('FAIL', 'BLOCKED', 'INCONCLUSIVE') -contains $_.status })
    $overall = if ($blockers.Count -gt 0) { 'BLOCKED' } elseif ($counts.fail -gt 0) { 'FAILED' } elseif ($counts.inconclusive -gt 0) { 'INCONCLUSIVE' } else { 'VERIFIED-READONLY-ONLY' }

    $analysis = [ordered]@{}
    if ($kitInv) {
        $analysis['commandInventory'] = @($kitInv.execSites)
        $analysis['networkInventory'] = @($kitInv.netSites)
        $analysis['dynamicSites'] = @($kitInv.dynamicSites)
        $analysis['processTypeRefs'] = @($kitInv.procTypeRefs)
        $analysis['networkTypeRefs'] = @($kitInv.netTypeRefs)
        $analysis['gitSites'] = @($kitInv.gitSites)
        $analysis['invokeCastVerbs'] = @($kitInv.invokeCastVerbs)
        $analysis['rpcMethods'] = @($kitInv.rpcMethods)
        $analysis['rpcAllowList'] = @($kitInv.allowList)
        $analysis['functions'] = @($kitInv.functionNames)
    } else {
        foreach ($k in @('commandInventory', 'networkInventory', 'dynamicSites', 'processTypeRefs', 'networkTypeRefs', 'gitSites', 'invokeCastVerbs', 'rpcMethods', 'rpcAllowList', 'functions')) { $analysis[$k] = @() }
    }
    $inputs = [ordered]@{ kitPath = (CanonicalPath $kit); kitSha256 = $kitSha; kitBytes = $kitLen; castPath = (CanonicalPath $cast); expectedCastSha256 = $Cfg.ExpectedCastSha256; manifest = (CanonicalPath $Cfg.Manifest) }

    return [pscustomobject]@{
        findings         = $script:Findings.ToArray()
        counts           = $counts
        overall          = $overall
        analysis         = $analysis
        inputs           = $inputs
        failClosedFailed = $script:FailClosedFailed
    }
}

# ---- policy loading ---------------------------------------------------------
function Load-Policies([string]$policyDir) {
    $pol = Read-JsonFile (Join-Path $policyDir 'coreguard-policy-v1.json')
    $rpc = Read-JsonFile (Join-Path $policyDir 'allowed-rpc-methods.json')
    $fp = Read-JsonFile (Join-Path $policyDir 'forbidden-execution-patterns.json')
    $roots = Read-JsonFile (Join-Path $policyDir 'trusted-tool-roots.json')
    if (-not $pol -or -not $rpc -or -not $fp -or -not $roots) { throw "policy files missing under $policyDir" }
    return [pscustomobject]@{ Policy = $pol; RpcPolicy = $rpc; Fingerprint = $fp; RootsPolicy = $roots }
}

# ---- self-test --------------------------------------------------------------
function Run-SelfTest([string]$fpPath, [string]$policyDir) {
    $tmp = Join-Path $env:TEMP ("cg41assure-selftest-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $fp = Read-JsonFile $fpPath
    $tap = New-Object System.Collections.Generic.List[string]
    $script:SelfFailed = $false
    function Assert([string]$id, [bool]$ok) {
        $tap.Add("$(if ($ok) { 'ok' } else { 'not ok' }) - $id")
        Write-Host ("[{0}] {1}" -f ($(if ($ok) { 'PASS' } else { 'FAIL' }), $id))
        if (-not $ok) { $script:SelfFailed = $true }
    }
    try {
        $base = @'
$ALLOWED_RPC = @('eth_chainId','eth_getCode','eth_call')
function RpcP($m){ if ($ALLOWED_RPC -notcontains $m){ throw 'not allowed' }; Invoke-RestMethod -Uri 'x' }
function InvokeCast([string[]]$argList){ if ($argList[0] -eq "send") { throw 'forbidden' }; if (($argList -join " ") -match "--private-key") { throw 'forbidden' }; Start-Process -FilePath 'cast' }
RpcP 'eth_chainId'
InvokeCast @('wallet','address')
'@
        $f1 = New-Fixture $tmp "clean.ps1" $base
        $i = Get-Inventory $f1 $fp
        Assert "ST1-clean-parse" ($i.parseErrors -eq 0)
        Assert "ST2-clean-no-dynamic" ($i.dynamicSites.Count -eq 0)
        Assert "ST3-clean-allowlist-3" ($i.allowList.Count -eq 3)
        Assert "ST4-clean-exec-1-net-1" ($i.execSites.Count -eq 1 -and $i.netSites.Count -eq 1)
        Assert "ST5-clean-startprocess-owner" ((@($i.execSites | Where-Object { $_.owner -eq 'InvokeCast' })).Count -eq 1)

        $f2 = New-Fixture $tmp "send.ps1" ($base + "`nInvokeCast @('send','x')`n")
        $i = Get-Inventory $f2 $fp
        Assert "ST6-send-verb-detected" ($i.invokeCastVerbs -contains 'send')

        $f3 = New-Fixture $tmp "rpc.ps1" ($base + "`nRpcP 'eth_sendRawTransaction'`n")
        $i = Get-Inventory $f3 $fp
        Assert "ST7-unlisted-rpc-detected" ((@($i.rpcMethods | Where-Object { $i.allowList -notcontains $_ })).Count -eq 1)

        $f4 = New-Fixture $tmp "empty.ps1" "`$ALLOWED_RPC = @()`n"
        $i = Get-Inventory $f4 $fp
        Assert "ST8-empty-allowlist-detected" ($i.allowListFound -and $i.allowList.Count -eq 0)

        $f5 = New-Fixture $tmp "dyn.ps1" "`$c = 'Get-Date'`n& `$c`n"
        $i = Get-Inventory $f5 $fp
        Assert "ST9-dynamic-invocation-detected" ($i.dynamicSites.Count -ge 1)

        $f6 = New-Fixture $tmp "dyn2.ps1" "`$b = [Convert]::FromBase64String('AAAA')`n"
        $i = Get-Inventory $f6 $fp
        Assert "ST10-frombase64-detected" ($i.dynamicSites.Count -ge 1)

        $f7 = New-Fixture $tmp "dyn3.ps1" "`$sb = [scriptblock]::Create('x')`n"
        $i = Get-Inventory $f7 $fp
        Assert "ST11-scriptblock-create-detected" ($i.dynamicSites.Count -ge 1)

        $f8 = New-Fixture $tmp "net.ps1" "`$w = New-Object System.Net.WebClient`n"
        $i = Get-Inventory $f8 $fp
        Assert "ST12-net-type-detected" ($i.netTypeRefs.Count -ge 1)

        $f9 = New-Fixture $tmp "git.ps1" "git -C `$r push origin main`n"
        $i = Get-Inventory $f9 $fp
        $bad = @($i.gitSites | Where-Object { @($_.tokens | Where-Object { @($fp.forbiddenGitVerbs) -contains $_ }).Count -gt 0 })
        Assert "ST13-forbidden-git-detected" ($bad.Count -eq 1)

        $f10 = New-Fixture $tmp "iex.ps1" "Invoke-Expression 'x'`n"
        $i = Get-Inventory $f10 $fp
        Assert "ST14-invoke-expression-detected" ((@($i.execSites | Where-Object { $_.command -eq 'Invoke-Expression' })).Count -eq 1)

        $script:Findings = New-Object System.Collections.Generic.List[object]
        $script:Seen = @{}
        Add-Finding "ST15-dup" 'PASS' 'INFO' 'dup probe' $false ([ordered]@{}) | Out-Null
        Add-Finding "ST15-dup" 'PASS' 'INFO' 'dup probe' $false ([ordered]@{}) | Out-Null
        Assert "ST15-duplicate-id-guard" ((@($script:Findings | Where-Object { $_.id -eq 'META-001' })).Count -eq 1)

        $pol = Read-JsonFile (Join-Path $policyDir 'coreguard-policy-v1.json')
        Assert "ST16-policy-loads" ($null -ne $pol -and @($pol.rules).Count -ge 25)

        # v2.0.0 additions
        Assert "ST17-bounded-claim-accepts-spec-claim" (Test-BoundedClaim $pol.claim)
        Assert "ST18-bounded-claim-rejects-strength-claims" (-not (Test-BoundedClaim 'The tool proves absence of every broadcast path. It guarantees no broadcast path exists. NOT a proof of absence of such a path.'))
        $script:Findings = New-Object System.Collections.Generic.List[object]
        $script:Seen = @{}
        $ih = Get-InputHashes @{ KitPath = $f1; CastPath = (Join-Path $tmp 'nope.exe'); Manifest = ''; PolicyDir = $policyDir }
        Assert "ST19-input-hashes-shape-and-determinism" ((@($ih).Count -ge 6) -and (@($ih | Where-Object { $_.role -eq 'kit' }).Count -eq 1) -and (Test-HashEq $ih[0].sha256 (Get-Sha256Hex $f1)))
        $driftBanned = @('skipped', 'warn')
        $polStatuses = @($pol.statusValues | ForEach-Object { $_.ToLowerInvariant() })
        Assert "ST20-forbidden-statuses-absent-from-policy" (@($polStatuses | Where-Object { $driftBanned -contains $_ }).Count -eq 0)
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    return [pscustomobject]@{ tap = $tap; failed = $script:SelfFailed }
}

# ---- negative suite ---------------------------------------------------------
function Run-NegativeSuite([string]$fpPath, [string]$policyDir, [hashtable]$Real, [object]$Policies) {
    $tmp = Join-Path $env:TEMP ("cg41assure-neg-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $fp = Read-JsonFile $fpPath
    $results = New-Object System.Collections.Generic.List[object]
    $base = @'
$ALLOWED_RPC = @('eth_chainId','eth_getCode','eth_call')
function RpcP($m){ if ($ALLOWED_RPC -notcontains $m){ throw 'not allowed' }; Invoke-RestMethod -Uri 'x' }
function InvokeCast([string[]]$argList){ if ($argList[0] -eq "send") { throw 'forbidden' }; if (($argList -join " ") -match "--private-key") { throw 'forbidden' }; Start-Process -FilePath 'cast' }
RpcP 'eth_chainId'
InvokeCast @('wallet','address')
'@
    function FixtureCfg([string]$kitPath, [switch]$NoManifest) {
        $sha = Get-Sha256Hex $kitPath
        $b = (Get-Item -LiteralPath $kitPath).Length
        $c = @{
            Policy = $Policies.Policy; RpcPolicy = $Policies.RpcPolicy; Fingerprint = $Policies.Fingerprint; RootsPolicy = $Policies.RootsPolicy
            PolicyDir = $policyDir; KitPath = $kitPath; ExpectedKitSha256 = $sha; ExpectedKitBytes = $b
            CastPath = $Real.CastPath; ExpectedCastSha256 = $Real.ExpectedCastSha256
            Manifest = ''; ExpectedManifestSha256 = ''; LegacyRoots = @(); SecretScanRoots = @()
            ExpectStartProcess = 1; ExpectGitSites = 0; ExpectNetSites = 1
        }
        return $c
    }
    function Record([string]$id, [string]$expectRule, $run, [bool]$expectFail) {
        $f = @($run.findings | Where-Object { $_.id -eq $expectRule } | Select-Object -First 1)
        $status = if ($f.Count -gt 0) { $f[0].status } else { 'ABSENT' }
        $ok = if ($expectFail) { $status -ne 'PASS' } else { $status -eq 'PASS' }
        [void]$results.Add([pscustomobject]@{ scenario = $id; rule = $expectRule; status = $status; failClosedObserved = $ok })
        Write-Host ("[{0}] {1} -> {2} : {3}" -f ($(if ($ok) { 'ok' } else { 'not-ok' }), $id, $expectRule, $status))
    }

    try {
        # 1 tampered kit
        $tk = New-Fixture $tmp "tampered.ps1" ($base -replace 'throw ''forbidden''', 'throw ''allowed''')
        $c = FixtureCfg $tk; $c.ExpectedKitSha256 = $Real.ExpectedKitSha256
        Record "NEG-tampered-kit" 'INV-003' (Invoke-Assurance $c) $true
        # 2 send verb
        $sk = New-Fixture $tmp "send.ps1" ($base + "`nInvokeCast @('send','x')`n")
        Record "NEG-send-verb" 'RPC-001' (Invoke-Assurance (FixtureCfg $sk)) $true
        # 3 unlisted rpc
        $rk = New-Fixture $tmp "rpc.ps1" ($base + "`nRpcP 'eth_sendRawTransaction'`n")
        Record "NEG-unlisted-rpc" 'RPC-005' (Invoke-Assurance (FixtureCfg $rk)) $true
        # 4 empty allowlist
        $ek = New-Fixture $tmp "empty.ps1" "`$ALLOWED_RPC = @()`nfunction RpcP(`$m){ if (`$ALLOWED_RPC -notcontains `$m){ throw 'x' } }`n"
        Record "NEG-empty-allowlist" 'RPC-004' (Invoke-Assurance (FixtureCfg $ek)) $true
        # 5 dynamic invocation
        $dk = New-Fixture $tmp "dyn.ps1" ($base + "`n`$c = 'Get-Date'; & `$c`n")
        Record "NEG-dynamic-invocation" 'AST-001' (Invoke-Assurance (FixtureCfg $dk)) $true
        # 6 forbidden git verb
        $gk = New-Fixture $tmp "git.ps1" ($base + "`ngit push origin main`n")
        Record "NEG-forbidden-git" 'AST-006' (Invoke-Assurance (FixtureCfg $gk)) $true
        # 7 missing cast
        $c = FixtureCfg (New-Fixture $tmp "ok.ps1" $base); $c.CastPath = (Join-Path $tmp 'nope.exe')
        Record "NEG-missing-cast" 'ENV-001' (Invoke-Assurance $c) $true
        # 8 wrong cast hash
        $c = FixtureCfg (New-Fixture $tmp "ok2.ps1" $base); $c.ExpectedCastSha256 = '0xdead'
        Record "NEG-wrong-cast-hash" 'ENV-002' (Invoke-Assurance $c) $true
        # 9 wrong manifest hash
        $c = FixtureCfg (New-Fixture $tmp "ok3.ps1" $base); $c.Manifest = $Real.Manifest; $c.ExpectedManifestSha256 = '0xdead'
        Record "NEG-wrong-manifest-hash" 'MAN-001' (Invoke-Assurance $c) $true
        # 10 missing policy lock
        $badPol = Join-Path $tmp 'policy'; New-Item -ItemType Directory -Path $badPol | Out-Null
        Copy-Item (Join-Path $policyDir '*') $badPol
        Remove-Item (Join-Path $badPol 'policy-lock.json') -Force
        $c = FixtureCfg (New-Fixture $tmp "ok4.ps1" $base); $c.PolicyDir = $badPol
        Record "NEG-missing-policy-lock" 'POL-001' (Invoke-Assurance $c) $true
        # 11 duplicate id guard
        $script:Findings = New-Object System.Collections.Generic.List[object]; $script:Seen = @{}
        Add-Finding 'NEG-dup' 'PASS' 'INFO' 'x' $false ([ordered]@{}) | Out-Null
        Add-Finding 'NEG-dup' 'PASS' 'INFO' 'x' $false ([ordered]@{}) | Out-Null
        $dup = @($script:Findings | Where-Object { $_.id -eq 'META-001' }).Count
        [void]$results.Add([pscustomobject]@{ scenario = 'NEG-duplicate-id'; rule = 'META-001'; status = $(if ($dup -eq 1) { 'FAIL' } else { 'ABSENT' }); failClosedObserved = ($dup -eq 1) })
        Write-Host ("[{0}] NEG-duplicate-id -> META-001 : {1}" -f ($(if ($dup -eq 1) { 'ok' } else { 'not-ok' }), $dup))

        # ---- v2.0.0 negative scenarios (12-17) ----
        # 12 legacy private-key in the target kit
        $lk = New-Fixture $tmp "legacy.ps1" ($base + "`n# cast send --private-key 'x'`n")
        $c = FixtureCfg $lk; $c.LegacyRoots = @($tmp)
        $run = Invoke-Assurance $c
        $f = @($run.findings | Where-Object { $_.id -eq 'LEG-001' } | Select-Object -First 1)
        $ownHit = $f -and @($f.evidence.hits | Where-Object { (Split-Path -Leaf $_.file) -eq 'legacy.ps1' }).Count -gt 0
        [void]$results.Add([pscustomobject]@{ scenario = 'NEG-legacy-pk-in-kit'; rule = 'LEG-001'; status = $f.status; failClosedObserved = ($f.status -ne 'PASS' -and $ownHit) })
        Write-Host ("[{0}] NEG-legacy-pk-in-kit -> LEG-001 : {1}" -f ($(if ($ownHit) { 'ok' } else { 'not-ok' }), $f.status))
        # 13 secret file in the review package
        $secDir = Join-Path $tmp 'pkg'; New-Item -ItemType Directory -Path $secDir | Out-Null
        [IO.File]::WriteAllText((Join-Path $secDir 'cg-anchor.pass'), 'x', [Text.UTF8Encoding]::new($false))
        $c = FixtureCfg (New-Fixture $tmp "ok5.ps1" $base); $c.SecretScanRoots = @($secDir)
        Record "NEG-secret-file" 'SEC-001' (Invoke-Assurance $c) $true
        # 14 tampered drift map
        $realRoot = $Root; $driftPath = Join-Path $realRoot 'verification-drift-map.json'
        if (Test-Path -LiteralPath $driftPath) {
            $c = FixtureCfg (New-Fixture $tmp "ok6.ps1" $base); $c.Root = $realRoot
            $bak = Get-Content -LiteralPath $driftPath -Raw
            $tampered = $bak -replace [regex]::Escape('0x168bae9d78658a330b45da97837ef007065e31e462309a069c9584b775ad9dcb'), '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
            [IO.File]::WriteAllText($driftPath, $tampered, [Text.UTF8Encoding]::new($false))
            $run = Invoke-Assurance $c
            [IO.File]::WriteAllText($driftPath, $bak, [Text.UTF8Encoding]::new($false))
            Record "NEG-tampered-drift-map" 'EXT-001' $run $true
        }
        # 15 missing drift map
        $c = FixtureCfg (New-Fixture $tmp "ok7.ps1" $base); $c.Root = $tmp
        Record "NEG-missing-drift-map" 'EXT-001' (Invoke-Assurance $c) $true
        # 16 unbounded claim rejected
        $bad = $Policies.Policy.claim -replace [regex]::Escape('This is NOT a proof of absence of such a path.'), ''
        $c = FixtureCfg (New-Fixture $tmp "ok8.ps1" $base); $c.Policy = ($Policies.Policy | ConvertTo-Json -Depth 8 | ConvertFrom-Json); $c.Policy.claim = $bad
        $run = Invoke-Assurance $c
        $f = @($run.findings | Where-Object { $_.id -eq 'CLAIM-001' } | Select-Object -First 1)
        if (-not $f) { $f = [pscustomobject]@{ id = 'CLAIM-001'; status = 'ABSENT' } }
        [void]$results.Add([pscustomobject]@{ scenario = 'NEG-unbounded-claim'; rule = 'CLAIM-001'; status = $f.status; failClosedObserved = ($f.status -eq 'FAIL') })
        Write-Host ("[{0}] NEG-unbounded-claim -> CLAIM-001 : {1}" -f ($(if ($f.status -eq 'FAIL') { 'ok' } else { 'not-ok' }), $f.status))
        # 17 report integrity: mutated summary rejected by validator (schema role)
        $tmpReport = Join-Path $tmp 'mutated-report.json'
        $realReport = Join-Path $Root 'release\verification-report.json'
        $valOk = $false
        if (Test-Path -LiteralPath $realReport) {
            Copy-Item -LiteralPath $realReport -Destination $tmpReport -Force
            $j = Get-Content -LiteralPath $tmpReport -Raw | ConvertFrom-Json
            $j.summary.pass = $j.summary.pass + 1
            [IO.File]::WriteAllText($tmpReport, ($j | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
            $nodeScript = Join-Path (Split-Path -Parent $PSCommandPath) 'validate-report.mjs'
            & node $nodeScript $tmpReport 2> $null | Out-Null
            $valOk = ($LASTEXITCODE -eq 1)
        }
        [void]$results.Add([pscustomobject]@{ scenario = 'NEG-mutated-summary-rejected'; rule = 'SCHEMA-001'; status = $(if ($valOk) { 'FAIL' } else { 'ABSENT' }); failClosedObserved = $valOk })
        Write-Host ("[{0}] NEG-mutated-summary-rejected -> validator exit 1" -f ($(if ($valOk) { 'ok' } else { 'not-ok' })))
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    $allOk = (@($results | Where-Object { -not $_.failClosedObserved }).Count -eq 0)
    return [pscustomobject]@{ results = $results.ToArray(); allFailClosed = $allOk }
}

# ============================================================================
# MAIN
# ============================================================================
if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent $PSCommandPath) }
# v2.0.0 root self-check: the engine MUST live in <Root>/verification; abort otherwise (layout tamper guard).
if ((CanonicalPath $PSCommandPath) -notlike ((CanonicalPath (Join-Path $Root 'verification')) + '*')) {
    Write-Host "[ABORT] layout self-check failed: engine is not under <Root>/verification (Root=$Root)"
    exit 1
}
$policyDir = Join-Path $Root 'policy'
if (-not $OutDir) { $OutDir = Join-Path $Root 'release' }
$fpPath = Join-Path $policyDir 'forbidden-execution-patterns.json'
$kitDefault = Join-Path (Split-Path -Parent $Root) 'reviews-extra\cg41-c9-c7-closure-kit.ps1'
$manDefault = Join-Path (Split-Path -Parent $Root) 'coreguard\reviews\gate-4.1-final-hashes.txt'

if ($SelfTest) {
    $r = Run-SelfTest $fpPath $policyDir
    $tapPath = Join-Path $OutDir 'selftest.tap'
    [IO.File]::WriteAllText($tapPath, (($r.tap -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    ""
    "TAP: $tapPath"
    "checks: $($r.tap.Count); failures: $(@($r.tap | Where-Object { $_ -like 'not ok*' }).Count)"
    exit $(if ($r.failed) { 1 } else { 0 })
}

# Self-check of an existing report (spec section 3: the tool validates its own output,
# without giving itself permission): independent Node validator + semantic cross-checks.
if ($SelfCheckReport) {
    $reportPath = Join-Path $OutDir 'verification-report.json'
    if (-not (Test-Path -LiteralPath $reportPath)) { Write-Host "[ABORT] no report at $reportPath"; exit 1 }
    $r = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    $recomputed = [ordered]@{
        pass          = @($r.findings | Where-Object { $_.status -eq 'PASS' }).Count
        fail          = @($r.findings | Where-Object { $_.status -eq 'FAIL' }).Count
        blocked       = @($r.findings | Where-Object { $_.status -eq 'BLOCKED' }).Count
        inconclusive  = @($r.findings | Where-Object { $_.status -eq 'INCONCLUSIVE' }).Count
        notApplicable = @($r.findings | Where-Object { $_.status -eq 'NOT_APPLICABLE' }).Count
        total         = @($r.findings).Count
    }
    $ids = @($r.findings | ForEach-Object { $_.id })
    $dupIds = @($ids | Group-Object | Where-Object { $_.Count -gt 1 })
    $ok = $true
    foreach ($k in @('pass','fail','blocked','inconclusive','notApplicable','total')) {
        if ([int]$r.summary.$k -ne [int]$recomputed.$k) { $ok = $false; Write-Host "[FAIL] SCHEMA-001 summary.$k=$($r.summary.$k) != recomputed $($recomputed.$k)" }
    }
    if (@($dupIds).Count -gt 0) { $ok = $false; Write-Host "[FAIL] META-001 duplicate ids: $($dupIds.Name -join ', ')" }
    $blockers = @($r.findings | Where-Object { $_.severity -eq 'BLOCKER' -and @('FAIL','BLOCKED','INCONCLUSIVE') -contains $_.status })
    if ($blockers.Count -gt 0 -and $r.status -ne 'BLOCKED') { $ok = $false; Write-Host "[FAIL] SCHEMA-001 status $($r.status) with $($blockers.Count) failing blockers" }
    $claimOk = Test-BoundedClaim $r.claim
    if (-not $claimOk) { $ok = $false; Write-Host "[FAIL] CLAIM-001 bounded-claim check" }
    foreach ($f in @($r.findings)) {
        if ($f.evidence -eq $null -or ($f.evidence.PSObject.Properties | Measure-Object).Count -eq 0) { $ok = $false; Write-Host "[FAIL] M7 empty evidence on $($f.id)" }
    }
    $nodeScript = Join-Path (Split-Path -Parent $PSCommandPath) 'validate-report.mjs'
    if (Test-Path -LiteralPath $nodeScript) {
        node $nodeScript $reportPath
        if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Host "[FAIL] validate-report.mjs exit $LASTEXITCODE" }
    } else {
        Write-Host "[WARN] validate-report.mjs not found; structural validation skipped (this run is not certifiable)"
    }
    ""
    "self-check: $(if ($ok) { 'PASS' } else { 'FAIL' }) (summary recomputed: pass=$($recomputed.pass) fail=$($recomputed.fail) blocked=$($recomputed.blocked) inconclusive=$($recomputed.inconclusive) na=$($recomputed.notApplicable) total=$($recomputed.total); dupIds=$(@($dupIds).Count); boundedClaim=$claimOk)"
    exit $(if ($ok) { 0 } else { 1 })
}

$Policies = Load-Policies $policyDir
if ($NegativeSuite) {
    $Real = @{ CastPath = $CastPath; ExpectedCastSha256 = $ExpectedCastSha256; Manifest = $Manifest }
    $neg = Run-NegativeSuite $fpPath $policyDir $Real $Policies
    $np = Join-Path $OutDir 'negative-tests.json'
    [IO.File]::WriteAllText($np, ($neg | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    ""
    "negative suite: $(@($neg.results).Count) scenarios; allFailClosed=$($neg.allFailClosed)"
    exit $(if ($neg.allFailClosed) { 0 } else { 1 })
}

# release / standard run
if (-not $Kit) { $Kit = $kitDefault }
if (-not $Manifest) { $Manifest = $manDefault }
$legacy = @($LegacyRoots)
if ($legacy.Count -eq 0) { $legacy = @((Join-Path (Split-Path -Parent $Root) 'coreguard\scripts'), (Join-Path (Split-Path -Parent $Root) 'scripts')) }
$secrets = @($SecretScanRoots)
if ($secrets.Count -eq 0) { $secrets = @($Root) }

$realCfg = @{
    Root = $Root
    Policy = $Policies.Policy; RpcPolicy = $Policies.RpcPolicy; Fingerprint = $Policies.Fingerprint; RootsPolicy = $Policies.RootsPolicy
    PolicyDir = $policyDir; KitPath = $Kit; ExpectedKitSha256 = $ExpectedKitSha256; ExpectedKitBytes = $ExpectedKitBytes
    CastPath = $CastPath; ExpectedCastSha256 = $ExpectedCastSha256; Manifest = $Manifest; ExpectedManifestSha256 = $ExpectedManifestSha256
    LegacyRoots = $legacy; SecretScanRoots = $secrets
}
$run = Invoke-Assurance $realCfg

$dateUtc = (Get-Date).ToUniversalTime().ToString("o")
$report = [ordered]@{
    tool = $script:ToolName
    toolVersion = $script:ToolVersion
    schemaVersion = $script:SchemaVersion
    supersedesVersion = $script:SupersedesVersion
    ruleVersion = 'cg41-policy-v1'
    policyVersion = $Policies.Policy.version
    policyId = $Policies.Policy.policyId
    gate = $Policies.Policy.gate
    dateUtc = $dateUtc
    status = $run.overall
    decision = 'CONDITIONAL NO-GO'
    claim = $Policies.Policy.claim
    stages = $Policies.Policy.stages
    summary = $run.counts
    inputs = $run.inputs
    inputHashes = (Get-InputHashes $realCfg)
    findings = @($run.findings)
    analysis = $run.analysis
    failClosedFailed = $run.failClosedFailed
    authorization = [ordered]@{
        signing = 'NOT AUTHORIZED'
        commitIntent = 'NOT AUTHORIZED'
        anchorProof = 'NOT AUTHORIZED'
        mainnetBroadcast = 'NOT AUTHORIZED'
    }
}
$reportPath = Join-Path $OutDir 'verification-report.json'
# M5 supersedes guard: a report from another engine version is archived byte-identically
# before any overwrite; a report from a NEWER engine is never overwritten (fail-closed).
if (Test-Path -LiteralPath $reportPath) {
    $prevTool = $null
    try { $prev = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json; if ($prev -and $prev.toolVersion) { $prevTool = [string]$prev.toolVersion } } catch { $prevTool = $null }
    if ($prevTool -and ($prevTool -ne $script:ToolVersion)) {
        if ([version]$script:ToolVersion -lt [version]$prevTool) {
            Write-Host "[ABORT] M5 supersedes guard: refusing to overwrite report from newer engine $prevTool with $($script:ToolVersion)"
            exit 1
        }
        $archDir = Join-Path $OutDir 'archive'
        New-Item -ItemType Directory -Path $archDir -Force | Out-Null
        Copy-Item -LiteralPath $reportPath -Destination (Join-Path $archDir "verification-report.v$prevTool.json") -Force
        # NOTE: v1.0.0 emitted no selftest.tap/negative-tests.json; those outputs are archived
        # separately as .v1.0.0 files (see release/archive/). This loop archives only the report
        # for correct supersedes provenance.
        foreach ($auxName in @()) {
            $ap = Join-Path $OutDir $auxName[0]
            if (Test-Path -LiteralPath $ap) { Copy-Item -LiteralPath $ap -Destination (Join-Path $archDir ("{0}.v{1}.{2}" -f $auxName[1], $prevTool, ($auxName[0] -split '\.')[-1])) -Force }
        }
        Write-Host "[M5] previous $prevTool outputs archived byte-identically under archive/ before overwrite"
    }
}
[IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))

if ($Release) {
    # NOTE: do not name this variable '$selftest' - it would collide (case-insensitively)
    # with the [switch]$SelfTest script parameter and throw a SwitchParameter cast error.
    $selfTestResult = Run-SelfTest $fpPath $policyDir
    [IO.File]::WriteAllText((Join-Path $OutDir 'selftest.tap'), (($selfTestResult.tap -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    $Real = @{ CastPath = $CastPath; ExpectedCastSha256 = $ExpectedCastSha256; Manifest = $Manifest }
    $neg = Run-NegativeSuite $fpPath $policyDir $Real $Policies
    [IO.File]::WriteAllText((Join-Path $OutDir 'negative-tests.json'), ($neg | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))

    $rows = ""
    foreach ($f in @($run.findings)) {
        $sev = $f.severity; $st = $f.status
        $cls = switch ($st) { 'PASS' { 'ok' } 'FAIL' { 'bad' } 'BLOCKED' { 'blk' } 'INCONCLUSIVE' { 'inc' } default { 'na' } }
        $ev = ($f.evidence | ConvertTo-Json -Depth 6 -Compress)
        $rows += "<tr class='$cls'><td>$($f.id)</td><td>$st</td><td>$sev</td><td>$(Html-Encode $f.description)</td><td class='ev'>$(Html-Encode $ev)</td></tr>`n"
    }
    $targets = @(
        @{ name = 'verification-report.json'; path = $reportPath }
        @{ name = 'selftest.tap'; path = (Join-Path $OutDir 'selftest.tap') }
        @{ name = 'negative-tests.json'; path = (Join-Path $OutDir 'negative-tests.json') }
    )
    $hashRows = ""
    foreach ($tp in $targets) { $hashRows += "<tr><td>$($tp.name)</td><td class='mono'>$(Get-Sha256Hex $tp.path)</td></tr>`n" }

    $html = @'
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>CoreGuard Gate 4.1 - Assurance Dashboard</title>
<style>
body{font-family:Consolas,Menlo,monospace;background:#0e1116;color:#d7dde5;margin:0;padding:24px}
h1,h2{color:#9ecbff} .banner{padding:16px;border-radius:8px;background:#3a1416;border:1px solid #a33;color:#ffb3b3;font-size:20px;font-weight:bold}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 16px}
.card .n{font-size:24px;font-weight:bold}.ok{color:#3fb950}.bad{color:#f85149}.blk{color:#d29922}.inc{color:#db6d28}.na{color:#8b949e}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #30363d;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#161b22}.mono{font-family:Consolas,monospace;font-size:12px;word-break:break-all}.ev{font-size:11px;color:#8b949e;max-width:520px}
tr.bad td{background:#2d1416}tr.blk td{background:#2a2410}tr.inc td{background:#2a1d10}
button{background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
.small{color:#8b949e;font-size:12px}.timeline li{margin:4px 0}
</style></head><body>
<h1>CoreGuard Gate 4.1 &mdash; Assurance Dashboard</h1>
<div class="banner">DECISION: {{DECISION}} &nbsp;|&nbsp; STATUS: {{STATUS}}</div>
<div class="cards">
<div class="card"><div class="small">PASS</div><div class="n ok">{{PASS}}</div></div>
<div class="card"><div class="small">FAIL</div><div class="n bad">{{FAIL}}</div></div>
<div class="card"><div class="small">BLOCKED</div><div class="n blk">{{BLOCKED}}</div></div>
<div class="card"><div class="small">INCONCLUSIVE</div><div class="n inc">{{INCONC}}</div></div>
<div class="card"><div class="small">N/A</div><div class="n na">{{NA}}</div></div>
<div class="card"><div class="small">FAIL-CLOSED FAILURES</div><div class="n bad">{{FCFAIL}}</div></div>
</div>
<p class="small">Tool {{TOOLVER}} &middot; Schema {{SCHEMAVER}} &middot; Rule {{RULEVER}} &middot; Policy {{POLICYVER}} &middot; Gate {{GATE}} &middot; UTC {{DATE}}</p>
<p class="small">Freeze discipline: frozen artifacts are read-only; findings are append-only; this page exposes evidence only &mdash; it has no execution controls.</p>
<p><b>Claim.</b> <span class="small">{{CLAIM}}</span></p>
<h2>Authorization</h2>
<p class="bad">Signing: {{AUTH_SIGN}} &middot; commitIntent: {{AUTH_COMMIT}} &middot; anchorProof: {{AUTH_ANCHOR}} &middot; Broadcast: {{AUTH_BC}}</p>
<h2>Findings</h2>
<table><thead><tr><th>ID</th><th>Status</th><th>Severity</th><th>Description</th><th>Evidence</th></tr></thead>
<tbody>{{ROWS}}</tbody></table>
<h2>Manifest Hash</h2>
<table><thead><tr><th>File</th><th>SHA-256</th></tr></thead><tbody>{{HASHROWS}}</tbody></table>
<h2>Timeline</h2><ul class="timeline">
<li>gate-4.1 verifier v1 (regex) &mdash; superseded</li>
<li>gate-4.1 verifier v2 (AST) &mdash; frozen review artifact</li>
<li><b>assurance engine v{{TOOLVER}}</b> policy-driven structured findings</li>
<li>Assurance Spec v1 + engine 2.0.0: inputHashes, drift map (EXT-001), supersedes guard (M5), report self-check</li>
<li>Next: independent C8 review &rarr; C7 closure &rarr; C9 owner authorization</li>
</ul>
<button onclick="navigator.clipboard.writeText(document.getElementById('evdump').textContent)">Copy evidence JSON</button>
<pre id="evdump" style="display:none">{{REPORTJSON}}</pre>
</body></html>
'@
    $html = $html.Replace('{{DECISION}}', $report.decision).Replace('{{STATUS}}', $run.overall)
    $html = $html.Replace('{{PASS}}', "$($run.counts.pass)").Replace('{{FAIL}}', "$($run.counts.fail)").Replace('{{BLOCKED}}', "$($run.counts.blocked)").Replace('{{INCONC}}', "$($run.counts.inconclusive)").Replace('{{NA}}', "$($run.counts.notApplicable)").Replace('{{FCFAIL}}', "$($run.counts.failClosedFailures)")
    $html = $html.Replace('{{TOOLVER}}', $script:ToolVersion).Replace('{{SCHEMAVER}}', $script:SchemaVersion).Replace('{{RULEVER}}', 'cg41-policy-v1').Replace('{{POLICYVER}}', $Policies.Policy.version).Replace('{{GATE}}', $Policies.Policy.gate).Replace('{{DATE}}', $dateUtc)
    $html = $html.Replace('{{CLAIM}}', $Policies.Policy.claim)
    $html = $html.Replace('{{AUTH_SIGN}}', 'NOT AUTHORIZED').Replace('{{AUTH_COMMIT}}', 'NOT AUTHORIZED').Replace('{{AUTH_ANCHOR}}', 'NOT AUTHORIZED').Replace('{{AUTH_BC}}', 'NOT AUTHORIZED')
    $html = $html.Replace('{{ROWS}}', $rows).Replace('{{HASHROWS}}', $hashRows)
    $html = $html.Replace('{{REPORTJSON}}', ($report | ConvertTo-Json -Depth 12))
    [IO.File]::WriteAllText((Join-Path $OutDir 'verification-report.html'), $html, [Text.UTF8Encoding]::new($false))

    $mfFiles = @('verification-report.json', 'verification-report.html', 'selftest.tap', 'negative-tests.json')
    $mfEntries = @()
    foreach ($mf in $mfFiles) {
        $p = Join-Path $OutDir $mf
        if (Test-Path -LiteralPath $p) { $mfEntries += [ordered]@{ file = $mf; sha256 = (Get-Sha256Hex $p); bytes = (Get-Item -LiteralPath $p).Length } }
    }
    $manifestObj = [ordered]@{ release = 'coreguard-assurance-4.2.1'; schemaVersion = $script:SchemaVersion; generatedUtc = $dateUtc; toolVersion = $script:ToolVersion; supersedesVersion = $script:SupersedesVersion; ruleVersion = 'cg41-policy-v1'; nonCircular = $true; freezeNote = '4.2.1 = 2.0.0 logic frozen + release re-issued after last engine edit; all evidence regenerated after freeze per owner directive'; files = $mfEntries }
    [IO.File]::WriteAllText((Join-Path $OutDir 'manifest.json'), ($manifestObj | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $OutDir 'manifest.sha256'), (Get-Sha256Hex (Join-Path $OutDir 'manifest.json')), [Text.UTF8Encoding]::new($false))
}

""
"report: $reportPath"
"status: $($run.overall)"
"summary: pass=$($run.counts.pass) fail=$($run.counts.fail) blocked=$($run.counts.blocked) inconclusive=$($run.counts.inconclusive) na=$($run.counts.notApplicable) failClosedFailures=$($run.counts.failClosedFailures)"
exit $(if ($run.failClosedFailed) { 1 } else { 0 })
