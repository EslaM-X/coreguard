# GATE 3.6 -- FREEZE evidence artifact. Zero-gas, read-only, NO secrets.
# ASCII-ONLY. Aggregates gate-3.1..3.5 evidence + registry truth into a single frozen rollup with SHA256 pins.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
$rpc = "https://rpc.coredao.org"
Set-Location -LiteralPath $repo
$evDir = Join-Path $repo "evidence"
$ev32 = Get-Content -LiteralPath (Join-Path $evDir "gate-3.2-commitintent.json") -Raw | ConvertFrom-Json
$anchor = $ev32.registry

function RpcP($method, $params) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($res.error) { throw "RPC error: $($res.error.message)" }
  return $res.result
}

$need = @("gate-3.1-deploy.json", "gate-3.2-commitintent.json", "gate-3.3-anchorproof.json", "gate-3.4-readback.json", "gate-3.5-independent-verify.json")
foreach ($f in $need) { if (-not (Test-Path -LiteralPath (Join-Path $evDir $f))) { throw "[FAIL-CLOSED] missing $f" } }

$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[FAIL-CLOSED] chainId=$cid" }
$code = RpcP "eth_getCode" @($anchor, "latest")
if ($code.Length -lt 200) { throw "[FAIL-CLOSED] no code at registry" }

$files = @()
$hashes = @()
foreach ($f in (@($need) + @("gate-3.0-preflight.json"))) {
  $full = Join-Path $evDir $f
  if (-not (Test-Path -LiteralPath $full)) { continue }
  $files += $f
  $hashes += (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
}

$rollup = [ordered]@{
  phase = 3
  frozen = (Get-Date).ToUniversalTime().ToString("o")
  chainId = 1116
  registryV2 = $anchor
  registryCodeLen = (($code.Length - 2) / 2)
  evidenceFiles = $files
  sha256 = $hashes
  summary = "EvidenceRegistryV2 deployed + intent + proof anchored + readback + independent verify + freeze"
  note = "NON-SECRET evidence; private keys never written to evidence"
} | ConvertTo-Json -Depth 5
$freezePath = Join-Path $evDir "phase-3-evidence-freeze.json"
Set-Content -LiteralPath $freezePath -Value $rollup -Encoding UTF8
"[OK] frozen rollup: evidence\phase-3-evidence-freeze.json"
"[OK] files pinned: $($files -join ', ')"
"[GATE 3.6 COMPLETE (zero-gas)] PHASE-3 EVIDENCE FROZEN"