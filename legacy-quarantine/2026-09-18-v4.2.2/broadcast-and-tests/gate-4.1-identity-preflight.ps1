# GATE 4.1 -- commitIntent PREFLIGHT (unsigned + simulation only) -- Core Mainnet 1116
# NO BROADCAST. NO eth_sendRawTransaction. NO cast send. Simulation + estimate + review output only.
# Modeled 1:1 on scripts/mainnet/gate-3.2-commitintent.ps1 (same isolated native runners, RpcP, EnvVal).
# calldata is built by the REAL ABI encoder (cast calldata), never by hand concatenation, then verified.
# Key: read from .env at runtime only; NEVER printed or written to evidence.
# Fail-closed: every assertion must pass; otherwise abort BEFORE any signing/simulation step.
# Usage:
#   .\scripts\mainnet\gate-4.1-identity-preflight.ps1            -> unsigned review block only, stops before signing
#   .\scripts\mainnet\gate-4.1-identity-preflight.ps1 -Sign       -> local signing + signed eth_call + estimateGas (STILL no broadcast)
[CmdletBinding()]
param([switch]$Sign)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
Set-Location -LiteralPath $repo
$gate40 = "evidence\gate-4.0-identity-preflight.json"
$rpc = "https://rpc.coredao.org"
$reg  = "0x66268a47e81b8f657798d7b5bbedc956df7b13fd"
$sel  = "0x4fd0505d"   # commitIntent(bytes32,bytes32,address,uint256,bytes)

