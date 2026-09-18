# GATE 4.1 BROADCAST -- commitIntent, Core Mainnet 1116. SEPARATE GATE (isolated from preflight).
# THIS IS THE ONLY FILE IN WHICH broadcast is allowed. It re-verifies EVERYTHING live at run time,
# NEVER reuses archived signature/calldata/digest/validUntil, and requires an explicit typed
# confirmation before the single cast send. Nothing here runs unless the owner explicitly executes
# this file after an independent review; execution is a separate decision from reviewing it.
#
# SAFETY CONTRACT
#   - One broadcast call only, guarded by an in-run approval flag set exclusively after:
#        (A) all live checks pass (chainId, code, registry, intentId free, digest, signature length),
#        (B) ABI re-derived from the pinned source each run and equal to pinned constants,
#        (C) fresh signed eth_call returns exactly 0x (no revert),
#        (D) eth_estimateGas succeeds and cost <= balance with margin (BigInteger, no saturation),
#        (E) user types the exact confirmation string printed by the preview block.
#   - THE PRIVATE KEY IS NEVER USED IN THIS FILE. Signing is done through a cast keystore imported
#     interactively by the OWNER (`cast wallet import <name> --interactive`); the script derives the
#     keystore address, requires it to equal the canonical signer, and signs with `--account` +
#     `--password-file` (argv contains only a file path, never a key and never the passphrase).
#     Failure paths never echo arguments or environment.
#   - No fallback to stale values: intentId/intentCommitment are read from gate-4.0 evidence only;
#     validUntil/digest/signature/calldata are freshly computed THIS run and asserted to differ from
#     the archived preflight values (anti-reuse). No stored calldata is ever read.
#   - Post-send verification (receipt status=1, correct logs, on-chain readback) MUST pass before
#     evidence is written. Evidence NEVER contains the private key, the signature, or raw calldata.
#   - Any failure before the send aborts with NO evidence and NO transaction. ANY failure after the
#     txHash is known writes a RECOVERY record (txHash, failure phase, receipt state) marking
#     recoveryRequired=true; the gate NEVER automatically resends and NEVER assumes the intent is
#     still free after a failed send (the authoritative check is the contract's AlreadyCommitted
#     revert inside commitIntent itself).
#
# ABI / EVENT PROOF (pinned from contracts\EvidenceRegistryV2.sol, see gate review report)
#   - event IntentCommitted(bytes32 indexed intentId, bytes32 indexed intentCommitment,
#                          address indexed signer, uint256 validUntil, uint256 chainId,
#                          uint256 timestamp)
#       topics[0] = keccak(event canonical sig) ; topics[1] = intentId (first indexed arg)
#       topics[2] = intentCommitment           ; topics[3] = signer
#   - function commitIntent(bytes32,bytes32,address,uint256,bytes)   selector 0x4fd0505d
#   - function commitIntentDigest(bytes32,bytes32,uint256,address)   selector 0x46f2d74b
#   - mapping(bytes32 => IntentCommit) public intentCommits returns
#       (bytes32 intentCommitment, bytes32 proofCommitment, bytes32 receiptId,
#        uint256 validUntil, address signer)                          selector 0x9291d3a5
#   The script re-derives topic0, the selectors, and the getter selector with `cast` at runtime and
#   aborts on ANY divergence from the pinned constants below (fail-closed ABI self-proof).
#
# USAGE
#   .\scripts\mainnet\gate-4.1-broadcast.ps1 -ReviewOnly          # full checks + plan preview, NO tx
#   .\scripts\mainnet\gate-4.1-broadcast.ps1                      # checks + confirmation + broadcast + verify
#
# OWNER PRECONDITIONS (performed ONCE by the owner, never automated here):
#   1)  cast wallet import coreguard-anchor --interactive     (prompts for the key, never on argv)
#   2)  write the keystore passphrase ONLY into a gitignored file at a path WITHOUT spaces,
#       e.g. C:\Users\DeLL-L\AppData\Local\Temp\opencode\cg-anchor.pass
#   3)  add to .env:
#         MAINNET_KEYSTORE_ACCOUNT=coreguard-anchor
#         MAINNET_KEYSTORE_PASSWORD_FILE=<absolute space-free path of the passphrase file>
#   The script aborts with these instructions if the keystore/password file are not configured.
#   -ReviewOnly previews everything WITHOUT a keystore (signer-key checks are deferred with an
#   explicit PENDING-OWNER notice); the real run requires the keystore and reverifies all of them.
[CmdletBinding()]
param([switch]$ReviewOnly)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Numerics
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
Set-Location -LiteralPath $repo
$rpc    = "https://rpc.coredao.org"
$reg    = "0x66268a47e81b8f657798d7b5bbedc956df7b13fd"
# Pinned ABI constants (source contracts\EvidenceRegistryV2.sol; sha256 781d55e...f773415).
$TOPIC0_INTENT_COMMITTED = "0x21185740565de73255b4ef838318b711254ec3031e2f21af71bbcf7bef3f8127"
$SEL_COMMIT_INTENT       = "0x4fd0505d"
$SEL_COMMIT_INTENT_DIGEST= "0x46f2d74b"
$SEL_INTENT_COMMITS      = "0x9291d3a5"
$SRC_SHA                 = "0x781d55e7f89722f698424b45758a2ebac7027e63c2c19b79a13ce7887f773415"
$g40Path = "evidence\gate-4.0-identity-preflight.json"
$pfPath  = "evidence\gate-4.1-identity-preflight.json"
$bcPath  = "evidence\gate-4.1-broadcast.json"
$recPath = "evidence\gate-4.1-broadcast-recovery.json"
# Recovery evidence + tx-hash extraction come from the SHARED lib (single source of truth) that is
# ALSO exercised offline by scripts\mainnet\tests\gate-4.1-recovery-harness.ps1 with mocked cast
# output - so the recovery write path is tested WITHOUT ever sending a real transaction.
. (Join-Path $repo "scripts\mainnet\gate-4.1-recovery-lib.ps1")
# Pinned hashes at review freeze (anti-tamper / anti-fallback); their values must NOT be "refreshed"
# silently. If they change, this file must be re-reviewed before any run.
$g40ExpectedSha = "0x675dc752322e28013d3d944ac75acc4cfb468f7638cb7c5e2c9391149049e3cf"
$pfExpectedSha  = "0x61d127f258a781561ffd9c9431efc667c5df111029fc23d03e4fed48304dbccf"
$script:sendApproved = $false
$script:sendDone = $false
$script:lastSendStdout = ""
$script:gotSigner = $false

