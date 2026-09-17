# GATE 3.2-probe -- identify EXACT on-chain contract at anchor via runtime byte comparison + view calls.
# ASCII-ONLY. Read-only, zero-gas. Fail-closed: no broadcast, prints verdict for the operator.
$ErrorActionPreference = "Stop"
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
$anchor = "0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E"
$rpc = "https://rpc.coredao.org"
Set-Location -LiteralPath $repo

function InvokeCast([string[]]$argList) {
  $so = Join-Path $env:TEMP ("cgpr-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cgpr-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  $seOut = ""; if (Test-Path -LiteralPath $se) { $seOut = (Get-Content -LiteralPath $se -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode): $seOut" }
  return $soOut.Trim()
}

# on-chain runtime via raw json-rpc (immune to cast env quirks)
$body = @{ jsonrpc = "2.0"; id = 1; method = "eth_getCode"; params = @($anchor) } | ConvertTo-Json -Compress
$onchain = (Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30).result
"[probe] onchain runtime len=$($onchain.Length)"
if ($onchain.Length -lt 200) { throw "[FAIL-CLOSED] anchor has no code" }
$onchainHash = (([System.Text.Encoding]::ASCII.GetString([System.Text.Encoding]::Default.GetBytes($onchain))))
$onchainKeccak = (InvokeCast @("keccak", $onchain))

foreach ($name in @("EvidenceRegistry", "EvidenceRegistryV2")) {
  $local = (InvokeCast @("forge", "inspect", "contracts/$name.sol:$name", "runtime-code"))
  $lHash = (InvokeCast @("keccak", $local))
  $match = if ($lHash -ieq $onchainKeccak) { "MATCH-ON-CHAIN" } else { "different" }
  "[probe] $name runtime len=$(($local.Length))  keccak=$($lHash.Substring(0,18))...  => $match"
}

# read-only view probe on the anchor to see which interface responds
foreach ($probe in @(
  @("VERSION()", "VERSION"),
  @("domainSeparator()", "domainSeparator"),
  @("VERSION_KECCAK()", "VERSION_KECCAK")
)) {
  $sig = $probe[0]; $label = $probe[1]
  $argsA = @("call", "--rpc-url", $rpc, $anchor, $sig)
  $so2 = Join-Path $env:TEMP ("cgpr-v-o-" + [guid]::NewGuid() + ".txt")
  $se2 = Join-Path $env:TEMP ("cgpr-v-e-" + [guid]::NewGuid() + ".txt")
  $p2 = Start-Process -FilePath "cast" -ArgumentList $argsA -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so2 -RedirectStandardError $se2
  $o2 = ""; if (Test-Path -LiteralPath $so2) { $o2 = (Get-Content -LiteralPath $so2 -Raw -ErrorAction SilentlyContinue) }
  $e2 = ""; if (Test-Path -LiteralPath $se2) { $e2 = (Get-Content -LiteralPath $se2 -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so2, $se2 -Force -ErrorAction SilentlyContinue
  if ($p2.ExitCode -eq 0 -and $o2.Trim()) { "[probe] $label => OK: $($o2.Trim())" }
  else { "[probe] $label => revert/unavailable" }
}
"[probe] done (zero-gas, read-only). No broadcast performed."