# isolated native runner for cast (stderr to temp file; same pattern as gate-3.2)
function InvokeCast([string[]]$argList) {
  if ($argList[0] -eq "send") { throw "[FAIL-CLOSED] cast 'send' is blocked in this gate (broadcast lives in a separate script)" }
  $so = Join-Path $env:TEMP ("cg41-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg41-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# json RPC -- READ-ONLY ALLOWLIST ONLY. eth_sendRawTransaction is NOT allowed here and can
# never execute through this gate; broadcast lives in a separate script, never in this file.
function RpcP($method, $params) {
  $allowed = @("eth_chainId","eth_getCode","eth_getTransactionCount","eth_getBalance","eth_call","eth_estimateGas","eth_blockNumber","eth_getTransactionReceipt","eth_getTransactionByHash","eth_getLogs")
  if ($allowed -notcontains $method) { throw "[FAIL-CLOSED] RPC method not allowed: $method" }
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($res.error) { throw "RPC error: $($res.error.message)" }
  return $res.result
}

# .env accessor (address + key name only, like gate-3.2; key value never shown)
$envLines = Get-Content -LiteralPath (Join-Path $repo ".env")
function EnvVal([string]$name) {
  $hit = $envLines | Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if (-not $hit) { throw "[FAIL-CLOSED] $name missing in .env" }
  return (($hit -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

# build + verify calldata via the ABI encoder (0x selector + 5 head words + 0x41 len + 65B sig + 31B pad = 292 B)
function BuildCallData([string]$sig) {
  if ($sig -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[FAIL-CLOSED] bad signature length" }
  $cd = (InvokeCast @("calldata", "commitIntent(bytes32,bytes32,address,uint256,bytes)", $intentId, $intentCommitment, $want, ("0x" + $validUntil.ToString("x")), $sig))
  if (-not $cd.StartsWith($sel)) { throw "[FAIL-CLOSED] calldata selector mismatch: $($cd.Substring(0,10))" }
  if ($cd.Substring(266, 64) -ne ("00000000000000000000000000000000000000000000000000000000000000a0")) { throw "[FAIL-CLOSED] bytes offset != 0xa0" }
  if ($cd.Substring(330, 64) -ne ("0000000000000000000000000000000000000000000000000000000000000041")) { throw "[FAIL-CLOSED] bytes length != 0x41" }
  $expLen = 8 + (64 * 5) + 64 + 130 + 62   # selector + 5 head words + len word + 65B sig + 31B pad = 584 payload hex chars
  if ($cd.Length -ne ($expLen + 2)) { throw "[FAIL-CLOSED] calldata hex len=$($cd.Length) expected=$($expLen + 2) (incl 0x)" }
  return $cd
}

# ----------------------------------------------------------------------------
# BROADCAST ISOLATION -- PRIMARY CONTROL = the code itself has NO broadcast call, and the
# only two execution boundaries are fenced: InvokeCast rejects the cast "send" subcommand,
# and RpcP allows READ-ONLY methods only (eth_sendRawTransaction is not in the allowlist).
# CG41_PERMIT_BROADCAST is an accident kill-switch, NOT a security boundary. Broadcast, when
# authorized, will live ONLY in a separate script (gate-4.1-broadcast.ps1), never here.
# ----------------------------------------------------------------------------
if ($env:CG41_PERMIT_BROADCAST) { throw "[FAIL-CLOSED] CG41_PERMIT_BROADCAST must never be set for this gate" }

# ---- 1) live chain + registry verification (read-only) ----
$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[FAIL-CLOSED] chainId=$cid not 1116" }
"[OK] chainId=1116 (Core Mainnet, live)"
$code = RpcP "eth_getCode" @($reg, "latest")
$codeLen = ($code.Length - 2) / 2
if ($codeLen -ne 3128) { throw "[FAIL-CLOSED] registry code len=$codeLen at $reg not 3128" }
"[OK] registry=$reg codeLen=$codeLen (matches evidence)"

# ---- 2) fixed, non-circular record from Gate 4.0 (never recomputed here from guesses) ----
if (-not (Test-Path -LiteralPath (Join-Path $repo $gate40))) { throw "[FAIL-CLOSED] $gate40 missing" }
$g40 = Get-Content -LiteralPath (Join-Path $repo $gate40) -Raw | ConvertFrom-Json
$intentId = $g40.intentId.value
$intentCommitment = $g40.intentCommitment
if ($intentId -notmatch "^0x[0-9a-fA-F]{64}$" -or $intentCommitment -notmatch "^0x[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] gate-4.0 values malformed" }
"[OK] intentId=$($intentId.Substring(0,18))... intentCommitment=$($intentCommitment.Substring(0,18))... (from $gate40)"

# ---- 3) key + signer identity (fail-closed; address cross-checked, key never printed) ----
$pk = EnvVal "MAINNET_PRIVATE_KEY"
if ($pk -match "(?i)^0x") { $pk = $pk.Substring(2) }
if ($pk -notmatch "^[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] invalid key format" }
$want = EnvVal "MAINNET_DEPLOYER_ADDRESS"
$derived = (InvokeCast @("wallet", "address", "--private-key", $pk)).Split("`n") | Select-Object -Last 1
$derived = $derived.Trim()
if ($derived -ine $want) { throw "[FAIL-CLOSED] derived=$derived want=$want" }
if ($derived -ine $g40.signer.address) { throw "[FAIL-CLOSED] signer differs from gate-4.0 $($g40.signer.address)" }
"[OK] signer identity verified: $derived (matches .env AND gate-4.0)"

# ---- 4) runtime window + nonce + balance (read-only; unsigned UInt64 parse, no signed/hex two's-complement pitfalls) ----
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$validUntil = $now + 3600
$nonceHex = RpcP "eth_getTransactionCount" @($want, "pending")
$nonce = [Convert]::ToInt64($nonceHex, 16)
$balHex = (RpcP "eth_getBalance" @($want, "latest"))
if (-not $balHex -or $balHex -notmatch "^0x[0-9a-fA-F]+$") { throw "[FAIL-CLOSED] bad balance response" }
$digits = $balHex.Substring(2)
if ($digits.Length -gt 16) {
  "[OK] validUntil=$validUntil (now=$now, +3600s) nonce=$nonce balance > UInt64.MaxValue wei (>= 18.44 CORE; no overflow concern)"
} else {
  $bal = [Convert]::ToUInt64($digits, 16)   # Convert.ToUInt64(hex,16) = UNSIGNED hex; throws only on > 2^64-1, never negative
  if ($bal -lt 50000000000000000) { throw "[FAIL-CLOSED] balance too low for a future broadcast" }
  "[OK] validUntil=$validUntil (now=$now, +3600s) nonce=$nonce balance=$bal wei"
}

# ---- 5) EIP-712 digest from the ACTUAL contract (authoritative, read-only) ----
$digest = (InvokeCast @("call", "--rpc-url", $rpc, $reg, "commitIntentDigest(bytes32,bytes32,uint256,address)(bytes32)", $intentId, $intentCommitment, ("0x" + $validUntil.ToString("x")), $want)).Trim()
if ($digest -notmatch "^0x[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] digest=$digest" }
"[OK] commitIntentDigest=$digest"

# ---- 6) REVIEW BLOCK (unsigned calldata preview produced by the ABI ENCODER; NO signature generated yet) ----
$placeholderSig = "0x" + ("00" * 65)
$previewCd = BuildCallData $placeholderSig
"[OK] preview calldata built by cast calldata (placeholder 65B sig): len=$($previewCd.Length) hex chars"
Write-Host ""
Write-Host "=== GATE 4.1 PREFLIGHT (NO BROADCAST) ==="
Write-Host "  selector         : $sel"
Write-Host "  registry         : $reg (codeLen $codeLen)"
Write-Host "  chainId          : 1116 (live)"
Write-Host "  signer           : $want"
Write-Host "  nonce            : $nonce"
Write-Host "  validUntil       : $validUntil"
Write-Host "  intentId         : $intentId"
Write-Host "  intentCommitment : $intentCommitment"
Write-Host "  digest           : $digest"
Write-Host "  HEAD (casts)     : offset[bytes]=0xa0 (5x32B head) | length[bytes]=0x41 (65B) | tail=65B sig + 31B pad = 96B | total=292B"
Write-Host "  previewCalldata  : $previewCd"
Write-Host "  SIGNING          : LOCAL OWNER ONLY next (unsigned unless -Sign is passed)"
Write-Host ""

# ---- 7) optional LOCAL signing + signed simulation (only when explicitly permitted by the owner) ----
if (-not $Sign) {
  "[STOPPED] not signing; review the block above. Re-run with -Sign only after explicit owner review + GO."
  exit 0
}

$sig = (InvokeCast @("wallet", "sign", "--private-key", $pk, "--no-hash", $digest)).Split("`n") | Select-Object -Last 1
$sig = $sig.Trim()
if ($sig -notmatch "^0x[0-9a-fA-F]{130}$") { throw "[FAIL-CLOSED] bad signature" }
"[OK] authorization signature produced locally (length checked, not echoed)"

# ---- 8) full signed calldata via the ABI encoder + exact verification ----
$fullCalldata = BuildCallData $sig
"[VERIFY] signed calldata selector/offset/len/total all pass: $($fullCalldata.Length) hex chars"

# ---- 9) simulation via eth_call (exact signed payload, NO state change) ----
# Reliable success/failure: JSON-RPC eth_call reports a REVERT as an RPC *error response*
# (error.message = revert reason, optional error.data = revert payload), never as a result.
# Success comes back as the ABI return data. commitIntent has VOID ABI (returns ()), so on
# success the result MUST be exactly "0x". Detection is therefore ABI-driven: failure via
# the error envelope, plus an empty-result assertion for the void type. We do NOT assume
# "non-empty return data == failure" as a generic rule.
# Context for the reviewer: this verifies ALL on-chain conditions (AlreadyCommitted/Expired/
# InvalidAuthority) against CURRENT state with the REAL signature; the independent off-chain
# digest match (section 5 + reviews/gate-4.1-preflight-review.md) proves only that the digest
# binds these exact inputs. State can drift between simulation and a later broadcast, which
# the separate broadcast gate must re-check.
function InvokeEthCall([hashtable]$tx) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = "eth_call"; params = @($tx, "latest") } | ConvertTo-Json -Compress -Depth 8
  $resp = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($resp.error) { throw "SIMULATION REVERTED: $($resp.error.message) data=$($resp.error.data)" }
  return $resp.result
}
$sim = InvokeEthCall @{ from = $want; to = $reg; data = $fullCalldata; value = "0x0" }
if ($sim -ne "0x") { throw "[FAIL-CLOSED] VOID ABI returned non-empty data: '$sim'" }
"[OK] eth_call simulation PASSED: no revert; the deployed contract accepted the REAL signature at current state. Nothing was broadcast."

# ---- 10) gas estimate (dry-run, no broadcast) ----
$estHex = RpcP "eth_estimateGas" @(@{ from = $want; to = $reg; data = $fullCalldata; value = "0x0" })
$est = [Convert]::ToInt64($estHex, 16)
"[OK] eth_estimateGas = $est wei-gas (no tx sent)"

# ---- 11) pin PREFLIGHT evidence (NO txHash; predictable fields only; signature NEVER persisted) ----
$ev = [ordered]@{
  gate = "4.1"; phase = "preflight"; status = "PREFLIGHT-ONLY-NOT-BROADCAST"
  chainId = 1116; registry = $reg; signer = $want; selector = $sel
  intentId = $intentId; intentCommitment = $intentCommitment
  validUntil = $validUntil; nonce = $nonce
  digest = $digest
  abiEncode = @{ offsetBytes = "0xa0"; lengthBytes = "0x41"; sigBytes = 65; padBytes = 31; tailBytes = 96; totalBytes = ($fullCalldata.Length - 2) / 2 }
  calldataLenHex = $fullCalldata.Length
  simulationEthCall = $sim; gasEstimateWei = $est
  txHash = $null
  date = (Get-Date).ToUniversalTime().ToString("o")
  note = "NO broadcast performed by this gate; eth_sendRawTransaction/cast send are forbidden here. Broadcast requires signed-simulation review + separate explicit GO."
} | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $repo "evidence\gate-4.1-identity-preflight.json"), $ev, (New-Object Text.UTF8Encoding($false)))
"[OK] preflight evidence pinned: evidence\gate-4.1-identity-preflight.json"
"[GATE 4.1 PREFLIGHT COMPLETE] STOPPED - awaiting separate explicit broadcast GO (gate-4.1-broadcast)"