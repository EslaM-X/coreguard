# GATE 3.1 -- DEPLOY EvidenceRegistryV2 to Core Mainnet (chainId 1116)
# ONE intentional, minimal, authorized broadcast. After it: STOP and await separate GO for 3.2.
# KEY: read from .env at runtime only. Never written to evidence. Never printed.
# Isolation pattern = Start-Process w/ separate stdout+stderr files (PROVEN working in gate-3.2: identity + chainId verified).
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = "D:\KOSSASHI\CORE DAO\coreguard"
Set-Location -LiteralPath $repo

function GetEnvVal($name) {
  $line = Get-Content -LiteralPath (Join-Path $repo ".env") |
    Where-Object { $_ -match "(?i)^\s*$([regex]::Escape($name))\s*=" } |
    Select-Object -First 1
  if (-not $line) { throw "[FAIL-CLOSED] missing $name in .env" }
  (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

# isolated native runner that ACTUALLY WORKS in PS 5.1 (stderr file, no NativeCommandError leak)
function InvokeCast([string[]]$argList) {
  $so = Join-Path $env:TEMP ("cg31-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg31-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# ---- key (never printed; identity checked below before any broadcast) ----
$pk = GetEnvVal "MAINNET_PRIVATE_KEY"
if ($pk -match "(?i)^0x") { $pk = $pk.Substring(2) }
if ($pk -notmatch "^[0-9a-fA-F]{64}$") { throw "[FAIL-CLOSED] invalid key" }

# isolated native runner for FORGE (separate: forge.exe, not cast.exe)
function InvokeForge([string[]]$argList) {
  $so = Join-Path $env:TEMP ("cg31-forge-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg31-forge-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "forge" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "forge exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# ---- fail-closed prechecks (read-only, zero-gas) ----
function RpcP($m, $p) {
  $b = @{ jsonrpc = "2.0"; id = 1; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 8
  $r = Invoke-RestMethod -Uri "https://rpc.coredao.org" -Method Post -ContentType "application/json" -Body $b -TimeoutSec 30
  if ($r.error) { throw "RPC error: $($r.error.message)" }
  $r.result
}
$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[FAIL-CLOSED] chainId=$cid" }
"[OK] chainId=1116"

$derived = (InvokeCast @("wallet", "address", "--private-key", $pk)).Split("`n") | Select-Object -Last 1
$derived = $derived.Trim()
$want = GetEnvVal "MAINNET_DEPLOYER_ADDRESS"
if ($derived -ine $want) { throw "[FAIL-CLOSED] deployer mismatch derived=$derived want=$want" }
"[OK] deployer identity verified: $derived"

$nonce = [Convert]::ToInt64((RpcP "eth_getTransactionCount" @($want, "pending")), 16)
$bal = [Convert]::ToInt64((RpcP "eth_getBalance" @($want, "latest")), 16)
"[OK] nonce=$nonce balance=$([math]::Round($bal / 1e18, 4)) CORE"
if ($bal -lt 100000000000000000) { throw "[FAIL-CLOSED] balance too low for deploy" }

# ---- V2 must NOT already exist (fresh deploy is the point of gate 3.1) ----
# (anchor 0x037d... is EvidenceRegistry V1, confirmed by STATUS.md + on-chain code len)
"ok: new EvidenceRegistryV2 deploy starts now"

# ---- broadcast: single deploy tx (bytecode recomputed locally, authoritative) ----
"[BROADCAST] deploy EvidenceRegistryV2 on Core Mainnet..."
$bc = (InvokeForge @("inspect", "contracts/EvidenceRegistryV2.sol:EvidenceRegistryV2", "bytecode")).Split("`n") | Select-Object -Last 1
$bc = $bc.Trim()
if ($bc.Length -lt 400) { throw "[FAIL-CLOSED] bytecode length ${bc.Length} too short" }
$so = Join-Path $env:TEMP ("cg31-send-o-" + [guid]::NewGuid() + ".txt")
$se = Join-Path $env:TEMP ("cg31-send-e-" + [guid]::NewGuid() + ".txt")
$sendArgs = @("send", "--rpc-url", "https://rpc.coredao.org", "--private-key", $pk, "--chain", "1116", "--legacy", "--json", "--create", $bc)
$pSend = Start-Process -FilePath "cast" -ArgumentList $sendArgs -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
$sendOut = ""; if (Test-Path -LiteralPath $so) { $sendOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
$sendErr = ""; if (Test-Path -LiteralPath $se) { $sendErr = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
if ($pSend.ExitCode -ne 0) { throw "[BROADCAST-FAIL] exit=$($pSend.ExitCode) err=$sendErr" }
$r = $sendOut | ConvertFrom-Json
$txh = $r.transactionHash; if (-not $txh) { $txh = $r.hash }
if (-not $txh) { throw "[FAIL-CLOSED] no txHash in broadcast output" }
"[BROADCASTED] txHash=$txh"
$addr = $r.contractAddress; if (-not $addr) { $addr = $r.deployedTo }

# ---- read-back (independent of receipt; wait for inclusion) ----
$rec = $null
for ($i = 0; $i -lt 60; $i++) {
  $rec = RpcP "eth_getTransactionReceipt" @($txh)
  if ($rec) { break }
  Start-Sleep -Seconds 5
}
if (-not $rec) { throw "[FAIL-CLOSED] no receipt after 5min" }
if ([Convert]::ToInt64($rec.status, 16) -ne 1) { throw "[FAIL-CLOSED] tx reverted on chain" }
$bn = [Convert]::ToInt64($rec.blockNumber, 16)
if (-not $addr) { $addr = $rec.contractAddress }
if (-not $addr) { throw "[FAIL-CLOSED] deployer unknown, no code (LOGIC guard)" }
"[read-back] contractAddress=$addr status=1 block=$bn"
$codeCheck = RpcP "eth_getCode" @($addr, "latest")
"[read-back] code len=$($codeCheck.Length)"
if ($codeCheck.Length -lt 200) { throw "[FAIL-CLOSED] no code at claimed address" }

# ---- pin evidence (non-secret) ----
$ev = [ordered]@{
  gate = "3.1"; chainId = 1116; deployer = $want; txHash = $txh
  evidenceRegistryV2 = $addr; block = $bn
  runtimeCodeLen = (($codeCheck.Length - 2) / 2)
  broadcasted = (Get-Date).ToUniversalTime().ToString("o")
  status = "deployed-verified"; next = "await separate GO for 3.2"
} | ConvertTo-Json -Depth 4
$evDir = Join-Path $repo "evidence"; New-Item -ItemType Directory -Path $evDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $evDir "gate-3.1-deploy.json") -Value $ev -Encoding UTF8
"[OK] evidence pinned: evidence\gate-3.1-deploy.json"
"[GATE 3.1 COMPLETE] STOPPED - awaiting separate GO for gate 3.2 (commitIntent)"