function Get-Sha256File([string]$p) { "0x" + (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }

# exact, unsigned uint256 hex -> BigInteger (no signed-parsing trap, NO saturation)
function ConvertHexToBigInt([string]$hex) {
  if ($hex -notmatch "^0x[0-9a-fA-F]+$") { throw "[ABORT] bad hex integer: $hex" }
  $digits = $hex.Substring(2)
  if ($digits -eq "") { return [System.Numerics.BigInteger]::Zero }
  if ($digits.Length % 2 -ne 0) { $digits = "0" + $digits }
  $n = $digits.Length / 2
  $bytes = New-Object 'System.Byte[]' $n
  for ($i = 0; $i -lt $n; $i++) { $bytes[$i] = [Convert]::ToByte($digits.Substring($i * 2, 2), 16) }
  [Array]::Reverse($bytes)
  $le = New-Object 'System.Byte[]' ($n + 1)
  [Array]::Copy($bytes, 0, $le, 0, $n)
  $le[$n] = 0
  return [System.Numerics.BigInteger]::new($le)
}

# isolated native runner for cast; the "send" subcommand is REJECTED here (generic path).
# Guards: no --private-key, no bare --password, no raw 64-hex shaped argument. Error messages never
# echo $argList or environment; only exit code + stderr.
function InvokeCast([string[]]$argList) {
  if ($argList[0] -eq "send") { throw "[ABORT] cast 'send' needs the dedicated broadcast runner" }
  foreach ($a in $argList) {
    if ($a -match "^(?i)--private-key$") { throw "[ABORT] --private-key is forbidden" }
    if ($a -match "^(?i)--password=") { throw "[ABORT] passwords are never passed as inline args" }
    if ($a -match "^[0-9a-fA-F]{64}$") { throw "[ABORT] raw 64-hex argument rejected (possible key)" }
  }
  $so = Join-Path $env:TEMP ("cg41b-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg41b-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# THE ONLY broadcast path. Hard conditions: approval flag set in-run by the confirmation step;
# calldata supplied via --data (exact verified bytes); exactly one send per process;
# signer material via keystore (--account / --password-file) ONLY; NO --private-key anywhere.
function InvokeCastSend([string[]]$argList) {
  if (-not $script:sendApproved) { throw "[ABORT] broadcast runner invoked without approval flag" }
  if ($argList[0] -ne "send") { throw "[ABORT] broadcast runner requires the send subcommand" }
  if (($argList -join " ") -notmatch "--data") { throw "[ABORT] broadcast must use --data (verified calldata)" }
  if (($argList -join " ") -match "--private-key") { throw "[ABORT] --private-key is forbidden in the broadcast gate" }
  if ($script:sendDone) { throw "[ABORT] broadcast already executed this process" }
  $so = Join-Path $env:TEMP ("cg41b-send-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg41b-send-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  $script:lastSendStdout = $soOut
  $script:sendDone = $true
  if ($p.ExitCode -ne 0) { throw "BROADCAST CAST ERROR exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# json RPC - READ-ONLY ALLOWLIST only. eth_sendRawTransaction is never issued from here.
function RpcP($method, $params) {
  $allowed = @("eth_chainId","eth_getCode","eth_getTransactionCount","eth_getBalance","eth_call","eth_estimateGas","eth_gasPrice","eth_blockNumber","eth_getTransactionReceipt","eth_getTransactionByHash","eth_getLogs")
  if ($allowed -notcontains $method) { throw "[ABORT] RPC method not allowed: $method" }
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($res.error) { throw "[ABORT] RPC error: $($res.error.message)" }
  return $res.result
}

# eth_call with explicit error-envelope handling (revert => error response, never a result)
function InvokeEthCall([hashtable]$tx) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = "eth_call"; params = @($tx, "latest") } | ConvertTo-Json -Compress -Depth 8
  $resp = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($resp.error) { throw "SIMULATION REVERTED: $($resp.error.message) data=$($resp.error.data)" }
  return $resp.result
}

# .env accessor: address/key-name/paths only; secret VALUES are never printed or written anywhere.
$envLines = Get-Content -LiteralPath (Join-Path $repo ".env")
function EnvVal([string]$name) {
  $hit = $envLines | Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if (-not $hit) { throw "[ABORT] $name missing in .env" }
  return (($hit -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

# ---- ABI self-proof: cast re-derivation must equal the pinned constants (fail-closed) ----
function AssertAbiConsistency {
  $t0 = (InvokeCast @("keccak", "IntentCommitted(bytes32,bytes32,address,uint256,uint256,uint256)")).Trim()
  if ($t0.ToLowerInvariant() -ne $TOPIC0_INTENT_COMMITTED) { throw "[ABORT] event topic0 mismatch: got $t0 pinned $TOPIC0_INTENT_COMMITTED" }
  $s1 = (InvokeCast @("sig", "commitIntent(bytes32,bytes32,address,uint256,bytes)")).Trim()
  if ($s1.ToLowerInvariant() -ne $SEL_COMMIT_INTENT) { throw "[ABORT] commitIntent selector mismatch" }
  $s2 = (InvokeCast @("sig", "commitIntentDigest(bytes32,bytes32,uint256,address)")).Trim()
  if ($s2.ToLowerInvariant() -ne $SEL_COMMIT_INTENT_DIGEST) { throw "[ABORT] commitIntentDigest selector mismatch" }
  $s3 = (InvokeCast @("sig", "intentCommits(bytes32)")).Trim()
  if ($s3.ToLowerInvariant() -ne $SEL_INTENT_COMMITS) { throw "[ABORT] intentCommits getter selector mismatch" }
  $srcSha = Get-Sha256File (Join-Path $repo "contracts\EvidenceRegistryV2.sol")
  if ($srcSha -ne $SRC_SHA) { throw "[ABORT] EvidenceRegistryV2.sol hash changed: $srcSha" }
  "[OK] ABI self-proof: topic0=$t0 selectors=$s1,$s2,$s3 sourceSha=$srcSha"
}

# build + byte-verify calldata via the ABI encoder (same assertions as the preflight gate)
function BuildCallData([string]$sig) {
  if ($sig -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[ABORT] bad signature length" }
  $cd = (InvokeCast @("calldata", "commitIntent(bytes32,bytes32,address,uint256,bytes)", $intentId, $intentCommitment, $want, ("0x" + $validUntil.ToString("x")), $sig))
  if (-not $cd.StartsWith($SEL_COMMIT_INTENT)) { throw "[ABORT] calldata selector mismatch" }
  if ($cd.Substring(266, 64) -ne ("00000000000000000000000000000000000000000000000000000000000000a0")) { throw "[ABORT] bytes offset != 0xa0" }
  if ($cd.Substring(330, 64) -ne ("0000000000000000000000000000000000000000000000000000000000000041")) { throw "[ABORT] bytes length != 0x41" }
  $expLen = 8 + (64 * 5) + 64 + 130 + 62
  if ($cd.Length -ne ($expLen + 2)) { throw "[ABORT] calldata hex len=$($cd.Length) expected=$($expLen + 2)" }
  return $cd
}

# keystore-based signing ONLY (owner-imported). Never reads MAINNET_PRIVATE_KEY.
# Returns $true when the owner signer material is configured (account name or keystore path).
function Test-SignerMaterial {
  $script:ka = $null
  $script:kp = $null
  $ok = $false
  try { $script:ka = EnvVal "MAINNET_KEYSTORE_ACCOUNT"; if ($script:ka) { $ok = $true } } catch { }
  if (-not $ok) { try { $script:kp = EnvVal "MAINNET_KEYSTORE"; if ($script:kp) { $ok = $true } } catch { } }
  return $ok
}

# Resolves keystore wallet args: --account <name> OR --keystore <path>, plus --password-file.
function Get-KeystoreArgs {
  $pw = ""
  try { $pw = EnvVal "MAINNET_KEYSTORE_PASSWORD_FILE" } catch { }
  if (-not $pw) { throw "[ABORT] MAINNET_KEYSTORE_PASSWORD_FILE missing in .env" }
  if ($pw -match "\s") { throw "[ABORT] password file path must not contain spaces (Start-Process arg bound): $pw" }
  if (-not (Test-Path -LiteralPath $pw)) { throw "[ABORT] password file not found: $pw. Owner must create it (gitignored, keystore passphrase only)." }
  if ($script:ka) { return @("--account", $script:ka, "--password-file", $pw) }
  if ($script:kp) { return @("--keystore", $script:kp, "--password-file", $pw) }
  throw "[ABORT] keystore source missing. Set MAINNET_KEYSTORE_ACCOUNT (imported name) or MAINNET_KEYSTORE (path) in .env."
}

# intentCommits(bytes32) getter decoding. cast prints the tuple one ABI output word per line
# (0x-prefixed or bare for small values like 0). Each word is right-aligned to 256 bits; the last
# output is the address word (40 hex). Fail-closed on any structural surprise.
function Get-IntentCommitReadback([string]$argIntentId) {
  $raw = InvokeCast @("call", "--rpc-url", $rpc, $reg, "intentCommits(bytes32)(bytes32,bytes32,bytes32,uint256,address)", $argIntentId)
  $lines = @([string]$raw -split "\r?\n" | Where-Object { $_.Trim() })
  if ($lines.Count -lt 5) { throw "[ABORT] unreadable intentCommits readback: '$raw'" }
  $words = New-Object 'System.Collections.Generic.List[string]'
  $n = 0
  foreach ($ln in $lines) {
    if ($n -ge 5) { break }
    $ln = $ln.Trim()
    if ($ln -match "^0x[0-9a-fA-F]{1,64}$") { $words.Add($ln.Substring(2).ToLowerInvariant()); $n++ }
    elseif ($ln -match "^[0-9]+$") { $words.Add(([Convert]::ToUInt64($ln, 10)).ToString("x64")); $n++ }
    else { throw "[ABORT] malformed intentCommits readback line: '$ln'" }
  }
  if ($words.Count -lt 5) { throw "[ABORT] intentCommits readback incomplete: '$raw'" }
  if ($words[4].Length -lt 40) { throw "[ABORT] malformed signer word in intentCommits readback" }
  return [pscustomobject]@{
    intentCommitment = ("0x" + $words[0]).ToLowerInvariant()
    proofCommitment  = ("0x" + $words[1]).ToLowerInvariant()
    receiptId        = ("0x" + $words[2]).ToLowerInvariant()
    validUntilHex    = $words[3]
    signer           = ("0x" + $words[4].Substring($words[4].Length - 40)).ToLowerInvariant()
  }
}

# ---- A) pinned-archive integrity + no previous broadcast / no unresolved recovery ----
foreach ($pp in @($g40Path, $pfPath)) { if (-not (Test-Path -LiteralPath (Join-Path $repo $pp))) { throw "[ABORT] missing archive: $pp" } }
if ((Get-Sha256File (Join-Path $repo $g40Path)) -ne $g40ExpectedSha) { throw "[ABORT] gate-4.0 hash mismatch (archives changed since freeze)" }
if ((Get-Sha256File (Join-Path $repo $pfPath)) -ne $pfExpectedSha) { throw "[ABORT] gate-4.1 preflight hash mismatch (archives changed since freeze)" }
if (Test-Path -LiteralPath (Join-Path $repo $bcPath)) { throw "[ABORT] gate-4.1-broadcast.json already exists - broadcast already performed" }
if (Test-Path -LiteralPath (Join-Path $repo $recPath)) { throw "[ABORT] gate-4.1-broadcast-recovery.json exists - manual recovery review required before ANY further action" }
$rawPf = Get-Content -LiteralPath (Join-Path $repo $pfPath) -Raw
if ($rawPf -match "authorization|signature|private.?key") { throw "[ABORT] preflight archive must contain no signature/key material" }

$g40 = Get-Content -LiteralPath (Join-Path $repo $g40Path) -Raw | ConvertFrom-Json
$pf  = $rawPf | ConvertFrom-Json
if ($pf.status -ne "PREFLIGHT-ONLY-NOT-BROADCAST") { throw "[ABORT] preflight status is not PREFLIGHT-ONLY-NOT-BROADCAST" }

# ---- B) live chain + registry identity ----
$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[ABORT] chainId=$cid not 1116" }
$runtimeCode = RpcP "eth_getCode" @($reg, "latest")
if (($runtimeCode.Length - 2) / 2 -ne 3128) { throw "[ABORT] registry code length changed (expected 3128)" }
# runtimeCode is the eth_getCode HEX TEXT string ("0x..." ASCII). Two deterministic hash VIEWS are
# computed so there is NO ambiguity about what is being hashed:
#   - runtimeCodeTextSha256  = SHA256(UTF8 bytes of the 0x.. hex TEXT string as returned)
#   - runtimeCodeBytesSha256 = SHA256(RAW bytecode bytes after hex-decoding, 0x stripped)
# Both are recorded in evidence with these explicit names; neither ever mixes the two encodings.
$codeShaText  = Get-HexTextSha256    $runtimeCode
$codeShaBytes = Get-RawBytesSha256   $runtimeCode
"[OK] chainId=1116 (live) | registry=$reg | codeLen=3128 | runtimeCodeTextSha256=$codeShaText | runtimeCodeBytesSha256=$codeShaBytes"

# ---- B2) ABI self-proof (pinned source + runtime re-derivation) ----
AssertAbiConsistency

# ---- B3) deployed ABI fingerprint: the ON-CHAIN bytecode must itself contain the pinned selectors
#         (PUSH4 immediates) and the event topic0 (PUSH32 immediate). A hash alone is not proof that
#         the deployed code behavior matches the ABI; this checks the actual dispatcher/event surface.
$null = Assert-DeployedAbiFingerprint -HexCode $runtimeCode -ExpectedSelectors @($SEL_COMMIT_INTENT, $SEL_COMMIT_INTENT_DIGEST, $SEL_INTENT_COMMITS) -ExpectedTopic0 $TOPIC0_INTENT_COMMITTED
$selSet = Get-DeployedSelectors $runtimeCode
$sortedSels = ($selSet | Sort-Object) -join ","
"[OK] deployed ABI fingerprint: selectors present (PUSH4) = $($SEL_COMMIT_INTENT),$($SEL_COMMIT_INTENT_DIGEST),$($SEL_INTENT_COMMITS); topic0 present (PUSH32) = $TOPIC0_INTENT_COMMITTED; on-chain PUSH4 set ($($selSet.Count) unique): $sortedSels"

# ---- C) canonical identity from gate-4.0 ONLY ----
$intentId = $g40.intentId.value
$intentCommitment = $g40.intentCommitment
$signerArchived = $g40.signer.address
if ($intentId -notmatch "^0x[0-9a-fA-F]{64}$" -or $intentCommitment -notmatch "^0x[0-9a-fA-F]{64}$") { throw "[ABORT] gate-4.0 values malformed" }
"[OK] intentId=$intentId"
"[OK] intentCommitment=$intentCommitment"

$want = EnvVal "MAINNET_DEPLOYER_ADDRESS"
$wantNorm = $want.ToLowerInvariant()
if ($want -notmatch "^0x[0-9a-fA-F]{40}$") { throw "[ABORT] invalid MAINNET_DEPLOYER_ADDRESS" }
if ($want -ine $signerArchived) { throw "[ABORT] MAINNET_DEPLOYER_ADDRESS != gate-4.0 signer" }

# ---- D) intentId FREE check - this is a precondition ONLY; the authoritative check is the
#         contract's AlreadyCommitted revert during commitIntent itself (see section M recovery). ----
$rc = Get-IntentCommitReadback $intentId
if ($rc.signer -ne "0x0000000000000000000000000000000000000000") { throw "[ABORT] intentId already committed (signer=$($rc.signer))" }
"[OK] intentId is FREE (precondition only; contract enforces uniqueness atomically)"

# ---- E) fresh time window (no reuse of the archived preflight window) ----
$nowT = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$validUntil = $nowT + 3600
if ($validUntil -lt ($nowT + 300) -or $validUntil -gt ($nowT + 7200)) { throw "[ABORT] validUntil outside allowed window" }
if ($validUntil -eq $pf.validUntil) { throw "[ABORT] validUntil reused from archived preflight (anti-reuse)" }
"[OK] now=$nowT validUntil=$validUntil (fresh, in-window, != archived $($pf.validUntil))"

# ---- F) signer identity via keystore ONLY (no MAINNET_PRIVATE_KEY is ever read) ----
$kargs = $null
if (Test-SignerMaterial) {
  $kargs = Get-KeystoreArgs
  $addrArgs = @("wallet", "address") + $kargs
  $derived = (InvokeCast $addrArgs).Split("`n") | Select-Object -Last 1
  $derived = $derived.Trim()
  if ($derived -ine $want -or $derived -ine $signerArchived) { throw "[ABORT] keystore derived=$derived want=$want archived=$signerArchived" }
  $script:gotSigner = $true
  "[OK] signer identity verified from keystore: $derived (matches .env + gate-4.0); signing via keystore only"
} elseif ($ReviewOnly) {
  "[REVIEW-ONLY] keystore signer verification DEFERRED (PENDING-OWNER). Missing in .env: MAINNET_KEYSTORE_ACCOUNT / MAINNET_KEYSTORE and/or MAINNET_KEYSTORE_PASSWORD_FILE. Will be enforced at broadcast time."
} else {
  throw "[ABORT] keystore signer material not configured. Owner must run: cast wallet import coreguard-anchor --interactive`n" +
        "then write the passphrase to a gitignored space-free file and set MAINNET_KEYSTORE_ACCOUNT +" +
        " MAINNET_KEYSTORE_PASSWORD_FILE in .env (see header instructions)."
}

# ---- G) nonce / balance / gas price (live; balance as exact BigInteger, NO saturation) ----
$nonce = [Convert]::ToInt64((RpcP "eth_getTransactionCount" @($want, "pending")), 16)
$balHex = RpcP "eth_getBalance" @($want, "latest")
$balanceBig = ConvertHexToBigInt $balHex
$gpHex = RpcP "eth_gasPrice" @()
$gasPrice = [Convert]::ToUInt64($gpHex, 16)
"[OK] nonce=$nonce balanceWei=$balanceBig gasPrice=$gasPrice"

# ---- H) live digest; MUST differ from the archived one (prevents re-signing the old window) ----
$digest = (InvokeCast @("call", "--rpc-url", $rpc, $reg, "commitIntentDigest(bytes32,bytes32,uint256,address)(bytes32)", $intentId, $intentCommitment, ("0x" + $validUntil.ToString("x")), $want)).Trim()
if ($digest -notmatch "^0x[0-9a-fA-F]{64}$") { throw "[ABORT] digest=$digest" }
if ($digest -eq $pf.digest) { throw "[ABORT] digest reused from archived preflight (anti-reuse)" }
"[OK] digest=$digest (fresh, != archived)"

# ---- I + J + K) signature / calldata / simulation. REQUIRES the keystore signer. ----
if ($script:gotSigner) {
  # I) signature - FRESH, local via keystore, never echoed, never persisted
  $signArgs = @("wallet", "sign", "--no-hash") + $kargs + @($digest)
  $sig = (InvokeCast $signArgs).Split("`n") | Select-Object -Last 1
  $sig = $sig.Trim()
  if ($sig -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[ABORT] bad signature" }
  "[OK] fresh authorization signature produced via keystore (length checked, not echoed)"

  # J) calldata: fresh, ABI-encoder, byte-asserted
  $fullCalldata = BuildCallData $sig
  "[VERIFY] calldata selector/offset/len/total OK: $($fullCalldata.Length) hex chars"

  # K) fresh signed eth_call (no revert) + estimateGas + cost check (BigInteger)
  $sim = InvokeEthCall @{ from = $want; to = $reg; data = $fullCalldata; value = "0x0" }
  if ($sim -ne "0x") { throw "[ABORT] eth_call result not empty: '$sim'" }
  "[OK] eth_call = 0x (no revert, real signature accepted at current state)"
  $estHex = (RpcP "eth_estimateGas" @(@{ from = $want; to = $reg; data = $fullCalldata; value = "0x0" }))
  $est = [Convert]::ToInt64($estHex, 16)
  $gasLimit = [math]::Ceiling($est * 1.4)
  if ($gasLimit -lt 21000) { $gasLimit = 21000 }
  if ($gasLimit -gt 300000) { $gasLimit = 300000 }
  $gasCostBig = ([System.Numerics.BigInteger]::new($gasLimit)) * ([System.Numerics.BigInteger]::new($gasPrice))
  $deci = [System.Numerics.BigInteger]::Parse("20000000000000000")
  if ($gasCostBig + $deci -gt $balanceBig) { throw "[ABORT] insufficient balance for gasCost=$gasCostBig + 0.02 CORE margin, balance=$balanceBig" }
  "[OK] estimate=$est gasLimit=$gasLimit gasCostWei=$gasCostBig balanceWei=$balanceBig (BigInteger, no saturation)"
} elseif ($ReviewOnly) {
  $gasLimit = 0; $gasCostBig = [System.Numerics.BigInteger]::Zero; $est = "deferred"; $fullCalldata = "deferred"
  "[REVIEW-ONLY] signature / calldata / eth_call sim / estimateGas DEFERRED (need keystore signer). Will be enforced live at broadcast time."
} else {
  throw "[ABORT] internal: no keystore signer in non-review run (unreachable)"
}

# ---- L) PREVIEW / CONFIRMATION ----
Write-Host ""
Write-Host "=== GATE 4.1 BROADCAST PLAN (IRREVERSIBLE ON MAINNET) ==="
Write-Host "  chainId        : 1116 | registry : $reg"
Write-Host "  signer         : $want | nonce   : $nonce"
if ($script:gotSigner) {
  Write-Host "  signer source  : keystore ($(if ($script:ka) { $script:ka } else { $script:kp }))"
} else {
  Write-Host "  signer source  : PENDING-OWNER keystore (deferred)"
}
Write-Host "  intentId       : $intentId"
Write-Host "  intentCommitment: $intentCommitment"
Write-Host "  validUntil     : $validUntil"
Write-Host "  digest         : $digest"
Write-Host "  calldataLen    : $fullCalldata (byte-verified when signed)"
Write-Host "  gasLimit       : $gasLimit | gasPrice : $gasPrice | gasCost : $gasCostBig"
Write-Host "  balance        : $balanceBig (BigInteger)"
Write-Host "  eth_call       : 0x (accepted) | evidence written AFTER receipt+readback verification"
Write-Host ""
if ($ReviewOnly) {
  "[REVIEW-ONLY] checks passed (signer/sig/sim deferred to broadcast run); NO confirmation requested, NO transaction, NO evidence written."
  exit 0
}
if (-not $script:gotSigner) { throw "[ABORT] keystore signer required for broadcast (not configured)" }
$expectedToken = "CG41-BROADCAST-COMMIT-" + $validUntil
Write-Host "TO BROADCAST YOU MUST TYPE EXACTLY:  $expectedToken"
Write-Host "(3 attempts; anything else aborts without sending)"
$confirmed = $false
for ($i = 1; $i -le 3; $i++) {
  $typed = Read-Host "attempt $i/3"
  if ($typed -eq $expectedToken) { $confirmed = $true; break }
}
if (-not $confirmed) { throw "[ABORT] confirmation mismatch - no transaction was sent" }
$script:sendApproved = $true

# ---- M..Q) THE SINGLE BROADCAST + POST-SEND VERIFICATION, wrapped so that ANY failure after the
#            txHash is known writes a RECOVERY record (never auto-resend). ----
$txHash = $null
$receipt = $null
$failurePhase = ""
try {
  # M) THE SINGLE BROADCAST (signed locally by cast from KEYSTORE; calldata = verified $fullCalldata)
  $failurePhase = "send"
  $sendArgs = @("send", "--rpc-url", $rpc, "--chain", "1116", "--from", $want) + $kargs + @("--nonce", ([string]$nonce), "--gas-price", ([string]$gasPrice), "--gas-limit", ([string]$gasLimit), "--legacy", "--json", $reg, "--data", $fullCalldata)
  $out = InvokeCastSend $sendArgs
  $txHash = ExtractTxHash $out
  if (-not $txHash) { throw "[ABORT] could not parse txHash from cast send output" }
  "[OK] transaction SENT locally: txHash=$txHash"

  # N) post-send verification 1: on-chain blob identity (getTransactionByHash)
  $failurePhase = "blob-identity"
  $tx = RpcP "eth_getTransactionByHash" @($txHash)
  if (-not $tx) { throw "[FAIL] tx not found by hash (network not yet propagated)" }
  if (([string]$tx.from).ToLowerInvariant() -ne $wantNorm) { throw "[FAIL] tx.from mismatch" }
  if (([string]$tx.to).ToLowerInvariant() -ne $reg.ToLowerInvariant()) { throw "[FAIL] tx.to mismatch" }
  if ([Convert]::ToInt64($tx.nonce, 16) -ne $nonce) { throw "[FAIL] tx.nonce mismatch" }
  if (([string]$tx.input).ToLowerInvariant() -ne $fullCalldata.ToLowerInvariant()) { throw "[FAIL] tx.input != verified calldata (calldata divergence)" }
  "[OK] tx blob matches: from/to/nonce/input identical to the reviewed payload"

  # O) post-send verification 2: receipt status=1 + IntentCommitted log (topics[0..3]) + readback
  $failurePhase = "receipt"
  for ($n = 0; $n -lt 60; $n++) {
    $receipt = RpcP "eth_getTransactionReceipt" @($txHash)
    if ($receipt) { break }
    Start-Sleep -Seconds 3
  }
  if (-not $receipt) { throw "[FAIL] no receipt within 180s; DO NOT proceed to Gate 4.2" }
  if ($receipt.status -ne "0x1") { throw "[FAIL] receipt status=$($receipt.status) != 0x1; DO NOT proceed to Gate 4.2" }
  $blockNum = [Convert]::ToInt64($receipt.blockNumber, 16)
  $gasUsed  = [Convert]::ToInt64($receipt.gasUsed, 16)
  $found = $false
  foreach ($lg in @($receipt.logs)) {
    if ($lg.topics.Count -ge 4 -and
        ([string]$lg.topics[0]).ToLowerInvariant() -eq $TOPIC0_INTENT_COMMITTED -and
        ([string]$lg.topics[1]).ToLowerInvariant() -eq $intentId.ToLowerInvariant() -and
        ([string]$lg.topics[2]).ToLowerInvariant() -eq $intentCommitment.ToLowerInvariant() -and
        ([string]$lg.topics[3]).ToLowerInvariant() -eq $wantNorm) { $found = $true; break }
  }
  if (-not $found) { throw "[FAIL] IntentCommitted log (topics 0-3: sig/intentId/commitment/signer) not matched; DO NOT proceed to Gate 4.2" }
  "[OK] receipt status=1 block=$blockNum gasUsed=$gasUsed | IntentCommitted topics[0..3] matched (event layout proof)"

  # P) post-send verification 3: on-chain readback (signer + commitment persisted)
  $failurePhase = "readback"
  $rc2 = Get-IntentCommitReadback $intentId
  if ($rc2.intentCommitment -ne $intentCommitment.ToLowerInvariant()) { throw "[FAIL] readback.intentCommitment mismatch (got $($rc2.intentCommitment))" }
  if ($rc2.signer -ne $wantNorm) { throw "[FAIL] readback.signer mismatch (got $($rc2.signer))" }
  $rcValidUntil = [Convert]::ToInt64($rc2.validUntilHex, 16)
  if ($rcValidUntil -ne $validUntil) { throw "[FAIL] readback.validUntil mismatch (got $rcValidUntil want $validUntil)" }
  "[OK] on-chain readback confirms commitment (signer=$want, commitment stored, validUntil=$validUntil)"

  # Q) evidence (NO key, NO signature, NO raw calldata, NO recovery traces)
  $failurePhase = "evidence"
  $ev = [ordered]@{
    gate = "4.1"; phase = "commit-intent-broadcast"; status = "BROADCAST-SUCCESS"
    chainId = 1116; registry = $reg; signer = $want
    intentId = $intentId; intentCommitment = $intentCommitment; validUntil = $validUntil; nonce = $nonce
    digest = $digest
    gasLimit = $gasLimit; gasUsed = $gasUsed; gasPriceWei = $gasPrice
    txHash = $txHash; blockNumber = $blockNum; receiptStatus = "0x1"
    logIntentCommittedTopicsVerified = $true; readbackSignerVerified = $true; calldataLenHex = $fullCalldata.Length
    abiProof = [ordered]@{
      topic0IntentCommitted = $TOPIC0_INTENT_COMMITTED
      selectorCommitIntent = $SEL_COMMIT_INTENT
      selectorCommitIntentDigest = $SEL_COMMIT_INTENT_DIGEST
      selectorIntentCommits = $SEL_INTENT_COMMITS
      source = "contracts/EvidenceRegistryV2.sol"
      sourceSha256 = $SRC_SHA
      abiDerivedThisRun = $true
    }
    runtimeCodeTextSha256 = $codeShaText
    runtimeCodeBytesSha256 = $codeShaBytes
    signerSource = if ($script:ka) { "keystore://account:" + $script:ka } else { "keystore://" + $script:kp }
    date = (Get-Date).ToUniversalTime().ToString("o")
    note = "Private key, passphrase, signature, and raw calldata intentionally NOT persisted anywhere. Broadcast gate verified receipt status=1, IntentCommitted topics[0..3], and on-chain readback before writing this record. runtimeCodeTextSha256=SHA256 of the eth_getCode 0x.. hex TEXT string; runtimeCodeBytesSha256=SHA256 of the RAW decoded bytecode bytes."
  } | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText((Join-Path $repo $bcPath), $ev, (New-Object Text.UTF8Encoding($false)))
  "[OK] evidence pinned: $bcPath"
} catch {
  $errMsg = [string]$_.Exception.Message
  # A send attempt WAS made (guard set inside InvokeCastSend). A tx may have reached the chain even
  # if cast reported an error (race/AlreadyCommitted revert) and even if no hash was parsed yet.
  # Recovery path NEVER sends anything; it records state and demands manual review. No auto-resend.
  # The recovery record is written by the SHARED lib (Write-RecoveryEvidenceRecord) so the failure
  # paths are exercised offline by the mock harness (real transaction never happens there).
  $calldataSha = if ($fullCalldata -and $fullCalldata -ne "deferred") { Get-HexTextSha256 $fullCalldata } else { "" }
  $ref = { param() Get-IntentCommitReadback $intentId }
  try {
    $rec = Write-RecoveryEvidenceRecord -RecPath (Join-Path $repo $recPath) `
           -FailurePhase $failurePhase -Reason $errMsg -SendAttempted $script:sendDone `
           -TxHash $txHash -LastSendStdout $script:lastSendStdout `
           -From $want -To $reg -Nonce ([string]$nonce) -GasLimit ([string]$gasLimit) -GasPriceWei ([string]$gasPrice) `
           -IntentId $intentId -IntentCommitment $intentCommitment -ValidUntil ([string]$validUntil) `
           -CalldataSha256 $calldataSha -ReadbackProvider $ref
    throw "gate-4.1 broadcast failed at phase '$failurePhase' AFTER a send attempt. Recovery record written to $recPath. Manual review required; DO NOT auto-resend."
  } catch {
    if ($_.Exception.Message -like "[CLEAN-ABORT]*") { throw "gate-4.1 broadcast failed at phase '$failurePhase' (no send attempted - no transaction reached the chain). $errMsg" }
    throw
  }
}

"[GATE 4.1 BROADCAST COMPLETE] txHash=$txHash status=1 - STOPPED before Gate 4.2 (separate review+GO required)"